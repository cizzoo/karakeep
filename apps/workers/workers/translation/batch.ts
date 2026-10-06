import { tokenize } from "./tokens";

const CJK_RE = /[ᄀ-ᇿ⺀-鿿ꥠ-꥿가-퟿豈-﫿＀-￯]/;

/** ~1 token per CJK char, ~1 per 4 chars otherwise, +30% margin. */
export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    if (CJK_RE.test(ch)) cjk++;
    else other++;
  }
  return Math.ceil((cjk + other / 4) * 1.3);
}

/**
 * Split an encoded unit into parts of roughly `budget` tokens, only at
 * sentence boundaries where no xN pair is open and not inside a cN.
 * Returns the (trimmed) parts. If there is no safe point, returns [text].
 */
export function splitEncoded(text: string, budget: number): string[] {
  if (estimateTokens(text) <= budget) return [text];
  const tokens = tokenize(text);
  if (!tokens) return [text];

  // Re-walk the raw string to find safe split offsets.
  const safe: number[] = [];
  const tagRe = /<(\/?)([xc])(\d+)\s*(\/?)>/y;
  let depth = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "<") {
      tagRe.lastIndex = i;
      const m = tagRe.exec(text);
      if (m) {
        const [whole, closing, kind, num, selfClose] = m;
        if (kind === "x") {
          if (selfClose) {
            // void
          } else if (closing) depth--;
          else depth++;
          i += whole.length;
        } else {
          const closeTag = `</c${num}>`;
          const end = text.indexOf(closeTag, i);
          i = end < 0 ? text.length : end + closeTag.length;
        }
        continue;
      }
    }
    if (depth === 0) {
      let isEnd = false;
      if ("。！？".includes(ch)) isEnd = true;
      else if ("!?.".includes(ch)) {
        const next = text[i + 1];
        isEnd = next === undefined || /\s/.test(next);
      }
      if (isEnd) {
        // swallow consecutive terminators / closing quotes
        let j = i + 1;
        while (j < text.length && "。！？!?.”’」』）)\"'".includes(text[j]))
          j++;
        if (j < text.length) safe.push(j);
        i = j;
        continue;
      }
    }
    i++;
  }
  if (safe.length === 0) return [text];

  const parts: string[] = [];
  let start = 0;
  let lastOk = -1;
  for (const p of safe) {
    for (;;) {
      if (estimateTokens(text.slice(start, p)) <= budget) {
        lastOk = p;
        break;
      }
      const cut = lastOk > start ? lastOk : p;
      parts.push(text.slice(start, cut));
      start = cut;
      lastOk = -1;
      if (cut === p) break;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** Greedy grouping of items (document order) under a token budget. */
export function groupBatches<T>(
  items: T[],
  cost: (item: T) => number,
  budget: number,
): T[][] {
  const batches: T[][] = [];
  let cur: T[] = [];
  let curCost = 0;
  for (const it of items) {
    const c = cost(it);
    if (cur.length > 0 && curCost + c > budget) {
      batches.push(cur);
      cur = [];
      curCost = 0;
    }
    cur.push(it);
    curCost += c;
  }
  if (cur.length > 0) batches.push(cur);
  return batches;
}
