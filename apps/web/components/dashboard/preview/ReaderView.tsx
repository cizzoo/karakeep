import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { useQuery } from "@tanstack/react-query";
import { FileX } from "lucide-react";

import BookmarkHTMLHighlighter from "@karakeep/shared-react/components/BookmarkHtmlHighlighter";
import ScrollProgressTracker from "@karakeep/shared-react/components/ScrollProgressTracker";
import {
  useCreateHighlight,
  useDeleteHighlight,
  useUpdateHighlight,
} from "@karakeep/shared-react/hooks/highlights";
import { useReadingProgress } from "@karakeep/shared-react/hooks/reading-progress";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import ReadingProgressBanner from "./ReadingProgressBanner";

const ENGLISH_CONTENT_LANGUAGE = "en";

export default function ReaderView({
  bookmarkId,
  className,
  style,
  readOnly,
  progressBarStyle,
  showTranslation = false,
}: {
  bookmarkId: string;
  className?: string;
  style?: React.CSSProperties;
  readOnly: boolean;
  progressBarStyle?: React.CSSProperties;
  // Show the English translation of the reader content instead of the original.
  showTranslation?: boolean;
}) {
  const { t } = useTranslation();
  const api = useTRPC();
  const { data: highlights } = useQuery(
    api.highlights.getForBookmark.queryOptions({
      bookmarkId,
    }),
  );
  const { data: cachedContent, isPending: isCachedContentLoading } = useQuery(
    api.bookmarks.getBookmark.queryOptions(
      {
        bookmarkId,
        includeContent: true,
      },
      {
        select: (data) =>
          data.content.type == BookmarkTypes.LINK
            ? data.content.htmlContent
            : null,
      },
    ),
  );

  const { data: translated, isPending: isTranslatedLoading } = useQuery(
    api.bookmarkTranslations.getTranslatedContent.queryOptions(
      { bookmarkId },
      { enabled: showTranslation },
    ),
  );
  // Reading progress is anchored to offsets of the original text, so it is
  // ignored while the translation is shown. Highlights are stored per version.
  const translatedHtml = showTranslation ? (translated?.html ?? null) : null;
  const isShowingTranslation = translatedHtml !== null;

  const {
    showBanner,
    bannerPercent,
    onContinue,
    onDismiss,
    restorePosition,
    readingProgressOffset,
    readingProgressAnchor,
    onSavePosition,
    onScrollPositionChange,
  } = useReadingProgress({
    bookmarkId,
  });

  const { mutate: createHighlight } = useCreateHighlight({
    onSuccess: () => {
      toast({
        description: "Highlight has been created!",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        description: "Something went wrong",
      });
    },
  });

  const { mutate: updateHighlight } = useUpdateHighlight({
    onSuccess: () => {
      toast({
        description: "Highlight has been updated!",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        description: "Something went wrong",
      });
    },
  });

  const { mutate: deleteHighlight } = useDeleteHighlight({
    onSuccess: () => {
      toast({
        description: "Highlight has been deleted!",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        description: "Something went wrong",
      });
    },
  });

  let content;
  if (isCachedContentLoading || (showTranslation && isTranslatedLoading)) {
    content = <FullPageSpinner />;
  } else if (!cachedContent) {
    content = (
      <div className="flex h-full w-full items-center justify-center p-4">
        <div className="max-w-sm space-y-4 text-center">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <FileX className="h-8 w-8 text-muted-foreground" />
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-medium text-foreground">
              {t("preview.fetch_error_title")}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("preview.fetch_error_description")}
            </p>
          </div>
        </div>
      </div>
    );
  } else {
    content = (
      <ScrollProgressTracker
        onSavePosition={isShowingTranslation ? undefined : onSavePosition}
        onScrollPositionChange={
          isShowingTranslation ? undefined : onScrollPositionChange
        }
        restorePosition={restorePosition && !isShowingTranslation}
        readingProgressOffset={readingProgressOffset}
        readingProgressAnchor={readingProgressAnchor}
        showProgressBar
        progressBarStyle={progressBarStyle}
      >
        {showBanner && !isShowingTranslation && (
          <ReadingProgressBanner
            percent={bannerPercent}
            onContinue={onContinue}
            onDismiss={onDismiss}
          />
        )}
        <BookmarkHTMLHighlighter
          className={className}
          style={style}
          htmlContent={translatedHtml ?? cachedContent ?? ""}
          highlights={(highlights?.highlights ?? []).filter(
            (h) =>
              (h.contentLanguage ?? null) ===
              (isShowingTranslation ? ENGLISH_CONTENT_LANGUAGE : null),
          )}
          readOnly={readOnly}
          onDeleteHighlight={(h) =>
            deleteHighlight({
              highlightId: h.id,
            })
          }
          onUpdateHighlight={(h) =>
            updateHighlight({
              highlightId: h.id,
              color: h.color,
              note: h.note,
            })
          }
          onHighlight={(h) =>
            createHighlight({
              startOffset: h.startOffset,
              endOffset: h.endOffset,
              color: h.color,
              bookmarkId,
              text: h.text,
              note: h.note ?? null,
              contentLanguage: isShowingTranslation
                ? ENGLISH_CONTENT_LANGUAGE
                : null,
            })
          }
        />
      </ScrollProgressTracker>
    );
  }
  return content;
}
