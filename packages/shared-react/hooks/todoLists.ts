import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ZTodoItem, ZTodoList } from "@karakeep/shared/types/todos";

import { useTRPC } from "../trpc";

type TRPCApi = ReturnType<typeof useTRPC>;

export function useTodoLists(opts?: {
  initialData?: { todoLists: ZTodoList[] };
  enabled?: boolean;
}) {
  const api = useTRPC();
  return useQuery(api.todoLists.list.queryOptions(undefined, opts));
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
