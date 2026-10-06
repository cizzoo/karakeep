"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "@/lib/i18n/client";
import {
  ArrowLeft,
  BookOpen,
  Copy,
  ExternalLink,
  HighlighterIcon,
} from "lucide-react";

export default function ViewerToolbar({
  bookmarkId,
  bookmarkTitle,
  originalUrl,
  mode,
  onModeChange,
  annotationCount,
  onCopyMarkdown,
}: {
  bookmarkId: string;
  bookmarkTitle: string;
  originalUrl: string | null;
  mode: "read" | "annotate";
  onModeChange: (mode: "read" | "annotate") => void;
  annotationCount: number;
  onCopyMarkdown: () => void;
}) {
  const { t } = useTranslation();

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b bg-background px-3">
      <div className="flex min-w-0 items-center gap-2">
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Link
              href={`/dashboard/preview/${bookmarkId}`}
              className="flex size-8 items-center justify-center rounded-md hover:bg-accent"
            >
              <ArrowLeft className="size-4" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {t("annotations.toolbar.back_to_bookmark")}
          </TooltipContent>
        </Tooltip>
        <span className="truncate text-sm font-medium">{bookmarkTitle}</span>
        {originalUrl && (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <a
                href={originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-accent"
              >
                <ExternalLink className="size-3.5 text-muted-foreground" />
              </a>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t("annotations.toolbar.open_original")}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {t("annotations.toolbar.annotation_count", {
            count: annotationCount,
          })}
        </span>
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={onCopyMarkdown}
            >
              <Copy className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {t("annotations.toolbar.copy_markdown")}
          </TooltipContent>
        </Tooltip>
        <div className="flex items-center rounded-md border p-0.5">
          <Button
            variant={mode === "read" ? "default" : "ghost"}
            size="sm"
            className="h-7 gap-1.5 px-2"
            onClick={() => onModeChange("read")}
          >
            <BookOpen className="size-3.5" />
            {t("annotations.toolbar.mode_read")}
          </Button>
          <Button
            variant={mode === "annotate" ? "default" : "ghost"}
            size="sm"
            className="h-7 gap-1.5 px-2"
            onClick={() => onModeChange("annotate")}
          >
            <HighlighterIcon className="size-3.5" />
            {t("annotations.toolbar.mode_annotate")}
          </Button>
        </div>
      </div>
    </header>
  );
}
