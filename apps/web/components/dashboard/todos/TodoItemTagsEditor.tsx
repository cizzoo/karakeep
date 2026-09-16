"use client";

import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";

import { useUpdateTodoItemTags } from "@karakeep/shared-react/hooks/todoLists";
import { ZTodoItem } from "@karakeep/shared/types/todos";

import { TagsEditor } from "../bookmarks/TagsEditor";

// Item-scoped sibling of `TodoListTagsEditor` - todo items tag into the
// exact same shared tag pool bookmarks/todo lists use, one level down, so
// this is otherwise identical apart from which mutation it calls.
export function TodoItemTagsEditor({
  todoItem,
  disabled,
}: {
  todoItem: ZTodoItem;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { mutate } = useUpdateTodoItemTags({
    onSuccess: () => {
      toast({ description: t("toasts.todos.tags_updated") });
    },
    onError: () => {
      toast({
        variant: "destructive",
        description: t("common.something_went_wrong"),
      });
    },
  });

  return (
    <TagsEditor
      tags={todoItem.tags.map((tag) => ({
        ...tag,
        // Todo item tags have no AI/human distinction - they're always
        // user-attached, so the editor's "attachedBy" badge is always human.
        attachedBy: "human" as const,
      }))}
      disabled={disabled}
      onAttach={({ tagName, tagId }) => {
        mutate({
          todoItemId: todoItem.id,
          attach: [{ tagName, tagId }],
          detach: [],
        });
      }}
      onDetach={({ tagId }) => {
        mutate({
          todoItemId: todoItem.id,
          attach: [],
          detach: [{ tagId }],
        });
      }}
    />
  );
}
