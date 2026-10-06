"use client";

import { useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useClientConfig } from "@/lib/clientConfig";
import { useTranslation } from "@/lib/i18n/client";
import { Check, Languages, Loader2 } from "lucide-react";

import {
  useCancelArchiveTranslation,
  useTranslateArchive,
} from "@karakeep/shared-react/hooks/archiveTranslations";
import type { ZTranslationStatus } from "@karakeep/shared/types/archiveTranslations";

export function isTranslationActive(
  status: ZTranslationStatus | null | undefined,
): boolean {
  return status?.status === "pending" || status?.status === "running";
}

export default function TranslateArchiveControl({
  bookmarkId,
  status,
  annotationCount,
}: {
  bookmarkId: string;
  status: ZTranslationStatus | null | undefined;
  annotationCount: number;
}) {
  const { t } = useTranslation();
  const clientConfig = useClientConfig();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { mutate: translate, isPending: isStarting } = useTranslateArchive({
    onSuccess: () => setDialogOpen(false),
    onError: () => {
      toast({
        variant: "destructive",
        description: t("annotations.translation.toasts.start_failed"),
      });
    },
  });
  const { mutate: cancel, isPending: isCancelling } =
    useCancelArchiveTranslation({
      onError: () => {
        toast({
          variant: "destructive",
          description: t("annotations.translation.toasts.cancel_failed"),
        });
      },
    });

  if (!clientConfig.translation.enabled) {
    return null;
  }

  if (isTranslationActive(status) && status) {
    const label =
      status.phase === "warming_up" || status.progressTotal === 0
        ? t("annotations.translation.warming_up")
        : t("annotations.translation.progress", {
            done: status.progressDone,
            total: status.progressTotal,
          });
    return (
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2" disabled>
          <Loader2 className="size-4 animate-spin" />
          {label}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          disabled={isCancelling}
          onClick={() => cancel({ bookmarkId })}
        >
          {t("annotations.translation.cancel")}
        </Button>
      </div>
    );
  }

  if (status?.status === "done" && status.isApplied) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <span className="flex h-8 cursor-default items-center gap-1.5 px-2 text-sm text-muted-foreground">
            <Check className="size-4" />
            {t("annotations.translation.translated")}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>
            {t("annotations.translation.translated_details", {
              date: status.updatedAt.toLocaleString(),
              model: status.model,
            })}
          </p>
          {status.failedUnits > 0 && (
            <p>
              {t("annotations.translation.untranslated", {
                count: status.failedUnits,
              })}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  const failed = status?.status === "failed";
  const button = (
    <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2">
      <Languages className="size-4" />
      {failed
        ? t("annotations.translation.retry")
        : t("annotations.translation.translate")}
    </Button>
  );

  return (
    <ActionConfirmingDialog
      open={dialogOpen}
      setOpen={setDialogOpen}
      title={t("annotations.translation.dialog.title")}
      description={
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>{t("annotations.translation.dialog.description")}</p>
          <p>{t("annotations.translation.dialog.recovery")}</p>
          {annotationCount > 0 && (
            <p className="font-medium text-foreground">
              {t("annotations.translation.dialog.annotations_warning", {
                count: annotationCount,
              })}
            </p>
          )}
        </div>
      }
      actionButton={() => (
        <ActionButton
          type="button"
          variant="destructive"
          loading={isStarting}
          onClick={() => translate({ bookmarkId })}
        >
          {t("annotations.translation.dialog.confirm")}
        </ActionButton>
      )}
    >
      {failed && status?.error ? (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            {status.error}
          </TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
    </ActionConfirmingDialog>
  );
}
