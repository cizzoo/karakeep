import { experimental_trpcMiddleware } from "@trpc/server";
import { z } from "zod";

import {
  zArchiveInfoSchema,
  zNewPageAnnotationSchema,
  zPageAnnotationSchema,
  zUpdatePageAnnotationSchema,
} from "@karakeep/shared/types/pageAnnotations";

import type { AuthedContext } from "../index";
import { createScopedAuthedProcedure, router } from "../index";
import { actorFromContext } from "../lib/actor";
import { PageAnnotationsService } from "../models/pageAnnotations.service";
import { ensureBookmarkAccess, ensureBookmarkOwnership } from "./bookmarks";

const pageAnnotationsProcedure = createScopedAuthedProcedure(
  "pageAnnotations",
).use((opts) => {
  return opts.next({
    ctx: {
      ...opts.ctx,
      actor: actorFromContext(opts.ctx),
      pageAnnotationsService: new PageAnnotationsService(opts.ctx.db),
    },
  });
});

type PageAnnotationsContext = AuthedContext & {
  actor: ReturnType<typeof actorFromContext>;
  pageAnnotationsService: PageAnnotationsService;
};

const ensurePageAnnotationOwnership = experimental_trpcMiddleware<{
  ctx: PageAnnotationsContext;
  input: { annotationId: string };
}>().create(async (opts) => {
  const annotation = await opts.ctx.pageAnnotationsService.get(
    opts.ctx.actor,
    opts.input.annotationId,
  );

  return opts.next({
    ctx: {
      ...opts.ctx,
      annotation,
    },
  });
});

export const pageAnnotationsAppRouter = router({
  getArchiveInfo: pageAnnotationsProcedure
    .input(z.object({ bookmarkId: z.string() }))
    .output(zArchiveInfoSchema)
    .use(ensureBookmarkAccess)
    .query(async ({ ctx }) => {
      return await ctx.pageAnnotationsService.getArchiveInfo(ctx.bookmark.id);
    }),
  getForBookmark: pageAnnotationsProcedure
    .input(z.object({ bookmarkId: z.string() }))
    .output(z.object({ annotations: z.array(zPageAnnotationSchema) }))
    .use(ensureBookmarkAccess)
    .query(async ({ ctx }) => {
      const annotations = await ctx.pageAnnotationsService.getForBookmark(
        ctx.bookmark.id,
      );
      return { annotations };
    }),
  create: pageAnnotationsProcedure
    .input(zNewPageAnnotationSchema)
    .output(zPageAnnotationSchema)
    .use(ensureBookmarkOwnership)
    .mutation(async ({ input, ctx }) => {
      return await ctx.pageAnnotationsService.create(ctx.actor, input);
    }),
  update: pageAnnotationsProcedure
    .input(zUpdatePageAnnotationSchema)
    .output(zPageAnnotationSchema)
    .use(ensurePageAnnotationOwnership)
    .mutation(async ({ input, ctx }) => {
      return await ctx.pageAnnotationsService.update(ctx.annotation, input);
    }),
  delete: pageAnnotationsProcedure
    .input(z.object({ annotationId: z.string() }))
    .output(zPageAnnotationSchema)
    .use(ensurePageAnnotationOwnership)
    .mutation(async ({ ctx }) => {
      return await ctx.pageAnnotationsService.delete(ctx.annotation);
    }),
});
