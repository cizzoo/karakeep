import { and, count, eq, inArray } from "drizzle-orm";

import type { DB } from "@karakeep/db";
import { archiveTranslations, pageAnnotations } from "@karakeep/db/schema";

export const DEFAULT_TARGET_LANGUAGE = "en";

export type ArchiveTranslationRow = typeof archiveTranslations.$inferSelect;

export class ArchiveTranslationsRepo {
  constructor(private db: DB) {}

  async getForBookmark(
    bookmarkId: string,
    targetLanguage = DEFAULT_TARGET_LANGUAGE,
  ): Promise<ArchiveTranslationRow | null> {
    const row = await this.db.query.archiveTranslations.findFirst({
      where: and(
        eq(archiveTranslations.bookmarkId, bookmarkId),
        eq(archiveTranslations.targetLanguage, targetLanguage),
      ),
    });
    return row ?? null;
  }

  // Creates the row, or resets the existing (bookmark, language) row back to
  // pending for a fresh run.
  async upsertPending(input: {
    bookmarkId: string;
    userId: string;
    originalAssetId: string;
    model: string;
    promptVersion: number;
    targetLanguage?: string;
  }): Promise<ArchiveTranslationRow> {
    const reset = {
      originalAssetId: input.originalAssetId,
      translatedAssetId: null,
      status: "pending" as const,
      phase: null,
      progressDone: 0,
      progressTotal: 0,
      failedUnits: 0,
      model: input.model,
      promptVersion: input.promptVersion,
      error: null,
    };
    const [row] = await this.db
      .insert(archiveTranslations)
      .values({
        bookmarkId: input.bookmarkId,
        userId: input.userId,
        targetLanguage: input.targetLanguage ?? DEFAULT_TARGET_LANGUAGE,
        ...reset,
      })
      .onConflictDoUpdate({
        target: [
          archiveTranslations.bookmarkId,
          archiveTranslations.targetLanguage,
        ],
        set: reset,
      })
      .returning();
    return row;
  }

  async cancelActive(id: string): Promise<void> {
    await this.db
      .update(archiveTranslations)
      .set({ status: "cancelled", phase: null })
      .where(
        and(
          eq(archiveTranslations.id, id),
          inArray(archiveTranslations.status, ["pending", "running"]),
        ),
      );
  }

  async countAnnotations(bookmarkId: string): Promise<number> {
    const [res] = await this.db
      .select({ value: count() })
      .from(pageAnnotations)
      .where(eq(pageAnnotations.bookmarkId, bookmarkId));
    return res?.value ?? 0;
  }
}
