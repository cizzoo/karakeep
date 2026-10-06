"use client";

import { useState } from "react";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { MarkdownReadonly } from "@/components/ui/markdown/markdown-readonly";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/client";
import { format } from "date-fns";
import { Pencil, Trash2 } from "lucide-react";

import { HIGHLIGHT_COLOR_MAP } from "@karakeep/shared-react/components/highlights";
import {
  useDeletePageAnnotation,
  useUpdatePageAnnotation,
} from "@karakeep/shared-react/hooks/pageAnnotations";
import type { ZAnnotationColor } from "@karakeep/shared/types/pageAnnotations";
import type { ZPageAnnotation } from "@karakeep/shared/types/pageAnnotations";

import { ANNOTATION_COLORS } from "@/lib/annotations/rendering";

export default function AnnotationCard({
  annotation,
  isActive,
  isUnanchored,
  onSelect,
  startInEditMode = false,
}: {
  annotation: ZPageAnnotation;
  isActive: boolean;
  isUnanchored: boolean;
  onSelect: () => void;
  startInEditMode?: boolean;
}) {
  const { t } = useTranslation();
  const [isEditingComment, setIsEditingComment] = useState(startInEditMode);
  const [draftComment, setDraftComment] = useState(annotation.comment ?? "");

  const { mutate: updateAnnotation, isPending: isUpdating } =
    useUpdatePageAnnotation({
      onError: () => {
        toast({
          variant: "destructive",
          description: t("annotations.toasts.update_failed"),
        });
      },
    });
  const { mutate: deleteAnnotation, isPending: isDeleting } =
    useDeletePageAnnotation({
      onSuccess: () => {
        toast({ description: t("annotations.toasts.deleted") });
      },
      onError: () => {
        toast({
          variant: "destructive",
          description: t("annotations.toasts.delete_failed"),
        });
      },
    });

  const saveComment = () => {
    setIsEditingComment(false);
    if (draftComment === (annotation.comment ?? "")) {
      return;
    }
    updateAnnotation({
      annotationId: annotation.id,
      comment: draftComment.trim().length > 0 ? draftComment : null,
    });
  };

  return (
    <div
      data-annotation-card-id={annotation.id}
      className={cn(
        "flex flex-col gap-2 rounded-md border p-3 transition-colors",
        isActive ? "border-primary bg-accent" : "border-border",
      )}
    >
      <button
        className="flex flex-col gap-1 text-left"
        onClick={onSelect}
        disabled={isUnanchored}
      >
        <blockquote
          className={cn(
            "prose border-l-[6px] pl-3 text-sm italic dark:prose-invert",
            HIGHLIGHT_COLOR_MAP["border-l"][annotation.color],
          )}
        >
          <p className="line-clamp-3">{annotation.exact}</p>
        </blockquote>
      </button>

      {isUnanchored && (
        <p className="text-xs text-muted-foreground">
          {t("annotations.sidebar.unanchored_hint")}
        </p>
      )}

      <div className="flex items-center gap-1.5">
        {ANNOTATION_COLORS.map((color) => (
          <button
            key={color}
            aria-label={color}
            disabled={isUpdating}
            className={cn(
              "size-3.5 rounded-full border",
              HIGHLIGHT_COLOR_MAP.bg[color as ZAnnotationColor],
              annotation.color === color
                ? "ring-2 ring-primary ring-offset-1"
                : "",
            )}
            onClick={() =>
              updateAnnotation({
                annotationId: annotation.id,
                color: color as ZAnnotationColor,
              })
            }
          />
        ))}
      </div>

      {isEditingComment ? (
        <div className="flex flex-col gap-1.5">
          <Textarea
            autoFocus
            value={draftComment}
            onChange={(e) => setDraftComment(e.target.value)}
            onBlur={saveComment}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.currentTarget.blur();
              } else if (e.key === "Escape") {
                setDraftComment(annotation.comment ?? "");
                setIsEditingComment(false);
              }
            }}
            placeholder={t("annotations.card.comment_placeholder")}
            className="min-h-16 text-sm"
          />
        </div>
      ) : annotation.comment ? (
        <button
          className="text-left text-sm"
          onClick={() => setIsEditingComment(true)}
        >
          <MarkdownReadonly className="prose-sm">
            {annotation.comment}
          </MarkdownReadonly>
        </button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="w-fit text-xs text-muted-foreground"
          onClick={() => setIsEditingComment(true)}
        >
          <Pencil className="mr-1 size-3" />
          {t("annotations.card.add_comment")}
        </Button>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {format(annotation.createdAt, "PP p")}
        </span>
        <ActionConfirmingDialog
          title={t("annotations.card.delete_confirmation_title")}
          description={t("annotations.card.delete_confirmation_description")}
          actionButton={(setDialogOpen) => (
            <ActionButton
              type="button"
              variant="destructive"
              loading={isDeleting}
              onClick={() => {
                deleteAnnotation({ annotationId: annotation.id });
                setDialogOpen(false);
              }}
            >
              {t("actions.delete")}
            </ActionButton>
          )}
        >
          <Button variant="ghost" size="icon" className="size-7">
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        </ActionConfirmingDialog>
      </div>
    </div>
  );
}
