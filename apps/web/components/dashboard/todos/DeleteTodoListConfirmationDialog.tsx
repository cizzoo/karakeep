"use client";

import { usePathname, useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";

import { useDeleteTodoList } from "@karakeep/shared-react/hooks/todoLists";
import { ZTodoList } from "@karakeep/shared/types/todos";

export default function DeleteTodoListConfirmationDialog({
  todoList,
  children,
  open,
  setOpen,
}: {
  todoList: ZTodoList;
  children?: React.ReactNode;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const currentPath = usePathname();
  const router = useRouter();

  const { mutate: deleteTodoList, isPending } = useDeleteTodoList({
    onSuccess: () => {
      toast({ description: t("toasts.todos.deleted") });
      setOpen(false);
      if (currentPath.includes(todoList.id)) {
        router.push("/dashboard/todos");
      }
    },
    onError: () => {
      toast({
        variant: "destructive",
        description: t("common.something_went_wrong"),
      });
    },
  });

  return (
    <ActionConfirmingDialog
      open={open}
      setOpen={setOpen}
      title={t("todos.delete_todo_list.title")}
      description={t("todos.delete_todo_list.description")}
      actionButton={() => (
        <ActionButton
          type="button"
          variant="destructive"
          loading={isPending}
          onClick={() => deleteTodoList({ todoListId: todoList.id })}
        >
          {t("actions.delete")}
        </ActionButton>
      )}
    >
      {children}
    </ActionConfirmingDialog>
  );
}
