"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/client";
import { MessageSquarePlus } from "lucide-react";

import { HIGHLIGHT_COLOR_MAP } from "@karakeep/shared-react/components/highlights";
import type { ZAnnotationColor } from "@karakeep/shared/types/pageAnnotations";

import { ANNOTATION_COLORS } from "@/lib/annotations/rendering";

export default function SelectionPopover({
  top,
  left,
  defaultColor,
  onHighlight,
  onHighlightWithComment,
}: {
  top: number;
  left: number;
  defaultColor: ZAnnotationColor;
  onHighlight: (color: ZAnnotationColor) => void;
  onHighlightWithComment: (color: ZAnnotationColor) => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      className="absolute z-50 flex -translate-x-1/2 -translate-y-full flex-col gap-2 rounded-md border bg-popover p-2 shadow-md"
      style={{ top, left }}
    >
      <div className="flex items-center gap-1.5">
        {ANNOTATION_COLORS.map((color) => (
          <button
            key={color}
            aria-label={color}
            className={cn(
              "size-5 rounded-full border",
              HIGHLIGHT_COLOR_MAP.bg[color as ZAnnotationColor],
              color === defaultColor ? "ring-2 ring-primary ring-offset-1" : "",
            )}
            onClick={() => onHighlight(color as ZAnnotationColor)}
          />
        ))}
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          title={t("annotations.popover.highlight_with_comment")}
          onClick={() => onHighlightWithComment(defaultColor)}
        >
          <MessageSquarePlus className="size-4" />
        </Button>
      </div>
    </div>
  );
}
