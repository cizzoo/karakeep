import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import type { DB } from "@karakeep/db";
import { bookmarkLinks } from "@karakeep/db/schema";
import { TranslationQueue } from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import type { ZTranslationStatus } from "@karakeep/shared/types/bookmarkTranslations";
import { BOOKMARK_TRANSLATION_PROMPT_VERSION } from "@karakeep/shared/types/bookmarkTranslations";

import type { Actor } from "../lib/actor";
import { actorUserId } from "../lib/actor";
import { Bookmark } from "./bookmarks";
import { hashReaderHtml } from "./bookmarkTranslations.hash";
import type { BookmarkTranslationRow } from "./bookmarkTranslations.repo";
import { BookmarkTranslationsRepo } from "./bookmarkTranslations.repo";

export class BookmarkTranslationsService {
  private repo: BookmarkTranslationsRepo;

  constructor(private db: DB) {
    this.repo = new BookmarkTranslationsRepo(db);
  }

  // The hash of the bookmark's current reader content, or null if it has none.
  private async currentReaderHash(
    bookmarkId: string,
    userId: string,
  ): Promise<string | null> {
    const link = await this.db.query.bookmarkLinks.findFirst({
      where: eq(bookmarkLinks.id, bookmarkId),
      columns: { htmlContent: true, contentAssetId: true },
    });
    if (!link) {
      return null;
    }
    const html = await Bookmark.getBookmarkHtmlContent(link, userId);
    return html ? hashReaderHtml(html) : null;
  }

  private toStatus(
    row: BookmarkTranslationRow,
    currentHash: string | null,
    englishHighlightsCount: number,
  ): ZTranslationStatus {
    return {
      status: row.status,
      phase: row.phase,
      progressDone: row.progressDone,
      progressTotal: row.progressTotal,
      failedUnits: row.failedUnits,
      error: row.error,
      model: row.model,
      updatedAt: row.modifiedAt ?? row.createdAt,
      isStale:
        row.status === "done" &&
        !!row.sourceHash &&
        row.sourceHash !== currentHash,
      englishHighlightsCount,
    };
  }

  async get(
    bookmarkId: string,
    userId: string,
  ): Promise<ZTranslationStatus | null> {
    const row = await this.repo.getForBookmark(bookmarkId);
    if (!row) {
      return null;
    }
    // The hash is only needed to tell whether a finished translation is stale.
    const hash =
      row.status === "done"
        ? await this.currentReaderHash(bookmarkId, userId)
        : null;
    return this.toStatus(
      row,
      hash,
      await this.repo.countEnglishHighlights(bookmarkId),
    );
  }

  async getContent(bookmarkId: string): Promise<{ html: string } | null> {
    const row = await this.repo.getForBookmark(bookmarkId);
    if (!row || row.status !== "done" || row.translatedHtml === null) {
      return null;
    }
    return { html: row.translatedHtml };
  }

  async translate(
    actor: Actor,
    bookmarkId: string,
  ): Promise<ZTranslationStatus> {
    if (!serverConfig.translation.enabled) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Translation is not enabled on this server",
      });
    }
    const userId = actorUserId(actor);
    const hash = await this.currentReaderHash(bookmarkId, userId);
    if (!hash) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "This bookmark has no reader content to translate",
      });
    }

    const existing = await this.repo.getForBookmark(bookmarkId);
    if (
      existing &&
      (existing.status === "pending" || existing.status === "running")
    ) {
      return this.toStatus(
        existing,
        hash,
        await this.repo.countEnglishHighlights(bookmarkId),
      );
    }
    if (
      existing &&
      existing.status === "done" &&
      existing.sourceHash === hash &&
      existing.promptVersion === BOOKMARK_TRANSLATION_PROMPT_VERSION
    ) {
      // Already translated: nothing to do.
      return this.toStatus(
        existing,
        hash,
        await this.repo.countEnglishHighlights(bookmarkId),
      );
    }

    const row = await this.repo.upsertPending({
      bookmarkId,
      userId,
      model: serverConfig.translation.model,
      promptVersion: BOOKMARK_TRANSLATION_PROMPT_VERSION,
      // The existing translation is being replaced, so highlights anchored to
      // its text would no longer line up.
      deleteEnglishHighlights: !!existing,
    });
    await TranslationQueue.enqueue(
      { translationId: row.id },
      { idempotencyKey: row.id },
    );
    return this.toStatus(row, hash, 0);
  }

  async cancel(bookmarkId: string): Promise<void> {
    const row = await this.repo.getForBookmark(bookmarkId);
    if (row) {
      await this.repo.cancelActive(row.id);
    }
  }

  async delete(bookmarkId: string): Promise<void> {
    const row = await this.repo.getForBookmark(bookmarkId);
    if (row) {
      // Stops a running job too: the worker only writes to "running" rows.
      await this.repo.delete(row);
    }
  }
}
