import {
  adapter,
  ChildNode,
  deepClone,
  Element,
  isElement,
  ParentNode,
  setAttr,
  shallowClone,
} from "./dom";
import type { Placeholder, Unit } from "./segment";
import type { Token } from "./tokens";

/** Build DOM nodes from validated tokens. Never parses markup. */
export function buildNodes(
  tokens: Token[],
  placeholders: Map<number, Placeholder>,
): ChildNode[] {
  const root: ChildNode[] = [];
  const stack: { el: Element | null; kids: ChildNode[] }[] = [
    { el: null, kids: root },
  ];
  for (const t of tokens) {
    const top = stack[stack.length - 1];
    if (t.t === "text") {
      top.kids.push(adapter.createTextNode(t.v));
    } else if (t.t === "open") {
      const ph = placeholders.get(t.n);
      if (!ph || !isElement(ph.el)) throw new Error(`bad placeholder x${t.n}`);
      stack.push({ el: shallowClone(ph.el), kids: [] });
    } else if (t.t === "close") {
      const frame = stack.pop();
      if (!frame?.el) throw new Error("unbalanced");
      for (const k of frame.kids) adapter.appendChild(frame.el, k);
      stack[stack.length - 1].kids.push(frame.el);
    } else {
      const ph = placeholders.get(t.n);
      if (!ph) throw new Error(`bad placeholder ${t.n}`);
      top.kids.push(deepClone(ph.el));
    }
  }
  if (stack.length !== 1) throw new Error("unbalanced");
  return root;
}

function withWhitespace(nodes: ChildNode[], lead: string, trail: string) {
  const out = [...nodes];
  if (lead) out.unshift(adapter.createTextNode(lead));
  if (trail) out.push(adapter.createTextNode(trail));
  return out;
}

export interface UnitReplacement {
  unit: Unit;
  tokens: Token[];
}

export function applyAttrReplacement(r: UnitReplacement): void {
  const u = r.unit;
  if (!u.attrEl || !u.attrName) return;
  const text = r.tokens.map((t) => (t.t === "text" ? t.v : "")).join("");
  setAttr(u.attrEl, u.attrName, u.lead + text + u.trail);
}

/** Replace the node runs of all given run units, grouped per parent. */
export function applyRunReplacements(reps: UnitReplacement[]): void {
  const byParent = new Map<
    ParentNode,
    Map<ChildNode, { count: number; nodes: ChildNode[] }>
  >();
  for (const r of reps) {
    const u = r.unit;
    if (!u.parent || !u.nodes) continue;
    const nodes = withWhitespace(
      buildNodes(r.tokens, u.placeholders),
      u.lead,
      u.trail,
    );
    let m = byParent.get(u.parent);
    if (!m) byParent.set(u.parent, (m = new Map()));
    m.set(u.nodes[0], { count: u.nodes.length, nodes });
  }
  for (const [parent, repl] of byParent) {
    const next: ChildNode[] = [];
    const old = parent.childNodes;
    for (let i = 0; i < old.length; i++) {
      const rep = repl.get(old[i]);
      if (rep) {
        for (const n of rep.nodes) {
          n.parentNode = parent;
          next.push(n);
        }
        i += rep.count - 1;
      } else {
        next.push(old[i]);
      }
    }
    parent.childNodes = next;
  }
}
