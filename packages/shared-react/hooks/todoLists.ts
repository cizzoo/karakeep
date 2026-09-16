import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  ZTodoItem,
  ZTodoItemLinkedBookmarks,
  ZTodoList,
  ZTodoListLinkedBookmarks,
} from "@karakeep/shared/types/todos";

import { useTRPC } from "../trpc";

type TRPCApi = ReturnType<typeof useTRPC>;

export function useTodoLists(opts?: {
  initialData?: { todoLists: ZTodoList[] };
  enabled?: boolean;
}) {
  const api = useTRPC();
  return useQuery(api.todoLists.list.queryOptions(undefined, opts));
}

export function useTodoList(
  input: { todoListId: string },
  opts?: { initialData?: ZTodoList; enabled?: boolean },
) {
  const api = useTRPC();
  return useQuery(api.todoLists.get.queryOptions(input, opts));
}

export function useCreateTodoList(
  opts?: Parameters<TRPCApi["todoLists"]["create"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.todoLists.create.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(api.todoLists.list.pathFilter());
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useEditTodoList(
  opts?: Parameters<TRPCApi["todoLists"]["edit"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.todoLists.edit.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(api.todoLists.list.pathFilter());
        queryClient.invalidateQueries(
          api.todoLists.get.queryFilter({ todoListId: req.todoListId }),
        );
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useDeleteTodoList(
  opts?: Parameters<TRPCApi["todoLists"]["delete"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.todoLists.delete.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(api.todoLists.list.pathFilter());
        queryClient.removeQueries(
          api.todoLists.getItems.queryFilter({ todoListId: req.todoListId }),
        );
        queryClient.removeQueries(
          api.todoLists.get.queryFilter({ todoListId: req.todoListId }),
        );
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useTodoItems(
  input: { todoListId: string },
  opts?: { initialData?: { items: ZTodoItem[] }; enabled?: boolean },
) {
  const api = useTRPC();
  return useQuery(api.todoLists.getItems.queryOptions(input, opts));
}

export function useAddTodoItem(
  opts?: Parameters<TRPCApi["todoLists"]["addItem"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.todoLists.addItem.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(
          api.todoLists.getItems.queryFilter({ todoListId: req.todoListId }),
        );
        queryClient.invalidateQueries(api.todoLists.list.pathFilter());
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useEditTodoItem(
  opts?: Parameters<TRPCApi["todoLists"]["editItem"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.todoLists.editItem.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(
          api.todoLists.getItems.queryFilter({ todoListId: res.todoListId }),
        );
        queryClient.invalidateQueries(api.todoLists.list.pathFilter());
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useDeleteTodoItem(
  opts?: Parameters<TRPCApi["todoLists"]["deleteItem"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.todoLists.deleteItem.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(
          api.todoLists.getItems.queryFilter({ todoListId: res.todoListId }),
        );
        queryClient.invalidateQueries(api.todoLists.list.pathFilter());
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useMoveTodoItem(
  opts?: Parameters<TRPCApi["todoLists"]["moveItem"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.todoLists.moveItem.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        // `req` only carries the item's *target* list id
        // (`targetTodoListId`) - its *source* list id isn't known
        // client-side (only `ensureTodoItemOwnership` resolves it,
        // server-side, from `todoItemId`), so rather than guessing it we
        // invalidate every cached `getItems` query. This still covers both
        // the source and target list's item lists.
        queryClient.invalidateQueries(api.todoLists.getItems.pathFilter());
        // itemsCount/doneCount summaries on both lists' cards change too.
        queryClient.invalidateQueries(api.todoLists.list.pathFilter());
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useReorderTodoItems(
  opts?: Parameters<TRPCApi["todoLists"]["reorderItems"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.todoLists.reorderItems.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(
          api.todoLists.getItems.queryFilter({ todoListId: req.todoListId }),
        );
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useUpdateTodoListTags(
  opts?: Parameters<TRPCApi["todoLists"]["updateTags"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.todoLists.updateTags.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        // The list's own `get` cache and the summary `list` cache (cards may
        // show tags too) both embed the list's tags, so both need refreshing.
        queryClient.invalidateQueries(
          api.todoLists.get.queryFilter({ todoListId: req.todoListId }),
        );
        queryClient.invalidateQueries(api.todoLists.list.pathFilter());
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useUpdateTodoItemTags(
  opts?: Parameters<
    TRPCApi["todoLists"]["updateItemTags"]["mutationOptions"]
  >[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.todoLists.updateItemTags.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        // `req` only carries `todoItemId`, so - mirroring
        // `useEditTodoItem` - the affected list id comes from the
        // response instead.
        queryClient.invalidateQueries(
          api.todoLists.getItems.queryFilter({ todoListId: res.todoListId }),
        );
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useLinkedBookmarks(
  input: { todoListId: string },
  opts?: {
    initialData?: { bookmarks: ZTodoListLinkedBookmarks["bookmarks"] };
    enabled?: boolean;
  },
) {
  const api = useTRPC();
  return useQuery(api.todoLists.getLinkedBookmarks.queryOptions(input, opts));
}

export function useAttachBookmarkToTodoList(
  opts?: Parameters<
    TRPCApi["todoLists"]["attachBookmark"]["mutationOptions"]
  >[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.todoLists.attachBookmark.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(
          api.todoLists.getLinkedBookmarks.queryFilter({
            todoListId: req.todoListId,
          }),
        );
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useDetachBookmarkFromTodoList(
  opts?: Parameters<
    TRPCApi["todoLists"]["detachBookmark"]["mutationOptions"]
  >[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.todoLists.detachBookmark.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(
          api.todoLists.getLinkedBookmarks.queryFilter({
            todoListId: req.todoListId,
          }),
        );
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useLinkedBookmarksForItem(
  input: { todoItemId: string },
  opts?: {
    initialData?: { bookmarks: ZTodoItemLinkedBookmarks["bookmarks"] };
    enabled?: boolean;
  },
) {
  const api = useTRPC();
  return useQuery(
    api.todoLists.getLinkedBookmarksForItem.queryOptions(input, opts),
  );
}

export function useAttachBookmarkToItem(
  opts?: Parameters<
    TRPCApi["todoLists"]["attachBookmarkToItem"]["mutationOptions"]
  >[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.todoLists.attachBookmarkToItem.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(
          api.todoLists.getLinkedBookmarksForItem.queryFilter({
            todoItemId: req.todoItemId,
          }),
        );
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useDetachBookmarkFromItem(
  opts?: Parameters<
    TRPCApi["todoLists"]["detachBookmarkFromItem"]["mutationOptions"]
  >[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.todoLists.detachBookmarkFromItem.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(
          api.todoLists.getLinkedBookmarksForItem.queryFilter({
            todoItemId: req.todoItemId,
          }),
        );
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}
