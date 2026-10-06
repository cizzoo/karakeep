import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "../trpc";

type TRPCApi = ReturnType<typeof useTRPC>;

function useInvalidateTranslation() {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return (bookmarkId: string) => {
    queryClient.invalidateQueries(
      api.archiveTranslations.getArchiveTranslation.queryFilter({
        bookmarkId,
      }),
    );
    queryClient.invalidateQueries(
      api.pageAnnotations.getArchiveInfo.queryFilter({ bookmarkId }),
    );
  };
}

export function useTranslateArchive(
  opts?: Parameters<
    TRPCApi["archiveTranslations"]["translateArchive"]["mutationOptions"]
  >[0],
) {
  const api = useTRPC();
  const invalidate = useInvalidateTranslation();
  return useMutation(
    api.archiveTranslations.translateArchive.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        invalidate(req.bookmarkId);
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useCancelArchiveTranslation(
  opts?: Parameters<
    TRPCApi["archiveTranslations"]["cancelArchiveTranslation"]["mutationOptions"]
  >[0],
) {
  const api = useTRPC();
  const invalidate = useInvalidateTranslation();
  return useMutation(
    api.archiveTranslations.cancelArchiveTranslation.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        invalidate(req.bookmarkId);
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}
