"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import {
  buildIndex,
  describeRange,
  positionOf,
} from "@/lib/annotations/anchoring";
import type { TextIndex, TextQuoteSelector } from "@/lib/annotations/anchoring";
import {
  anchorAnnotations,
  ensureHighlightStylesInjected,
  findAnnotationAtPosition,
  paintHighlights,
  supportsCssHighlights,
} from "@/lib/annotations/rendering";
import type { AnchoredAnnotation } from "@/lib/annotations/rendering";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileWarning } from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { useCreatePageAnnotation } from "@karakeep/shared-react/hooks/pageAnnotations";
import type { ZAnnotationColor } from "@karakeep/shared/types/pageAnnotations";

import AnnotationSidebar from "./AnnotationSidebar";
import ArchiveFrame from "./ArchiveFrame";
import SelectionPopover from "./SelectionPopover";
import ViewerToolbar from "./ViewerToolbar";

type Mode = "read" | "annotate";

interface PendingSelection {
  top: number;
  left: number;
  selector: TextQuoteSelector;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) {
    return false;
  }
  return (
    el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable
  );
}

export default function AnnotationViewer({
  bookmarkId,
  bookmarkTitle,
  originalUrl,
}: {
  bookmarkId: string;
  bookmarkTitle: string;
  originalUrl: string | null;
}) {
  const { t } = useTranslation();
  const api = useTRPC();

  const { data: archiveInfo, isLoading: archiveInfoLoading } = useQuery(
    api.pageAnnotations.getArchiveInfo.queryOptions({ bookmarkId }),
  );
  const { data: annotationsData } = useQuery(
    api.pageAnnotations.getForBookmark.queryOptions({ bookmarkId }),
  );
  const annotations = annotationsData?.annotations ?? [];

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const indexRef = useRef<TextIndex | null>(null);
  const anchoredRef = useRef<AnchoredAnnotation[]>([]);

  const [frameReady, setFrameReady] = useState(false);
  const [unsupportedBrowser, setUnsupportedBrowser] = useState(false);
  const [mode, setMode] = useState<Mode>("annotate");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [defaultColor, setDefaultColor] = useState<ZAnnotationColor>("yellow");
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [autoEditCommentId, setAutoEditCommentId] = useState<string | null>(
    null,
  );
  const [anchoredOrder, setAnchoredOrder] = useState<string[]>([]);
  const [unanchoredIds, setUnanchoredIds] = useState<Set<string>>(new Set());

  const { mutate: createAnnotation } = useCreatePageAnnotation({
    onError: () => {
      toast({
        variant: "destructive",
        description: t("annotations.toasts.create_failed"),
      });
    },
  });

  const getDoc = useCallback(
    () => iframeRef.current?.contentDocument ?? null,
    [],
  );
  const getWin = useCallback(
    () => iframeRef.current?.contentWindow ?? null,
    [],
  );

  const handleFrameLoad = useCallback(() => {
    const doc = getDoc();
    const win = getWin();
    if (!doc || !win) {
      return;
    }
    indexRef.current = buildIndex(doc.body);
    setUnsupportedBrowser(!supportsCssHighlights(win));
    ensureHighlightStylesInjected(doc);
    setFrameReady(true);
  }, [getDoc, getWin]);

  // Re-anchor and re-paint whenever the annotation list, active id, or the
  // loaded document changes. Rebuilding the index itself only happens on
  // frame load (handleFrameLoad) -- never on every render.
  useEffect(() => {
    if (!frameReady || !indexRef.current) {
      return;
    }
    const win = getWin();
    if (!win) {
      return;
    }
    const { anchored, unanchored } = anchorAnnotations(
      indexRef.current,
      annotations.map((a) => ({
        id: a.id,
        color: a.color,
        selector: {
          exact: a.exact,
          prefix: a.prefix,
          suffix: a.suffix,
          startOffset: a.startOffset,
        },
      })),
    );
    anchored.sort((a, b) => a.start - b.start);
    anchoredRef.current = anchored;
    setAnchoredOrder(anchored.map((a) => a.id));
    setUnanchoredIds(new Set(unanchored.map((a) => a.id)));
    paintHighlights(win, anchored, activeId);
  }, [frameReady, annotations, activeId, getWin]);

  const scrollToAnnotation = useCallback((id: string) => {
    const anchored = anchoredRef.current.find((a) => a.id === id);
    if (anchored) {
      const container = anchored.range.startContainer;
      const el =
        container.nodeType === Node.TEXT_NODE
          ? container.parentElement
          : (container as Element);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    document
      .querySelector(`[data-annotation-card-id="${id}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  const handleSelectCard = useCallback(
    (id: string) => {
      setActiveId(id);
      scrollToAnnotation(id);
    },
    [scrollToAnnotation],
  );

  const handleHighlight = useCallback(
    (color: ZAnnotationColor, withComment: boolean) => {
      if (!pending) {
        return;
      }
      setDefaultColor(color);
      createAnnotation(
        {
          bookmarkId,
          assetId: archiveInfo?.assetId ?? null,
          exact: pending.selector.exact,
          prefix: pending.selector.prefix,
          suffix: pending.selector.suffix,
          startOffset: pending.selector.startOffset,
          color,
          comment: null,
        },
        {
          onSuccess: (created) => {
            setActiveId(created.id);
            if (withComment) {
              setAutoEditCommentId(created.id);
            }
          },
        },
      );
      getWin()?.getSelection()?.removeAllRanges();
      setPending(null);
    },
    [pending, createAnnotation, bookmarkId, archiveInfo?.assetId, getWin],
  );

  // Text selection inside the archive -> selection popover (annotate mode).
  useEffect(() => {
    if (!frameReady || mode !== "annotate") {
      setPending(null);
      return;
    }
    const doc = getDoc();
    const iframe = iframeRef.current;
    if (!doc || !iframe) {
      return;
    }

    const handleSelectionChange = () => {
      const win = getWin();
      const sel = win?.getSelection();
      if (!sel || sel.isCollapsed || !indexRef.current) {
        setPending(null);
        return;
      }
      const text = sel.toString();
      if (!text.trim()) {
        setPending(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const selector = describeRange(indexRef.current, range);
      if (!selector) {
        setPending(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      const frameRect = iframe.getBoundingClientRect();
      setPending({
        top: frameRect.top + rect.top,
        left: frameRect.left + rect.left + rect.width / 2,
        selector,
      });
    };

    doc.addEventListener("mouseup", handleSelectionChange);
    doc.addEventListener("keyup", handleSelectionChange);
    return () => {
      doc.removeEventListener("mouseup", handleSelectionChange);
      doc.removeEventListener("keyup", handleSelectionChange);
    };
  }, [frameReady, mode, getDoc, getWin]);

  // Click handling inside the archive: hit-test highlights, and always
  // intercept link clicks so the archived page never navigates the parent
  // (or the iframe, since it has no allow-top-navigation / allow-forms).
  useEffect(() => {
    if (!frameReady) {
      return;
    }
    const doc = getDoc();
    if (!doc) {
      return;
    }

    const handleClick = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest?.("a[href]");
      if (link) {
        e.preventDefault();
        const href = (link as HTMLAnchorElement).href;
        if (href) {
          window.open(href, "_blank", "noopener,noreferrer");
        }
        return;
      }

      if (mode !== "read" || !indexRef.current) {
        return;
      }
      const docWithCaret = doc as Document & {
        caretPositionFromPoint?: (
          x: number,
          y: number,
        ) => { offsetNode: Node; offset: number } | null;
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
      };
      let position: number | null = null;
      if (docWithCaret.caretPositionFromPoint) {
        const caret = docWithCaret.caretPositionFromPoint(e.clientX, e.clientY);
        if (caret) {
          position = positionOf(
            indexRef.current,
            caret.offsetNode,
            caret.offset,
          );
        }
      } else if (docWithCaret.caretRangeFromPoint) {
        const range = docWithCaret.caretRangeFromPoint(e.clientX, e.clientY);
        if (range) {
          position = positionOf(
            indexRef.current,
            range.startContainer,
            range.startOffset,
          );
        }
      }
      if (position === null) {
        return;
      }
      const hit = findAnnotationAtPosition(anchoredRef.current, position);
      if (hit) {
        handleSelectCard(hit.id);
      }
    };

    doc.addEventListener("click", handleClick, true);
    return () => doc.removeEventListener("click", handleClick, true);
  }, [frameReady, mode, getDoc, handleSelectCard]);

  // Keyboard shortcuts. Attached to both the parent window and the iframe's
  // own document, since keyboard events dispatched inside the iframe never
  // bubble out to the parent window's listeners.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) {
        return;
      }
      if (e.key === "Escape") {
        setPending(null);
        setActiveId(null);
        return;
      }
      if (e.key === "a") {
        setMode((m) => (m === "annotate" ? "read" : "annotate"));
        return;
      }
      if ((e.key === "h" || e.key === "c") && pending) {
        handleHighlight(defaultColor, e.key === "c");
        return;
      }
      if (e.key === "j" || e.key === "k") {
        if (anchoredOrder.length === 0) {
          return;
        }
        const currentIndex = activeId ? anchoredOrder.indexOf(activeId) : -1;
        const nextIndex =
          e.key === "j"
            ? Math.min(currentIndex + 1, anchoredOrder.length - 1)
            : Math.max(currentIndex - 1, 0);
        handleSelectCard(anchoredOrder[Math.max(nextIndex, 0)]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    const doc = frameReady ? getDoc() : null;
    doc?.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      doc?.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    frameReady,
    pending,
    defaultColor,
    anchoredOrder,
    activeId,
    handleHighlight,
    handleSelectCard,
    getDoc,
  ]);

  const handleCopyMarkdown = useCallback(async () => {
    const ordered = anchoredOrder
      .map((id) => annotations.find((a) => a.id === id))
      .filter((a): a is NonNullable<typeof a> => !!a);
    const lines = [
      originalUrl
        ? `# ${bookmarkTitle}\n\n[${originalUrl}](${originalUrl})\n`
        : `# ${bookmarkTitle}\n`,
      ...ordered.map((a) =>
        a.comment ? `> ${a.exact}\n\n${a.comment}` : `> ${a.exact}`,
      ),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n\n"));
      toast({ description: t("annotations.toasts.markdown_copied") });
    } catch {
      toast({
        variant: "destructive",
        description: t("annotations.toasts.markdown_copy_failed"),
      });
    }
  }, [anchoredOrder, annotations, bookmarkTitle, originalUrl, t]);

  return (
    <div className="flex h-full flex-col">
      <ViewerToolbar
        bookmarkId={bookmarkId}
        bookmarkTitle={bookmarkTitle}
        originalUrl={originalUrl}
        mode={mode}
        onModeChange={setMode}
        annotationCount={annotations.length}
        onCopyMarkdown={handleCopyMarkdown}
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1 bg-muted/20">
          {archiveInfoLoading ? (
            <FullPageSpinner />
          ) : archiveInfo ? (
            <>
              <ArchiveFrame
                ref={iframeRef}
                src={`/api/annotate/${bookmarkId}/archive`}
                title={bookmarkTitle}
                onLoad={handleFrameLoad}
              />
              {!frameReady && <FullPageSpinner />}
              {unsupportedBrowser && (
                <Alert
                  variant="destructive"
                  className="absolute inset-x-2 top-2 w-auto"
                >
                  <AlertTriangle className="size-4" />
                  <AlertTitle>
                    {t("annotations.unsupported_browser.title")}
                  </AlertTitle>
                  <AlertDescription>
                    {t("annotations.unsupported_browser.description")}
                  </AlertDescription>
                </Alert>
              )}
              {pending && (
                <SelectionPopover
                  top={pending.top}
                  left={pending.left}
                  defaultColor={defaultColor}
                  onHighlight={(color) => handleHighlight(color, false)}
                  onHighlightWithComment={(color) =>
                    handleHighlight(color, true)
                  }
                />
              )}
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              <FileWarning className="size-8 text-muted-foreground" />
              <p className="font-medium">{t("annotations.no_archive.title")}</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {t("annotations.no_archive.description")}
              </p>
              <Button asChild variant="secondary" className="mt-2">
                <a href={`/dashboard/preview/${bookmarkId}`}>
                  {t("annotations.toolbar.back_to_bookmark")}
                </a>
              </Button>
            </div>
          )}
        </div>
        <aside className="w-80 shrink-0 overflow-hidden border-l">
          <AnnotationSidebar
            annotations={annotations}
            anchoredOrder={anchoredOrder}
            unanchoredIds={unanchoredIds}
            activeId={activeId}
            onSelect={handleSelectCard}
            hasArchive={!!archiveInfo}
            autoEditCommentId={autoEditCommentId}
          />
        </aside>
      </div>
    </div>
  );
}
