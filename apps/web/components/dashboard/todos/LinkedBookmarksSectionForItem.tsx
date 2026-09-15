"use client";

import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";

import {
  useAttachBookmarkToItem,
  useDetachBookmarkFromItem,
  useLinkedBookmarksForItem,
} from "@karakeep/shared-react/hooks/todoLists";
import { ZTodoItemLinkedBookmarks } from "@karakeep/shared/types/todos";

import { BookmarkPicker } from "./BookmarkPicker";
import { LinkedBookmarksGrid } from "./LinkedBookmarksSection";

// Item-scoped sibling of `LinkedBookmarksSection` (list-scoped) - same
// shared `LinkedBookmarksGrid`/`BookmarkPicker` building blocks, just wired
// to the item-level hooks instead of the list-level ones.
export function LinkedBookmarksSectionForItem({
  todoItemId,
  initialData,
}: {
  todoItemId: string;
  initialData?: ZTodoItemLinkedBookmarks;
}) {
  const { t } = useTranslation();
  const { data } = useLinkedBookmarksForItem({ todoItemId }, { initialData });
  const bookmarks = data?.bookmarks ?? initialData?.bookmarks ?? [];

  const { mutate: attachBookmark, isPending: isAttaching } =
    useAttachBookmarkToItem({
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
    useDetachBookmarkFromItem({
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
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-medium">{t("todos.linked_bookmarks")}</h3>
        <BookmarkPicker
          disabled={isAttaching}
          excludeBookmarkIds={bookmarks.map((b) => b.id)}
          onSelect={(bookmarkId) => attachBookmark({ todoItemId, bookmarkId })}
        />
      </div>
      <LinkedBookmarksGrid
        bookmarks={bookmarks}
        unlinkingBookmarkId={detachingVariables?.bookmarkId}
        onUnlink={(bookmarkId) => detachBookmark({ todoItemId, bookmarkId })}
      />
    </div>
  );
}
