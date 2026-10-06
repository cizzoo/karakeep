import {
  adapter,
  ChildNode,
  Element,
  getAttr,
  hasAttr,
  isDeclarativeShadowRoot,
  isElement,
  isTemplate,
  isText,
  ParentNode,
  textContent,
} from "./dom";
import { escapeText } from "./tokens";

const BLOCK_TAGS = new Set(
  (
    "address article aside blockquote body caption dd details dialog div dl dt fieldset figcaption figure footer form " +
    "h1 h2 h3 h4 h5 h6 header hgroup hr html li main nav ol p section summary table tbody thead tfoot tr td th ul " +
    "pre colgroup col menu head center"
  ).split(" "),
);

const EXCLUDED_TAGS = new Set(
  (
    "script style noscript iframe object embed canvas video audio svg math textarea select option input pre " +
    "code kbd samp var tt rt rp template"
  ).split(" "),
);

const VERBATIM_TAGS = new Set(["code", "kbd", "samp", "var", "tt"]);

export type Kind = "container" | "skip" | "void" | "verbatim" | "inline";

export function isExcludedByAttr(el: Element): boolean {
  if (getAttr(el, "translate")?.trim().toLowerCase() === "no") return true;
  if (hasAttr(el, "hidden")) return true;
  const cls = getAttr(el, "class");
  return !!cls && /(^|\s)notranslate(\s|$)/.test(cls);
}

const kindCache = new WeakMap<Element, Kind>();

export function kindOf(el: Element): Kind {
  const cached = kindCache.get(el);
  if (cached) return cached;
  const k = computeKind(el);
  kindCache.set(el, k);
  return k;
}

function computeKind(el: Element): Kind {
  const tag = el.tagName;
  if (isDeclarativeShadowRoot(el)) return "container";
  if (tag === "template") return "void";
  if (VERBATIM_TAGS.has(tag)) return "verbatim";
  if (EXCLUDED_TAGS.has(tag) || isExcludedByAttr(el)) {
    return BLOCK_TAGS.has(tag) ? "skip" : "void";
  }
  if (BLOCK_TAGS.has(tag)) return "container";
  for (const c of el.childNodes) {
    if (isElement(c)) {
      const k = kindOf(c);
      if (k === "container" || k === "skip") return "container";
    }
  }
  return "inline";
}

/** Is there any non-whitespace translatable text below this inline element? */
function hasText(el: Element): boolean {
  for (const c of el.childNodes) {
    if (isText(c)) {
      if (/[^ \t\n\r\f]/.test(c.value)) return true;
    } else if (isElement(c) && kindOf(c) === "inline" && hasText(c)) {
      return true;
    }
  }
  return false;
}

export interface Placeholder {
  kind: "pair" | "void" | "verbatim";
  el: ChildNode;
}

export interface Unit {
  id: number;
  kind: "run" | "attr";
  /** Trimmed, whitespace-collapsed encoded text. */
  encoded: string;
  lead: string;
  trail: string;
  plain: string;
  placeholders: Map<number, Placeholder>;
  // run
  parent?: ParentNode;
  nodes?: ChildNode[];
  // attr
  attrEl?: Element;
  attrName?: string;
}

interface EncodeCtx {
  n: number;
  placeholders: Map<number, Placeholder>;
  plain: string[];
}

function encodeNodes(nodes: ChildNode[], ctx: EncodeCtx): string {
  let out = "";
  for (const node of nodes) {
    if (isText(node)) {
      ctx.plain.push(node.value);
      out += escapeText(node.value);
    } else if (isElement(node)) {
      const k = kindOf(node);
      const n = ++ctx.n;
      if (k === "verbatim") {
        ctx.placeholders.set(n, { kind: "verbatim", el: node });
        out += `<c${n}>${escapeText(textContent(node))}</c${n}>`;
      } else if (k === "inline" && hasText(node)) {
        ctx.placeholders.set(n, { kind: "pair", el: node });
        out += `<x${n}>${encodeNodes(node.childNodes, ctx)}</x${n}>`;
      } else {
        ctx.placeholders.set(n, { kind: "void", el: node });
        out += `<x${n}/>`;
      }
    } else if (adapter.isCommentNode(node)) {
      const n = ++ctx.n;
      ctx.placeholders.set(n, { kind: "void", el: node });
      out += `<x${n}/>`;
    }
  }
  return out;
}

const WS = "[ \\t\\n\\r\\f]";
const LEAD_RE = new RegExp(`^${WS}+`);
const TRAIL_RE = new RegExp(`${WS}+$`);
const COLLAPSE_RE = new RegExp(`${WS}+`, "g");

function finishEncoded(raw: string) {
  const lead = LEAD_RE.exec(raw)?.[0] ?? "";
  const rest = raw.slice(lead.length);
  const trail = TRAIL_RE.exec(rest)?.[0] ?? "";
  const body = rest.slice(0, rest.length - trail.length);
  return { lead, trail, encoded: body.replace(COLLAPSE_RE, " ") };
}

