import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "../trpc";

type TRPCApi = ReturnType<typeof useTRPC>;

export function useCreatePageAnnotation(
  opts?: Parameters<TRPCApi["pageAnnotations"]["create"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.pageAnnotations.create.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(
          api.pageAnnotations.getForBookmark.queryFilter({
            bookmarkId: req.bookmarkId,
          }),
        );
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useUpdatePageAnnotation(
  opts?: Parameters<TRPCApi["pageAnnotations"]["update"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.pageAnnotations.update.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(
          api.pageAnnotations.getForBookmark.queryFilter({
            bookmarkId: res.bookmarkId,
          }),
        );
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useDeletePageAnnotation(
  opts?: Parameters<TRPCApi["pageAnnotations"]["delete"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.pageAnnotations.delete.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(
          api.pageAnnotations.getForBookmark.queryFilter({
            bookmarkId: res.bookmarkId,
          }),
        );
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}
