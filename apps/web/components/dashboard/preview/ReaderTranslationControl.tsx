"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { toast } from "@/components/ui/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useClientConfig } from "@/lib/clientConfig";
import { useTranslation } from "@/lib/i18n/client";
import { useQuery } from "@tanstack/react-query";
import { Languages, Loader2, MoreHorizontal, Trash2 } from "lucide-react";

import {
  useCancelBookmarkTranslation,
  useDeleteBookmarkTranslation,
  useTranslateBookmark,
} from "@karakeep/shared-react/hooks/bookmarkTranslations";
import { useTRPC } from "@karakeep/shared-react/trpc";

export type ReaderLanguageView = "original" | "english";

export default function ReaderTranslationControl({
  bookmarkId,
  view,
  onViewChange,
}: {
  bookmarkId: string;
  view: ReaderLanguageView;
  onViewChange: (view: ReaderLanguageView) => void;
}) {
  const { t } = useTranslation();
  const api = useTRPC();
  const clientConfig = useClientConfig();
  const enabled = clientConfig.translation.enabled;

  const { data: status } = useQuery(
    api.bookmarkTranslations.getStatus.queryOptions(
      { bookmarkId },
      {
        enabled,
        refetchInterval: (query) => {
          const s = query.state.data?.status;
          return s === "pending" || s === "running" ? 1500 : false;
        },
      },
    ),
  );

  const [confirming, setConfirming] = useState<
    "discard" | "retranslate" | null
  >(null);

  const { mutate: translate, isPending: isStarting } = useTranslateBookmark({
    onError: () => {
      toast({
        variant: "destructive",
        description: t("preview.translation.toasts.start_failed"),
      });
    },
  });
  const { mutate: cancel, isPending: isCancelling } =
    useCancelBookmarkTranslation({
      onError: () => {
        toast({
          variant: "destructive",
          description: t("preview.translation.toasts.cancel_failed"),
        });
      },
    });
  const { mutate: discard, isPending: isDiscarding } =
    useDeleteBookmarkTranslation({
      onSuccess: () => onViewChange("original"),
      onError: () => {
        toast({
          variant: "destructive",
          description: t("preview.translation.toasts.discard_failed"),
        });
      },
    });

  // Switch to the English version right after a job finishes (the translated
  // content itself is refreshed by the hooks' invalidation).
  const previousStatus = useRef(status?.status);
  useEffect(() => {
    const prev = previousStatus.current;
    previousStatus.current = status?.status;
    if (
      status?.status === "done" &&
      (prev === "pending" || prev === "running")
    ) {
      onViewChange("english");
    }
  }, [status?.status, onViewChange]);

  // Nothing to show once the translation is gone.
  useEffect(() => {
    if (view === "english" && status === null) {
      onViewChange("original");
    }
  }, [view, status, onViewChange]);

  if (!enabled) {
    return null;
  }

  if (status && (status.status === "pending" || status.status === "running")) {
    const label =
      status.phase === "warming_up" || status.progressTotal === 0
        ? t("preview.translation.warming_up")
        : t("preview.translation.progress", {
            done: status.progressDone,
            total: status.progressTotal,
          });
    return (
      <div className="flex items-center gap-1">
        <Button variant="outline" disabled className="gap-1.5">
          <Loader2 className="size-4 animate-spin" />
          {label}
        </Button>
        <Button
          variant="ghost"
          disabled={isCancelling}
          onClick={() => cancel({ bookmarkId })}
        >
          {t("preview.translation.cancel")}
        </Button>
      </div>
    );
  }

  if (status?.status === "done") {
    const englishHighlightsCount = status.englishHighlightsCount;
    return (
      <div className="flex items-center gap-1">
        <div
          role="group"
          className="flex h-10 items-center rounded-md border p-0.5"
        >
          <Button
            variant={view === "original" ? "secondary" : "ghost"}
            size="sm"
            className="h-8"
            onClick={() => onViewChange("original")}
          >
            {t("preview.translation.original")}
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={view === "english" ? "secondary" : "ghost"}
                size="sm"
                className="h-8"
                onClick={() => onViewChange("english")}
              >
                {t("preview.translation.english")}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>
                {t("preview.translation.translated_details", {
                  date: status.updatedAt.toLocaleString(),
                  model: status.model,
                })}
              </p>
              {status.failedUnits > 0 && (
                <p>
                  {t("preview.translation.untranslated", {
                    count: status.failedUnits,
                  })}
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        </div>
        {status.isStale && (
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={isStarting}
            onClick={() =>
              englishHighlightsCount > 0
                ? setConfirming("retranslate")
                : translate({ bookmarkId })
            }
          >
            {t("preview.translation.stale")}
          </Button>
        )}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("preview.translation.more_actions")}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t("preview.translation.more_actions")}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={isDiscarding}
              onClick={() =>
                englishHighlightsCount > 0
                  ? setConfirming("discard")
                  : discard({ bookmarkId })
              }
            >
              <Trash2 className="mr-2 size-4" />
              {t("preview.translation.discard")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ActionConfirmingDialog
          open={confirming !== null}
          setOpen={(open) => !open && setConfirming(null)}
          title={t("preview.translation.confirm_title")}
          description={
            <p className="text-sm text-muted-foreground">
              {t("preview.translation.confirm_description", {
                count: englishHighlightsCount,
              })}
            </p>
          }
          actionButton={(setDialogOpen) => (
            <Button
              variant="destructive"
              onClick={() => {
                if (confirming === "discard") {
                  discard({ bookmarkId });
                } else {
                  translate({ bookmarkId });
                }
                setDialogOpen(false);
              }}
            >
              {confirming === "discard"
                ? t("preview.translation.confirm_discard")
                : t("preview.translation.confirm_retranslate")}
            </Button>
          )}
        />
      </div>
    );
  }

  const failed = status?.status === "failed";
  const button = (
    <Button
      variant="outline"
      className="gap-1.5"
      disabled={isStarting}
      onClick={() => translate({ bookmarkId })}
    >
      <Languages className="size-4" />
      {failed
        ? t("preview.translation.retry")
        : t("preview.translation.translate")}
    </Button>
  );

  if (failed && status.error) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-sm">
          {status.error}
        </TooltipContent>
      </Tooltip>
    );
  }
  return button;
}