const LETTER_RE = /\p{L}/u;

export function hasLetters(s: string): boolean {
  return LETTER_RE.test(s);
}

export function makeRunUnit(
  id: number,
  parent: ParentNode,
  nodes: ChildNode[],
): Unit | null {
  const ctx: EncodeCtx = { n: 0, placeholders: new Map(), plain: [] };
  const raw = encodeNodes(nodes, ctx);
  const plain = ctx.plain.join("");
  if (!hasLetters(plain)) return null;
  const { lead, trail, encoded } = finishEncoded(raw);
  return {
    id,
    kind: "run",
    encoded,
    lead,
    trail,
    plain,
    placeholders: ctx.placeholders,
    parent,
    nodes,
  };
}

function makeAttrUnit(
  id: number,
  el: Element,
  name: string,
  value: string,
): Unit | null {
  if (!hasLetters(value)) return null;
  const { lead, trail, encoded } = finishEncoded(escapeText(value));
  return {
    id,
    kind: "attr",
    encoded,
    lead,
    trail,
    plain: value,
    placeholders: new Map(),
    attrEl: el,
    attrName: name,
  };
}

/** Collect run units below `parent` (document order). */
function walkChildren(
  parent: ParentNode,
  out: (nodes: ChildNode[], parent: ParentNode) => void,
) {
  let run: ChildNode[] = [];
  const flush = () => {
    if (run.length > 0) out(run, parent);
    run = [];
  };
  for (const child of parent.childNodes) {
    if (isElement(child)) {
      const k = kindOf(child);
      if (k === "container") {
        flush();
        if (isTemplate(child))
          walkChildren(adapter.getTemplateContent(child), out);
        else walkChildren(child, out);
        continue;
      }
      if (k === "skip") {
        flush();
        continue;
      }
      run.push(child);
    } else if (isText(child) || adapter.isCommentNode(child)) {
      run.push(child);
    }
  }
  flush();
}

function collectAttrs(
  parent: ParentNode,
  out: (el: Element, name: string, value: string) => void,
) {
  for (const c of parent.childNodes) {
    if (!isElement(c)) continue;
    if (isDeclarativeShadowRoot(c)) {
      collectAttrs(adapter.getTemplateContent(c), out);
      continue;
    }
    if (isExcludedByAttr(c)) continue;
    if (EXCLUDED_TAGS.has(c.tagName) && c.tagName !== "img") continue;
    for (const name of ["title", "aria-label"]) {
      const v = getAttr(c, name);
      if (v) out(c, name, v);
    }
    if (c.tagName === "img") {
      const v = getAttr(c, "alt");
      if (v) out(c, "alt", v);
    }
    collectAttrs(c, out);
  }
}

export interface SegmentResult {
  units: Unit[];
  title: string;
  html?: Element;
}

function findChild(parent: ParentNode, tag: string): Element | undefined {
  for (const c of parent.childNodes)
    if (isElement(c) && c.tagName === tag) return c;
  return undefined;
}

export function segmentDocument(doc: ParentNode): SegmentResult {
  const html = findChild(doc, "html");
  const head = html && findChild(html, "head");
  const body = html && findChild(html, "body");
  const titleEl = head && findChild(head, "title");
  const title = titleEl
    ? titleEl.childNodes
        .map((c) => textContent(c))
        .join("")
        .trim()
    : "";

  const raw: Unit[] = [];
  let id = 0;
  if (titleEl && titleEl.childNodes.length > 0) {
    const u = makeRunUnit(id, titleEl, [...titleEl.childNodes]);
    if (u) {
      raw.push(u);
      id++;
    }
  }
  const excludedRoot =
    (html && isExcludedByAttr(html)) || (body && isExcludedByAttr(body));
  if (body && !excludedRoot) {
    walkChildren(body, (nodes, parent) => {
      const u = makeRunUnit(id, parent, nodes);
      if (u) {
        raw.push(u);
        id++;
      }
    });
    collectAttrs(body, (el, name, value) => {
      const u = makeAttrUnit(id, el, name, value);
      if (u) {
        raw.push(u);
        id++;
      }
    });
  }
  return { units: raw, title, html };
}

/** Is the unit's letter content mostly ASCII (identifier/code/English)? */
export function asciiRatio(plain: string): number {
  let letters = 0;
  let ascii = 0;
  for (const ch of plain) {
    if (LETTER_RE.test(ch)) {
      letters++;
      if (ch.charCodeAt(0) < 128) ascii++;
    }
  }
  return letters === 0 ? 1 : ascii / letters;
}

const LATIN_RE = /\p{Script=Latin}/u;

export function dominantScriptIsNonLatin(units: Unit[]): boolean {
  let latin = 0;
  let other = 0;
  for (const u of units) {
    for (const ch of u.plain) {
      if (!LETTER_RE.test(ch)) continue;
      if (LATIN_RE.test(ch)) latin++;
      else other++;
    }
  }
  return other > latin;
}
