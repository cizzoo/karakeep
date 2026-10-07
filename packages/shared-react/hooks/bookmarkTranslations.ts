import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "../trpc";

type TRPCApi = ReturnType<typeof useTRPC>;

function useInvalidateTranslation() {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return (bookmarkId: string) => {
    queryClient.invalidateQueries(
      api.bookmarkTranslations.getStatus.queryFilter({ bookmarkId }),
    );
    queryClient.invalidateQueries(
      api.bookmarkTranslations.getTranslatedContent.queryFilter({
        bookmarkId,
      }),
    );
  };
}

export function useTranslateBookmark(
  opts?: Parameters<
    TRPCApi["bookmarkTranslations"]["translate"]["mutationOptions"]
  >[0],
) {
  const api = useTRPC();
  const invalidate = useInvalidateTranslation();
  return useMutation(
    api.bookmarkTranslations.translate.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        invalidate(req.bookmarkId);
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useCancelBookmarkTranslation(
  opts?: Parameters<
    TRPCApi["bookmarkTranslations"]["cancel"]["mutationOptions"]
  >[0],
) {
  const api = useTRPC();
  const invalidate = useInvalidateTranslation();
  return useMutation(
    api.bookmarkTranslations.cancel.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        invalidate(req.bookmarkId);
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useDeleteBookmarkTranslation(
  opts?: Parameters<
    TRPCApi["bookmarkTranslations"]["delete"]["mutationOptions"]
  >[0],
) {
  const api = useTRPC();
  const invalidate = useInvalidateTranslation();
  return useMutation(
    api.bookmarkTranslations.delete.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        invalidate(req.bookmarkId);
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}
