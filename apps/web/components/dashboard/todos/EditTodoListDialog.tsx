"use client";

import { useEffect, useRef, useState } from "react";
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

import { TodoListTagsEditor } from "./TodoListTagsEditor";

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

  // Only reset the form on a real open/entity transition (dialog going from
  // closed to open, or being handed a different list to edit) - not on every
  // re-render that hands `todoList` a new object reference while the dialog
  // stays open (e.g. a tag mutation inside this same dialog invalidating the
  // query), which would otherwise silently discard in-progress edits.
  const prevOpenRef = useRef(false);
  const prevListIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const openedNow = open && !prevOpenRef.current;
    const listChanged = open && todoList?.id !== prevListIdRef.current;
    if (openedNow || listChanged) {
      form.reset({
        name: todoList?.name ?? "",
        icon: todoList?.icon ?? "📋",
      });
    }
    prevOpenRef.current = open;
    prevListIdRef.current = todoList?.id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, todoList]);

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
            {isEdit && (
              <FormItem>
                <FormLabel>{t("common.tags")}</FormLabel>
                <FormControl>
                  <TodoListTagsEditor todoList={todoList} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
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
