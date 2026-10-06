import { decode } from "html-entities";

/**
 * Strict tokenizer for the encoded unit format. Only `xN` / `cN` placeholders
 * are recognised; any other tag-like markup makes the string invalid (null).
 */
export type Token =
  | { t: "text"; v: string }
  | { t: "open"; n: number }
  | { t: "close"; n: number }
  | { t: "void"; n: number }
  | { t: "c"; n: number; v: string };

const TAG_RE = /^<(\/?)([xc])(\d+)\s*(\/?)>/;
const TAG_LIKE_RE = /^<[A-Za-z/!?]/;

export function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function decodeText(s: string): string {
  return decode(s, { level: "html5" });
}

export function tokenize(input: string): Token[] | null {
  const out: Token[] = [];
  let i = 0;
  let textStart = 0;
  const flush = (end: number) => {
    if (end > textStart) {
      out.push({ t: "text", v: decodeText(input.slice(textStart, end)) });
    }
  };
  while (i < input.length) {
    if (input[i] !== "<") {
      i++;
      continue;
    }
    const rest = input.slice(i, i + 40);
    const m = TAG_RE.exec(rest);
    if (!m) {
      if (TAG_LIKE_RE.test(rest)) return null;
      i++;
      continue;
    }
    const [whole, closing, kind, num, selfClose] = m;
    const n = parseInt(num, 10);
    flush(i);
    i += whole.length;
    textStart = i;
    if (kind === "x") {
      if (closing && selfClose) return null;
      if (selfClose) out.push({ t: "void", n });
      else if (closing) out.push({ t: "close", n });
      else out.push({ t: "open", n });
    } else {
      if (closing || selfClose) return null;
      const closeTag = `</c${n}>`;
      const end = input.indexOf(closeTag, i);
      if (end < 0) return null;
      out.push({ t: "c", n, v: decodeText(input.slice(i, end)) });
      i = end + closeTag.length;
      textStart = i;
    }
  }
  flush(input.length);
  return out;
}

/** Placeholder multiset signature, e.g. ["o1", "c1", "v2", "k3"]. */
export function signature(tokens: Token[]): string[] {
  const sig: string[] = [];
  for (const t of tokens) {
    if (t.t === "open") sig.push(`o${t.n}`);
    else if (t.t === "close") sig.push(`c${t.n}`);
    else if (t.t === "void") sig.push(`v${t.n}`);
    else if (t.t === "c") sig.push(`k${t.n}`);
  }
  return sig.sort();
}

export function wellNested(tokens: Token[]): boolean {
  const stack: number[] = [];
  for (const t of tokens) {
    if (t.t === "open") stack.push(t.n);
    else if (t.t === "close") {
      if (stack.pop() !== t.n) return false;
    }
  }
  return stack.length === 0;
}

export function plainTextOf(tokens: Token[]): string {
  return tokens.map((t) => (t.t === "text" ? t.v : "")).join("");
}
