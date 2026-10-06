// Wires the anchoring module's pure results into the CSS Custom Highlight API
// (https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API),
// scoped to the archived document's own realm (the iframe's `contentWindow`).
// Never mutates the archived DOM: highlights are painted via `::highlight()`,
// so anchoring stays stable across re-renders.
import type { TextIndex, TextQuoteSelector } from "./anchoring";
import { anchor } from "./anchoring";

export const ANNOTATION_COLORS = ["yellow", "green", "blue", "red"] as const;
export type AnnotationRenderColor = (typeof ANNOTATION_COLORS)[number];

export interface AnnotationToRender {
  id: string;
  color: AnnotationRenderColor;
  selector: TextQuoteSelector;
}

export interface AnchoredAnnotation extends AnnotationToRender {
  start: number;
  end: number;
  range: Range;
}

const HIGHLIGHT_STYLE_ELEMENT_ID = "karakeep-annotation-highlight-styles";

// `Window` doesn't model `CSS`/`Highlight` as own properties in lib.dom.d.ts
// even though every realm (including an iframe's `contentWindow`) exposes
// them as globals at runtime. This narrows just the bits this module needs,
// scoped to whichever window the caller passes in (so the Highlight objects
// are always constructed from the archived document's own realm, never the
// parent's).
interface HighlightCapableWindow {
  CSS?: { highlights: HighlightRegistry };
  Highlight?: typeof Highlight;
}

function asHighlightCapable(win: Window): HighlightCapableWindow {
  return win as unknown as HighlightCapableWindow;
}

export function supportsCssHighlights(win: Window): boolean {
  const hw = asHighlightCapable(win);
  return typeof hw.CSS !== "undefined" && typeof hw.Highlight !== "undefined";
}

export function ensureHighlightStylesInjected(doc: Document) {
  if (doc.getElementById(HIGHLIGHT_STYLE_ELEMENT_ID)) {
    return;
  }
  const style = doc.createElement("style");
  style.id = HIGHLIGHT_STYLE_ELEMENT_ID;
  style.textContent = `
::highlight(ann-yellow) { background-color: rgba(250, 204, 21, 0.45); }
::highlight(ann-green)  { background-color: rgba(74, 222, 128, 0.45); }
::highlight(ann-blue)   { background-color: rgba(96, 165, 250, 0.45); }
::highlight(ann-red)    { background-color: rgba(248, 113, 113, 0.45); }
::highlight(ann-active) { background-color: rgba(250, 204, 21, 0.85); }
`;
  doc.head.appendChild(style);
}

export function anchorAnnotations(
  index: TextIndex,
  annotations: AnnotationToRender[],
): { anchored: AnchoredAnnotation[]; unanchored: AnnotationToRender[] } {
  const anchored: AnchoredAnnotation[] = [];
  const unanchored: AnnotationToRender[] = [];
  for (const a of annotations) {
    const result = anchor(index, a.selector);
    if (result) {
      anchored.push({ ...a, ...result });
    } else {
      unanchored.push(a);
    }
  }
  return { anchored, unanchored };
}

export function paintHighlights(
  win: Window,
  anchored: AnchoredAnnotation[],
  activeId: string | null,
) {
  if (!supportsCssHighlights(win)) {
    return;
  }
  const hw = asHighlightCapable(win);
  const HighlightCtor = hw.Highlight!;
  const registry = hw.CSS!.highlights;

  const byColor = new Map<AnnotationRenderColor, Range[]>();
  const activeRanges: Range[] = [];
  for (const a of anchored) {
    if (a.id === activeId) {
      activeRanges.push(a.range);
      continue;
    }
    const list = byColor.get(a.color) ?? [];
    list.push(a.range);
    byColor.set(a.color, list);
  }
  for (const color of ANNOTATION_COLORS) {
    const ranges = byColor.get(color) ?? [];
    registry.set(`ann-${color}`, new HighlightCtor(...ranges));
  }
  registry.set("ann-active", new HighlightCtor(...activeRanges));
}

export function clearHighlights(win: Window) {
  if (!supportsCssHighlights(win)) {
    return;
  }
  const registry = asHighlightCapable(win).CSS!.highlights;
  for (const color of ANNOTATION_COLORS) {
    registry.delete(`ann-${color}`);
  }
  registry.delete("ann-active");
}

export function findAnnotationAtPosition(
  anchored: AnchoredAnnotation[],
  position: number,
): AnchoredAnnotation | null {
  let best: AnchoredAnnotation | null = null;
  for (const a of anchored) {
    if (position >= a.start && position < a.end) {
      if (!best || a.end - a.start < best.end - best.start) {
        best = a;
      }
    }
  }
  return best;
}
