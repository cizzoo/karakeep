import { z } from "zod";

import {
  zTranslatedContentSchema,
  zTranslationStatusSchema,
} from "@karakeep/shared/types/bookmarkTranslations";

import { createScopedAuthedProcedure, router } from "../index";
import { actorFromContext } from "../lib/actor";
import { BookmarkTranslationsService } from "../models/bookmarkTranslations.service";
import { ensureBookmarkOwnership } from "./bookmarks";

const bookmarkTranslationsProcedure = createScopedAuthedProcedure(
  "bookmarkTranslations",
).use((opts) => {
  return opts.next({
    ctx: {
      ...opts.ctx,
      actor: actorFromContext(opts.ctx),
      bookmarkTranslationsService: new BookmarkTranslationsService(opts.ctx.db),
    },
  });
});

const bookmarkInput = z.object({ bookmarkId: z.string() });

export const bookmarkTranslationsAppRouter = router({
  translate: bookmarkTranslationsProcedure
    .input(bookmarkInput)
    .output(zTranslationStatusSchema)
    .use(ensureBookmarkOwnership)
    .mutation(async ({ ctx }) => {
      return await ctx.bookmarkTranslationsService.translate(
        ctx.actor,
        ctx.bookmark.id,
      );
    }),
  getStatus: bookmarkTranslationsProcedure
    .input(bookmarkInput)
    .output(zTranslationStatusSchema.nullable())
    .use(ensureBookmarkOwnership)
    .query(async ({ ctx }) => {
      return await ctx.bookmarkTranslationsService.get(
        ctx.bookmark.id,
        ctx.user.id,
      );
    }),
  getTranslatedContent: bookmarkTranslationsProcedure
    .input(bookmarkInput)
    .output(zTranslatedContentSchema.nullable())
    .use(ensureBookmarkOwnership)
    .query(async ({ ctx }) => {
      return await ctx.bookmarkTranslationsService.getContent(ctx.bookmark.id);
    }),
  cancel: bookmarkTranslationsProcedure
    .input(bookmarkInput)
    .output(z.void())
    .use(ensureBookmarkOwnership)
    .mutation(async ({ ctx }) => {
      await ctx.bookmarkTranslationsService.cancel(ctx.bookmark.id);
    }),
  delete: bookmarkTranslationsProcedure
    .input(bookmarkInput)
    .output(z.void())
    .use(ensureBookmarkOwnership)
    .mutation(async ({ ctx }) => {
      await ctx.bookmarkTranslationsService.delete(ctx.bookmark.id);
    }),
});
