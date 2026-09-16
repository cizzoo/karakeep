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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import {
  useAddTodoItem,
  useEditTodoItem,
  useMoveTodoItem,
  useTodoLists,
} from "@karakeep/shared-react/hooks/todoLists";
import { zNewTodoItemSchema, ZTodoItem } from "@karakeep/shared/types/todos";

import { LinkedBookmarksSectionForItem } from "./LinkedBookmarksSectionForItem";
import { TodoItemTagsEditor } from "./TodoItemTagsEditor";

// The sole way to create or edit a todo item (replaces the old quick-add
// input in `TodoItemsList` and the click-to-inline-edit text in
// `TodoItemRow`). Mirrors `EditTodoListDialog`'s controlled
// open/setOpen-or-children-trigger pattern.
//
// A brand-new item has no `todoItemId` until `addItem` succeeds, so tags and
// linked bookmarks (which need one) can't be edited yet - same constraint
// `EditTodoListDialog` has for a not-yet-created list. Rather than making
// the user submit, close, and reopen to attach tags/bookmarks, a successful
// create transitions the dialog in place into editing the item that was
// just created (`createdItem` below), revealing those sections without
// closing. The footer's primary button reflects this: "Create" before the
// item exists, then "Done" once editing (whether that's because the item
// was *just* created, or because the dialog was opened in edit mode for an
// existing item from the start) - either way, clicking it commits any
// pending name/list change and closes.
export function EditTodoItemDialog({
  open: userOpen,
  setOpen: userSetOpen,
  todoItem,
  defaultTodoListId,
  children,
}: {
  open?: boolean;
  setOpen?: (v: boolean) => void;
  todoItem?: ZTodoItem;
  defaultTodoListId?: string;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [customOpen, customSetOpen] = useState(false);
  const [open, setOpen] = [
    userOpen ?? customOpen,
    userSetOpen ?? customSetOpen,
  ];

  // Set once `addItem` succeeds in this dialog session, so the dialog can
  // transition from "create" to "edit" without closing. `todoItem` (an
  // already-existing item passed in from the start) takes precedence.
  const [createdItem, setCreatedItem] = useState<ZTodoItem | undefined>();
  const activeItem = todoItem ?? createdItem;
  const isEdit = !!activeItem;
  // True only when we're in edit mode *because* a create just transitioned
  // into it (as opposed to the dialog having been opened in edit mode for
  // an already-existing item from the start) - used only to pick the
  // footer button's label ("Done" vs "Save").
  const justCreated = !todoItem && !!createdItem;

  const { data: todoListsData } = useTodoLists({ enabled: open });
  const todoLists = todoListsData?.todoLists ?? [];

  const form = useForm({
    resolver: zodResolver(zNewTodoItemSchema),
    defaultValues: {
      text: todoItem?.text ?? "",
      todoListId: todoItem?.todoListId ?? defaultTodoListId ?? "",
    },
  });

  // Only reset the form on a real open/entity transition (dialog going from
  // closed to open, or being handed a different item to edit) - not on every
  // re-render that hands `todoItem` a new object reference while the dialog
  // stays open (e.g. a tag/linked-bookmark mutation inside this same dialog
  // invalidating the query), which would otherwise silently discard
  // in-progress edits.
  const prevOpenRef = useRef(false);
  const prevItemIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const openedNow = open && !prevOpenRef.current;
    const itemChanged = open && todoItem?.id !== prevItemIdRef.current;
    if (openedNow || itemChanged) {
      form.reset({
        text: todoItem?.text ?? "",
        todoListId: todoItem?.todoListId ?? defaultTodoListId ?? "",
      });
      setCreatedItem(undefined);
    }
    prevOpenRef.current = open;
    prevItemIdRef.current = todoItem?.id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, todoItem, defaultTodoListId]);

  const { mutate: addTodoItem, isPending: isAdding } = useAddTodoItem({
    onSuccess: (created) => {
      toast({ description: t("toasts.todos.item_added") });
      setCreatedItem(created);
      form.reset({ text: created.text, todoListId: created.todoListId });
    },
    onError: () => {
      toast({
        variant: "destructive",
        description: t("common.something_went_wrong"),
      });
    },
  });

  const { mutateAsync: editTodoItemAsync, isPending: isSavingText } =
    useEditTodoItem({
      onError: () => {
        toast({
          variant: "destructive",
          description: t("common.something_went_wrong"),
        });
      },
    });

  const { mutateAsync: moveTodoItemAsync, isPending: isMoving } =
    useMoveTodoItem({
      onError: () => {
        toast({
          variant: "destructive",
          description: t("common.something_went_wrong"),
        });
      },
    });

  const isPending = isAdding || isSavingText || isMoving;

  const onSubmit = form.handleSubmit(async (value) => {
    if (!activeItem) {
      addTodoItem({ todoListId: value.todoListId, text: value.text });
      return;
    }

    try {
      const tasks: Promise<unknown>[] = [];
      if (value.text !== activeItem.text) {
        tasks.push(
          editTodoItemAsync({ todoItemId: activeItem.id, text: value.text }),
        );
      }
      if (value.todoListId !== activeItem.todoListId) {
        tasks.push(
          moveTodoItemAsync({
            todoItemId: activeItem.id,
            targetTodoListId: value.todoListId,
          }),
        );
      }
      if (tasks.length > 0) {
        await Promise.all(tasks);
        toast({ description: t("toasts.todos.item_updated") });
      }
      setOpen(false);
    } catch {
      // The mutations' own onError already surfaced a toast.
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
      <DialogContent className="sm:max-w-xl">
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>
                {isEdit ? t("todos.edit_todo_item") : t("todos.new_todo_item")}
              </DialogTitle>
            </DialogHeader>
            <FormField
              control={form.control}
              name="text"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("common.name")}</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder={t("todos.add_item_placeholder")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="todoListId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("todos.list_label")}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {todoLists.map((list) => (
                        <SelectItem key={list.id} value={list.id}>
                          <span className="mr-2">{list.icon}</span>
                          {list.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {isEdit && (
              <>
                <FormItem>
                  <FormLabel>{t("common.tags")}</FormLabel>
                  <FormControl>
                    <TodoItemTagsEditor todoItem={activeItem} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
                <LinkedBookmarksSectionForItem todoItemId={activeItem.id} />
              </>
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
                {!isEdit
                  ? t("actions.create")
                  : justCreated
                    ? t("actions.done")
                    : t("actions.save")}
              </ActionButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
