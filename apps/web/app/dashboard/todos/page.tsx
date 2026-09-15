import type { Metadata } from "next";
import AllTodoLists from "@/components/dashboard/todos/AllTodoLists";
import { EditTodoListDialog } from "@/components/dashboard/todos/EditTodoListDialog";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/server";
import { api } from "@/server/api/client";
import { Plus } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("common.todos")} | Karakeep`,
  };
}

export default async function TodosPage() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  const { todoLists } = await api.todoLists.list();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl tracking-normal text-foreground">
            ✅ {t("todos.all_todo_lists")}
          </h1>
          <p className="text-md text-muted-foreground">
            {t("todos.summary_list", { count: todoLists.length })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EditTodoListDialog>
            <Button className="h-11 gap-2 rounded-lg">
              <Plus className="size-4" />
              <span>{t("todos.new_todo_list")}</span>
            </Button>
          </EditTodoListDialog>
        </div>
      </div>
      <AllTodoLists initialData={todoLists} />
    </div>
  );
}
