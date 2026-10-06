// Pure DOM logic for anchoring page annotations to a W3C-style text quote
// selector (exact text + prefix/suffix context + approximate position). Must
// run against any Document, including an iframe's own realm, so this file
// never references the parent window's `document` directly — only through
// `root.ownerDocument`.

export interface TextIndex {
  text: string;
  nodes: Text[];
  starts: number[];
  indexOf: Map<Text, number>;
}

export interface TextQuoteSelector {
  exact: string;
  prefix: string;
  suffix: string;
  startOffset: number;
}

export interface Anchored {
  start: number;
  end: number;
  range: Range;
}

const CONTEXT_CHARS = 32;
const MAX_CANDIDATE_OCCURRENCES = 1000;
const IGNORED_PARENTS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);

export function buildIndex(root: Node): TextIndex {
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentElement && IGNORED_PARENTS.has(n.parentElement.tagName)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  const nodes: Text[] = [];
  const starts: number[] = [];
  const indexOf = new Map<Text, number>();
  let text = "";
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const n = node as Text;
    indexOf.set(n, nodes.length);
    nodes.push(n);
    starts.push(text.length);
    text += n.data;
  }
  return { text, nodes, starts, indexOf };
}

/** Maps a DOM boundary point to a position in `index.text`. */
export function positionOf(
  index: TextIndex,
  container: Node,
  offset: number,
): number {
  const i = index.indexOf.get(container as Text);
  if (i !== undefined) {
    return index.starts[i] + offset;
  }

  // The container is an element (or an ignored text node): find the first
  // indexed text node that starts at or after the boundary point.
  const doc = container.ownerDocument;
  if (!doc) {
    return index.text.length;
  }
  const point = doc.createRange();
  point.setStart(container, offset);
  point.collapse(true);
  let lo = 0;
  let hi = index.nodes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (point.comparePoint(index.nodes[mid], 0) < 0) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo < index.nodes.length ? index.starts[lo] : index.text.length;
}

function locate(
  index: TextIndex,
  pos: number,
  isEnd: boolean,
): [Text, number] | null {
  let lo = 0;
  let hi = index.nodes.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = index.starts[mid];
    const e = s + index.nodes[mid].data.length;
    if (isEnd ? pos <= s : pos < s) {
      hi = mid - 1;
    } else if (isEnd ? pos > e : pos >= e) {
      lo = mid + 1;
    } else {
      return [index.nodes[mid], pos - s];
    }
  }
  return null;
}

export function rangeFromPositions(
  index: TextIndex,
  start: number,
  end: number,
): Range | null {
  const a = locate(index, start, false);
  const b = locate(index, end, true);
  if (!a || !b) {
    return null;
  }
  const doc = a[0].ownerDocument;
  if (!doc) {
    return null;
  }
  const range = doc.createRange();
  range.setStart(a[0], a[1]);
  range.setEnd(b[0], b[1]);
  return range;
}

export function describeRange(
  index: TextIndex,
  range: Range,
): TextQuoteSelector | null {
  const start = positionOf(index, range.startContainer, range.startOffset);
  const end = positionOf(index, range.endContainer, range.endOffset);
  if (end <= start) {
    return null;
  }
  const exact = index.text.slice(start, end);
  if (!exact.trim()) {
    return null;
  }
  return {
    exact,
    startOffset: start,
    prefix: index.text.slice(Math.max(0, start - CONTEXT_CHARS), start),
    suffix: index.text.slice(end, end + CONTEXT_CHARS),
  };
}

function commonSuffixLength(a: string, b: string): number {
  let n = 0;
  while (
    n < a.length &&
    n < b.length &&
    a[a.length - 1 - n] === b[b.length - 1 - n]
  ) {
    n++;
  }
  return n;
}

function commonPrefixLength(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) {
    n++;
  }
  return n;
}

/**
 * Finds the best occurrence of `sel.exact` in `index.text`: the one with the
 * most matching context characters, breaking ties by proximity to
 * `sel.startOffset`. Caps the number of candidate occurrences considered to
 * keep this bounded on pathological inputs (e.g. a one-character quote
 * repeated thousands of times).
 */
export function anchor(
  index: TextIndex,
  sel: TextQuoteSelector,
): Anchored | null {
  const { text } = index;
  if (!sel.exact) {
    return null;
  }

  let best = -1;
  let bestScore = -1;
  let candidates = 0;
  for (
    let i = text.indexOf(sel.exact);
    i !== -1 && candidates < MAX_CANDIDATE_OCCURRENCES;
    i = text.indexOf(sel.exact, i + 1), candidates++
  ) {
    const before = text.slice(Math.max(0, i - sel.prefix.length), i);
    const after = text.slice(
      i + sel.exact.length,
      i + sel.exact.length + sel.suffix.length,
    );
    const score =
      commonSuffixLength(before, sel.prefix) +
      commonPrefixLength(after, sel.suffix);
    const closer =
      best < 0 ||
      Math.abs(i - sel.startOffset) < Math.abs(best - sel.startOffset);
    if (score > bestScore || (score === bestScore && closer)) {
      best = i;
      bestScore = score;
    }
  }
  if (best < 0) {
    return null;
  }
  const end = best + sel.exact.length;
  const range = rangeFromPositions(index, best, end);
  return range ? { start: best, end, range } : null;
}
