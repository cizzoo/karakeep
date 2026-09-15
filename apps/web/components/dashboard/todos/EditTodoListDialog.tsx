"use client";

import { useEffect, useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import {
  useCreateTodoList,
  useEditTodoList,
} from "@karakeep/shared-react/hooks/todoLists";
import { zNewTodoListSchema, ZTodoList } from "@karakeep/shared/types/todos";

export function EditTodoListDialog({
  open: userOpen,
  setOpen: userSetOpen,
  todoList,
  children,
}: {
  open?: boolean;
  setOpen?: (v: boolean) => void;
  todoList?: ZTodoList;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [customOpen, customSetOpen] = useState(false);
  const [open, setOpen] = [
    userOpen ?? customOpen,
    userSetOpen ?? customSetOpen,
  ];

  const form = useForm({
    resolver: zodResolver(zNewTodoListSchema),
    defaultValues: {
      name: todoList?.name ?? "",
      icon: todoList?.icon ?? "📋",
    },
  });

  useEffect(() => {
    form.reset({
      name: todoList?.name ?? "",
      icon: todoList?.icon ?? "📋",
    });
  }, [open, todoList, form]);

  const { mutate: createTodoList, isPending: isCreating } = useCreateTodoList({
    onSuccess: () => {
      toast({ description: t("toasts.todos.created") });
      setOpen(false);
      form.reset();
    },
    onError: () => {
      toast({
        variant: "destructive",
        description: t("common.something_went_wrong"),
      });
    },
  });

  const { mutate: editTodoList, isPending: isEditing } = useEditTodoList({
    onSuccess: () => {
      toast({ description: t("toasts.todos.updated") });
      setOpen(false);
    },
    onError: () => {
      toast({
        variant: "destructive",
        description: t("common.something_went_wrong"),
      });
    },
  });

  const isEdit = !!todoList;
  const isPending = isCreating || isEditing;

  const onSubmit = form.handleSubmit((value) => {
    if (isEdit) {
      editTodoList({ todoListId: todoList.id, ...value });
    } else {
      createTodoList(value);
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(s) => {
        form.reset();
        setOpen(s);
      }}
    >
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent>
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>
                {isEdit ? t("todos.edit_todo_list") : t("todos.new_todo_list")}
              </DialogTitle>
            </DialogHeader>
            <div className="flex w-full gap-2">
              <FormField
                control={form.control}
                name="icon"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("todos.icon_label")}</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        className="w-16 text-center"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="grow">
                    <FormLabel>{t("common.name")}</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        className="w-full"
                        placeholder={t("todos.name_placeholder")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter className="sm:justify-end">
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  {t("actions.close")}
                </Button>
              </DialogClose>
              <ActionButton
                type="submit"
                onClick={onSubmit}
                loading={isPending}
              >
                {isEdit ? t("actions.save") : t("actions.create")}
              </ActionButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
