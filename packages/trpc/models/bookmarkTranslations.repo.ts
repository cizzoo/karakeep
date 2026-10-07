import { and, count, eq, inArray } from "drizzle-orm";

import type { DB } from "@karakeep/db";
import { bookmarkTranslations, highlights } from "@karakeep/db/schema";

export const DEFAULT_TARGET_LANGUAGE = "en";

// Highlights with this contentLanguage are anchored to the translated HTML.
export const ENGLISH_CONTENT_LANGUAGE = "en";

export type BookmarkTranslationRow = typeof bookmarkTranslations.$inferSelect;

export class BookmarkTranslationsRepo {
  constructor(private db: DB) {}

  async getForBookmark(
    bookmarkId: string,
    targetLanguage = DEFAULT_TARGET_LANGUAGE,
  ): Promise<BookmarkTranslationRow | null> {
    const row = await this.db.query.bookmarkTranslations.findFirst({
      where: and(
        eq(bookmarkTranslations.bookmarkId, bookmarkId),
        eq(bookmarkTranslations.targetLanguage, targetLanguage),
      ),
    });
    return row ?? null;
  }

  async countEnglishHighlights(bookmarkId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: count() })
      .from(highlights)
      .where(
        and(
          eq(highlights.bookmarkId, bookmarkId),
          eq(highlights.contentLanguage, ENGLISH_CONTENT_LANGUAGE),
        ),
      );
    return row?.count ?? 0;
  }

  // Creates the row, or resets the existing (bookmark, language) row back to
  // pending for a fresh run.
  async upsertPending(input: {
    bookmarkId: string;
    userId: string;
    model: string;
    promptVersion: number;
    targetLanguage?: string;
    // Also drops the highlights anchored to the translation being replaced.
    deleteEnglishHighlights?: boolean;
  }): Promise<BookmarkTranslationRow> {
    const reset = {
      status: "pending" as const,
      phase: null,
      progressDone: 0,
      progressTotal: 0,
      failedUnits: 0,
      model: input.model,
      promptVersion: input.promptVersion,
      error: null,
      sourceHash: null,
      translatedHtml: null,
    };
    return this.db.transaction((tx) => {
      if (input.deleteEnglishHighlights) {
        tx.delete(highlights)
          .where(
            and(
              eq(highlights.bookmarkId, input.bookmarkId),
              eq(highlights.contentLanguage, ENGLISH_CONTENT_LANGUAGE),
            ),
          )
          .run();
      }
      return tx
        .insert(bookmarkTranslations)
        .values({
          bookmarkId: input.bookmarkId,
          userId: input.userId,
          targetLanguage: input.targetLanguage ?? DEFAULT_TARGET_LANGUAGE,
          ...reset,
        })
        .onConflictDoUpdate({
          target: [
            bookmarkTranslations.bookmarkId,
            bookmarkTranslations.targetLanguage,
          ],
          set: reset,
        })
        .returning()
        .get();
    });
  }

  async cancelActive(id: string): Promise<void> {
    await this.db
      .update(bookmarkTranslations)
      .set({ status: "cancelled", phase: null })
      .where(
        and(
          eq(bookmarkTranslations.id, id),
          inArray(bookmarkTranslations.status, ["pending", "running"]),
        ),
      );
  }

  // Deletes the translation together with the highlights made on it.
  async delete(row: BookmarkTranslationRow): Promise<void> {
    this.db.transaction((tx) => {
      tx.delete(highlights)
        .where(
          and(
            eq(highlights.bookmarkId, row.bookmarkId),
            eq(highlights.contentLanguage, ENGLISH_CONTENT_LANGUAGE),
          ),
        )
        .run();
      tx.delete(bookmarkTranslations)
        .where(eq(bookmarkTranslations.id, row.id))
        .run();
    });
  }
}
