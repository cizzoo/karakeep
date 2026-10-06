"use client";

import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTriggerChevron,
} from "@/components/ui/collapsible";
import { useTranslation } from "@/lib/i18n/client";

import type { ZPageAnnotation } from "@karakeep/shared/types/pageAnnotations";

import AnnotationCard from "./AnnotationCard";

export default function AnnotationSidebar({
  annotations,
  anchoredOrder,
  unanchoredIds,
  activeId,
  onSelect,
  hasArchive,
  autoEditCommentId,
}: {
  annotations: ZPageAnnotation[];
  anchoredOrder: string[];
  unanchoredIds: Set<string>;
  activeId: string | null;
  onSelect: (id: string) => void;
  hasArchive: boolean;
  autoEditCommentId: string | null;
}) {
  const { t } = useTranslation();
  const [unanchoredOpen, setUnanchoredOpen] = useState(false);
  const byId = new Map(annotations.map((a) => [a.id, a]));

  const anchoredCards = anchoredOrder
    .map((id) => byId.get(id))
    .filter((a): a is ZPageAnnotation => !!a);
  const unanchoredCards = annotations.filter((a) => unanchoredIds.has(a.id));

  if (!hasArchive) {
    return null;
  }

  if (annotations.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center text-sm text-muted-foreground">
        {t("annotations.sidebar.empty_hint")}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <span className="text-xs font-medium text-muted-foreground">
        {t("annotations.sidebar.count", { count: annotations.length })}
      </span>
      {anchoredCards.map((a) => (
        <AnnotationCard
          key={a.id}
          annotation={a}
          isActive={a.id === activeId}
          isUnanchored={false}
          onSelect={() => onSelect(a.id)}
          startInEditMode={a.id === autoEditCommentId}
        />
      ))}
      {unanchoredCards.length > 0 && (
        <Collapsible open={unanchoredOpen} onOpenChange={setUnanchoredOpen}>
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <CollapsibleTriggerChevron
              open={unanchoredOpen}
              className="size-3"
            />
            <span>
              {t("annotations.sidebar.unanchored_section", {
                count: unanchoredCards.length,
              })}
            </span>
          </div>
          <CollapsibleContent className="mt-2 flex flex-col gap-3">
            {unanchoredCards.map((a) => (
              <AnnotationCard
                key={a.id}
                annotation={a}
                isActive={a.id === activeId}
                isUnanchored={true}
                onSelect={() => onSelect(a.id)}
              />
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
