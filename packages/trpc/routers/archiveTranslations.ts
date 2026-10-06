import { z } from "zod";

import { zTranslationStatusSchema } from "@karakeep/shared/types/archiveTranslations";

import { createScopedAuthedProcedure, router } from "../index";
import { actorFromContext } from "../lib/actor";
import { ArchiveTranslationsService } from "../models/archiveTranslations.service";
import { ensureBookmarkOwnership } from "./bookmarks";

const archiveTranslationsProcedure = createScopedAuthedProcedure(
  "archiveTranslations",
).use((opts) => {
  return opts.next({
    ctx: {
      ...opts.ctx,
      actor: actorFromContext(opts.ctx),
      archiveTranslationsService: new ArchiveTranslationsService(opts.ctx.db),
    },
  });
});

const bookmarkInput = z.object({ bookmarkId: z.string() });

export const archiveTranslationsAppRouter = router({
  translateArchive: archiveTranslationsProcedure
    .input(bookmarkInput)
    .output(zTranslationStatusSchema)
    .use(ensureBookmarkOwnership)
    .mutation(async ({ ctx }) => {
      return await ctx.archiveTranslationsService.translate(
        ctx.actor,
        ctx.bookmark.id,
      );
    }),
  getArchiveTranslation: archiveTranslationsProcedure
    .input(bookmarkInput)
    .output(zTranslationStatusSchema.nullable())
    .use(ensureBookmarkOwnership)
    .query(async ({ ctx }) => {
      return await ctx.archiveTranslationsService.get(ctx.bookmark.id);
    }),
  cancelArchiveTranslation: archiveTranslationsProcedure
    .input(bookmarkInput)
    .output(z.void())
    .use(ensureBookmarkOwnership)
    .mutation(async ({ ctx }) => {
      await ctx.archiveTranslationsService.cancel(ctx.bookmark.id);
    }),
});
