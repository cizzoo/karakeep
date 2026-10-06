import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import type { DB } from "@karakeep/db";
import { assets } from "@karakeep/db/schema";
import { TranslationQueue } from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import type { ZTranslationStatus } from "@karakeep/shared/types/archiveTranslations";
import { ARCHIVE_TRANSLATION_PROMPT_VERSION } from "@karakeep/shared/types/archiveTranslations";

import type { Actor } from "../lib/actor";
import { actorUserId } from "../lib/actor";
import type { ArchiveTranslationRow } from "./archiveTranslations.repo";
import { ArchiveTranslationsRepo } from "./archiveTranslations.repo";
import { selectAnnotatableArchive } from "./pageAnnotations.archive";

export class ArchiveTranslationsService {
  private repo: ArchiveTranslationsRepo;

  constructor(private db: DB) {
    this.repo = new ArchiveTranslationsRepo(db);
  }

  private async currentArchiveId(bookmarkId: string): Promise<string | null> {
    const bookmarkAssets = await this.db.query.assets.findMany({
      where: eq(assets.bookmarkId, bookmarkId),
    });
    return selectAnnotatableArchive(bookmarkAssets)?.assetId ?? null;
  }

  private async toStatus(
    row: ArchiveTranslationRow,
    currentArchiveId?: string | null,
  ): Promise<ZTranslationStatus> {
    const archiveId =
      currentArchiveId !== undefined
        ? currentArchiveId
        : await this.currentArchiveId(row.bookmarkId);
    return {
      status: row.status,
      phase: row.phase,
      progressDone: row.progressDone,
      progressTotal: row.progressTotal,
      failedUnits: row.failedUnits,
      isApplied:
        row.status === "done" &&
        !!row.translatedAssetId &&
        archiveId === row.translatedAssetId,
      highlightsOnArchive: await this.repo.countAnnotations(row.bookmarkId),
      error: row.error,
      model: row.model,
      updatedAt: row.modifiedAt ?? row.createdAt,
      translatedAssetId: row.translatedAssetId,
    };
  }

  async get(bookmarkId: string): Promise<ZTranslationStatus | null> {
    const row = await this.repo.getForBookmark(bookmarkId);
    return row ? await this.toStatus(row) : null;
  }

  async translate(
    actor: Actor,
    bookmarkId: string,
  ): Promise<ZTranslationStatus> {
    if (!serverConfig.translation.enabled) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Archive translation is not enabled on this server",
      });
    }
    const archiveId = await this.currentArchiveId(bookmarkId);
    if (!archiveId) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "This bookmark has no archive to translate",
      });
    }

    const existing = await this.repo.getForBookmark(bookmarkId);
    if (
      existing &&
      (existing.status === "pending" || existing.status === "running")
    ) {
      return await this.toStatus(existing, archiveId);
    }
    if (
      existing &&
      existing.status === "done" &&
      existing.translatedAssetId === archiveId
    ) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "This archive is already translated",
      });
    }

    const row = await this.repo.upsertPending({
      bookmarkId,
      userId: actorUserId(actor),
      originalAssetId: archiveId,
      model: serverConfig.translation.model,
      promptVersion: ARCHIVE_TRANSLATION_PROMPT_VERSION,
    });
    await TranslationQueue.enqueue(
      { translationId: row.id },
      { idempotencyKey: row.id },
    );
    return await this.toStatus(row, archiveId);
  }

  async cancel(bookmarkId: string): Promise<void> {
    const row = await this.repo.getForBookmark(bookmarkId);
    if (row) {
      await this.repo.cancelActive(row.id);
    }
  }
}
