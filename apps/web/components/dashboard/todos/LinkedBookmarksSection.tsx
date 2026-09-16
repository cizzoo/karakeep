"use client";

import { ActionButtonWithTooltip } from "@/components/ui/action-button";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { X } from "lucide-react";

import {
  useAttachBookmarkToTodoList,
  useDetachBookmarkFromTodoList,
  useLinkedBookmarks,
} from "@karakeep/shared-react/hooks/todoLists";
import { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { ZTodoListLinkedBookmarks } from "@karakeep/shared/types/todos";

import BookmarkCard from "../bookmarks/BookmarkCard";
import { BookmarkPicker } from "./BookmarkPicker";

// Bookmarks linked to a todo list (or item) are rendered with the same
// `BookmarkCard` used everywhere else in the app (grids, search results)
// instead of a bespoke row component - only the "unlink" affordance
// overlaid on top of it is specific to this context. Shared between the
// list-scoped section below and the item-scoped
// `LinkedBookmarksSectionForItem`, so the grid markup only lives once.
export function LinkedBookmarksGrid({
  bookmarks,
  onUnlink,
  unlinkingBookmarkId,
}: {
  bookmarks: ZBookmark[];
  onUnlink: (bookmarkId: string) => void;
  unlinkingBookmarkId?: string;
}) {
  const { t } = useTranslation();

  if (bookmarks.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        {t("todos.no_linked_bookmarks")}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {bookmarks.map((bookmark) => (
        <div key={bookmark.id} className="group/linked relative">
          <BookmarkCard bookmark={bookmark} />
          <ActionButtonWithTooltip
            type="button"
            variant="secondary"
            size="icon"
            tooltip={t("todos.unlink_bookmark")}
            aria-label={t("todos.unlink_bookmark")}
            loading={unlinkingBookmarkId === bookmark.id}
            className="absolute right-2 top-2 z-50 size-7 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover/linked:opacity-100"
            onClick={() => onUnlink(bookmark.id)}
          >
            <X className="size-4" />
          </ActionButtonWithTooltip>
        </div>
      ))}
    </div>
  );
}

export function LinkedBookmarksSection({
  todoListId,
  initialData,
}: {
  todoListId: string;
  initialData?: ZTodoListLinkedBookmarks;
}) {
  const { t } = useTranslation();
  const { data } = useLinkedBookmarks({ todoListId }, { initialData });
  const bookmarks = data?.bookmarks ?? initialData?.bookmarks ?? [];

  const { mutate: attachBookmark, isPending: isAttaching } =
    useAttachBookmarkToTodoList({
      onSuccess: () => {
        toast({ description: t("toasts.todos.bookmark_linked") });
      },
      onError: (e) => {
        toast({
          variant: "destructive",
          description:
            e.data?.code === "NOT_FOUND"
              ? t("todos.bookmark_not_found")
              : t("common.something_went_wrong"),
        });
      },
    });

  const { mutate: detachBookmark, variables: detachingVariables } =
    useDetachBookmarkFromTodoList({
      onSuccess: () => {
        toast({ description: t("toasts.todos.bookmark_unlinked") });
      },
      onError: () => {
        toast({
          variant: "destructive",
          description: t("common.something_went_wrong"),
        });
      },
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium">{t("todos.linked_bookmarks")}</h2>
        <BookmarkPicker
          disabled={isAttaching}
          excludeBookmarkIds={bookmarks.map((b) => b.id)}
          onSelect={(bookmarkId) => attachBookmark({ todoListId, bookmarkId })}
        />
      </div>
      <LinkedBookmarksGrid
        bookmarks={bookmarks}
        unlinkingBookmarkId={detachingVariables?.bookmarkId}
        onUnlink={(bookmarkId) => detachBookmark({ todoListId, bookmarkId })}
      />
    </div>
  );
}
