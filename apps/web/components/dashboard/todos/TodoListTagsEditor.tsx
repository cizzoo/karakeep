"use client";

import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";

import { useUpdateTodoListTags } from "@karakeep/shared-react/hooks/todoLists";
import { ZTodoList } from "@karakeep/shared/types/todos";

import { TagsEditor } from "../bookmarks/TagsEditor";

// Todo lists tag into the exact same tag pool bookmarks use, so this reuses
// the same generic `TagsEditor` (autocomplete + create-on-the-fly) that
// bookmarks use, rather than building a second bespoke tag input.
export function TodoListTagsEditor({
  todoList,
  disabled,
}: {
  todoList: ZTodoList;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { mutate } = useUpdateTodoListTags({
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
      tags={todoList.tags.map((tag) => ({
        ...tag,
        // Todo list tags have no AI/human distinction - they're always
        // user-attached, so the editor's "attachedBy" badge is always human.
        attachedBy: "human" as const,
      }))}
      disabled={disabled}
      onAttach={({ tagName, tagId }) => {
        mutate({
          todoListId: todoList.id,
          attach: [{ tagName, tagId }],
          detach: [],
        });
      }}
      onDetach={({ tagId }) => {
        mutate({
          todoListId: todoList.id,
          attach: [],
          detach: [{ tagId }],
        });
      }}
    />
  );
}
