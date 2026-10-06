import { and, eq, ne } from "drizzle-orm";
import { workerStatsCounter } from "metrics";
import { withWorkerEventLog, withWorkerTracing } from "workerTracing";

import { db } from "@karakeep/db";
import {
  archiveTranslations,
  assets,
  AssetTypes,
  bookmarkLinks,
  pageAnnotations,
} from "@karakeep/db/schema";
import {
  addLogFields,
  ASSET_TYPES,
  newAssetId,
  QuotaService,
  readAsset,
  saveAsset,
  silentDeleteAsset,
  TranslationQueue,
  triggerSearchReindex,
  zTranslationRequestSchema,
} from "@karakeep/shared-server";
import type { ZTranslationRequest } from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import type { DequeuedJob } from "@karakeep/shared/queueing";
import { getQueueClient } from "@karakeep/shared/queueing";
import { selectAnnotatableArchive } from "@karakeep/trpc/models/pageAnnotations.archive";

import { storeHtmlContent } from "./crawler/assetStorage";
import { runParseSubprocess } from "./crawler/parseSubprocess";
import {
  isAlreadyTranslated,
  TranslationCancelledError,
  TranslationTooLargeError,
  translateDocument,
  TranslatorClient,
  TranslatorConfigError,
} from "./translation";
import { updateAsset } from "../workerUtils";

const MAX_FAILED_RATIO = 0.2;
const PROGRESS_THROTTLE_MS = 1000;

/** Thrown for expected failures; the message is shown to the user. */
class TranslationFailure extends Error {}

export class TranslationWorker {
  static async build() {
    logger.info("Starting archive translation worker ...");

    return (await getQueueClient())!.createRunner<ZTranslationRequest>(
      TranslationQueue,
      {
        run: withWorkerTracing(
          "translationWorker.run",
          withWorkerEventLog("translationWorker.run", runWorker),
        ),
        onComplete: async (job) => {
          workerStatsCounter.labels("translation", "completed").inc();
          logger.info(`[Translation][${job.id}] Job finished`);
        },
        onError: async (job) => {
          workerStatsCounter.labels("translation", "failed").inc();
          logger.error(`[Translation][${job.id}] Job failed: ${job.error}`);
          if (job.numRetriesLeft == 0) {
            workerStatsCounter.labels("translation", "failed_permanent").inc();
            if (job.data?.translationId) {
              await markFailed(
                job.data.translationId,
                job.error?.message ?? "Unexpected error",
              );
            }
          }
        },
      },
      {
        pollIntervalMs: 1000,
        timeoutSecs: serverConfig.translation.jobTimeoutSec,
        concurrency: 1,
        validator: zTranslationRequestSchema,
      },
    );
  }
}

type RowUpdate = Partial<typeof archiveTranslations.$inferInsert>;

// Updates the row unless it has been cancelled (or otherwise left "running").
async function updateWhileRunning(translationId: string, set: RowUpdate) {
  await db
    .update(archiveTranslations)
    .set(set)
    .where(
      and(
        eq(archiveTranslations.id, translationId),
        eq(archiveTranslations.status, "running"),
      ),
    );
}

async function markFailed(translationId: string, error: string) {
  await db
    .update(archiveTranslations)
    .set({ status: "failed", phase: null, error: error.slice(0, 2000) })
    .where(
      and(
        eq(archiveTranslations.id, translationId),
        // Never override cancelled/done.
        eq(archiveTranslations.status, "running"),
      ),
    );
  // A row that never made it to running (still pending) should fail as well.
  await db
    .update(archiveTranslations)
    .set({ status: "failed", phase: null, error: error.slice(0, 2000) })
    .where(
      and(
        eq(archiveTranslations.id, translationId),
        eq(archiveTranslations.status, "pending"),
      ),
    );
}

async function isCancelledInDb(translationId: string) {
  const row = await db.query.archiveTranslations.findFirst({
    where: eq(archiveTranslations.id, translationId),
    columns: { status: true },
  });
  return !row || row.status === "cancelled";
}

async function runWorker(job: DequeuedJob<ZTranslationRequest>) {
  const { translationId } = job.data;
  addLogFields<"translationWorker.run">({ "translation.id": translationId });

  const row = await db.query.archiveTranslations.findFirst({
    where: eq(archiveTranslations.id, translationId),
  });
  if (!row) {
    logger.warn(`[Translation][${job.id}] Row ${translationId} not found`);
    return;
  }
  addLogFields<"translationWorker.run">({ "bookmark.id": row.bookmarkId });
  if (row.status === "cancelled") {
    return;
  }

  const pending: { newAssetId?: string } = {};
  try {
    await db
      .update(archiveTranslations)
      .set({
        status: "running",
        phase: null,
        error: null,
        progressDone: 0,
        progressTotal: 0,
        failedUnits: 0,
      })
      .where(
        and(
          eq(archiveTranslations.id, translationId),
          // Don't resurrect a job cancelled after we read the row.
          ne(archiveTranslations.status, "cancelled"),
        ),
      );

    await translate(job.id, row, pending);
  } catch (e) {
    if (pending.newAssetId) {
      await silentDeleteAsset(row.userId, pending.newAssetId);
    }
    if (e instanceof TranslationCancelledError) {
      logger.info(`[Translation][${job.id}] Cancelled by the user`);
      return;
    }
    if (
      e instanceof TranslationFailure ||
      e instanceof TranslationTooLargeError ||
      e instanceof TranslatorConfigError
    ) {
      // Expected failure: don't retry.
      logger.warn(`[Translation][${job.id}] Failed: ${e.message}`);
      await markFailed(translationId, e.message);
      return;
    }
    throw e;
  }
}

async function translate(
  jobId: string,
  row: typeof archiveTranslations.$inferSelect,
  pending: { newAssetId?: string },
) {
  const cfg = serverConfig.translation;
  const { id: translationId, bookmarkId, userId } = row;

  if (!cfg.enabled || !cfg.baseUrl || !cfg.apiKey) {
    throw new TranslationFailure(
      "Translation is not configured on the server (TRANSLATION_BASE_URL / TRANSLATION_API_KEY)",
    );
  }

  const link = await db.query.bookmarkLinks.findFirst({
    where: eq(bookmarkLinks.id, bookmarkId),
  });
  if (!link) {
    throw new TranslationFailure("The bookmark no longer exists");
  }
  const bookmarkAssets = await db.query.assets.findMany({
    where: eq(assets.bookmarkId, bookmarkId),
  });
  const archive = selectAnnotatableArchive(bookmarkAssets);
  if (!archive || archive.assetId !== row.originalAssetId) {
    throw new TranslationFailure(
      "The archive changed since the translation was requested",
    );
  }
  const originalAsset = bookmarkAssets.find((a) => a.id === archive.assetId)!;

  const { asset: originalBuf, metadata } = await readAsset({
    userId,
    assetId: row.originalAssetId,
  });
  if (originalBuf.byteLength > cfg.maxHtmlSizeMb * 1024 * 1024) {
    throw new TranslationFailure(
      `The archive is larger than the ${cfg.maxHtmlSizeMb} MB translation limit`,
    );
  }
  const html = originalBuf.toString("utf8");
  if (isAlreadyTranslated(html)) {
    throw new TranslationFailure("This archive is already translated");
  }

  const client = new TranslatorClient({
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKey,
    model: cfg.model,
    targetLanguage: cfg.targetLanguage,
    temperature: cfg.temperature,
    requestTimeoutSec: cfg.requestTimeoutSec,
    maxConcurrency: cfg.maxConcurrency,
    maxOutputTokens: cfg.maxOutputTokens,
  });

  const modelState = await client.preflight();
  await updateWhileRunning(translationId, {
    phase: modelState === "unloaded" ? "warming_up" : "translating",
  });

  let lastWrite = 0;
  const result = await translateDocument(html, {
    translator: client,
    batchTokenBudget: cfg.batchTokenBudget,
    maxUnits: cfg.maxUnits,
    maxConcurrentBatches: cfg.maxConcurrency,
    onProgress: async (done, total) => {
      const now = Date.now();
      if (now - lastWrite < PROGRESS_THROTTLE_MS && done < total) {
        return;
      }
      lastWrite = now;
      await updateWhileRunning(translationId, {
        phase: "translating",
        progressDone: done,
        progressTotal: total,
      });
    },
    isCancelled: () => isCancelledInDb(translationId),
  });

  if (result.totalUnits === 0) {
    throw new TranslationFailure("Nothing to translate in this archive");
  }
  if (result.failedUnits / result.totalUnits > MAX_FAILED_RATIO) {
    throw new TranslationFailure(
      `Too many passages could not be translated (${result.failedUnits}/${result.totalUnits})`,
    );
  }
  if (await isCancelledInDb(translationId)) {
    throw new TranslationCancelledError("cancelled");
  }

  await updateWhileRunning(translationId, {
    phase: "saving",
    progressDone: result.totalUnits,
    progressTotal: result.totalUnits,
    failedUnits: result.failedUnits,
  });

  const translatedBuf = Buffer.from(result.html, "utf8");
  const quotaApproved = await QuotaService.checkStorageQuota(
    db,
    userId,
    translatedBuf.byteLength,
  );
  const translatedAssetId = newAssetId();
  pending.newAssetId = translatedAssetId;
  await saveAsset({
    userId,
    assetId: translatedAssetId,
    asset: translatedBuf,
    metadata: {
      contentType: metadata.contentType,
      fileName: metadata.fileName,
    },
    quotaApproved,
  });

  // The swap. Everything is checked again inside the transaction.
  await db.transaction((txn) => {
    const current = selectAnnotatableArchive(
      txn.select().from(assets).where(eq(assets.bookmarkId, bookmarkId)).all(),
    );
    if (current?.assetId !== row.originalAssetId) {
      throw new TranslationFailure(
        "The archive changed while it was being translated",
      );
    }
    const state = txn
      .select({ status: archiveTranslations.status })
      .from(archiveTranslations)
      .where(eq(archiveTranslations.id, translationId))
      .get();
    if (state?.status !== "running") {
      throw new TranslationCancelledError("cancelled");
    }

    updateAsset(
      row.originalAssetId,
      {
        id: translatedAssetId,
        assetType: originalAsset.assetType,
        bookmarkId,
        userId,
        contentType: originalAsset.contentType,
        fileName: originalAsset.fileName,
        size: translatedBuf.byteLength,
      },
      txn,
    );
    // Keep the annotations: point them at the new archive (the FK would
    // otherwise null them out when the original row is deleted).
    txn
      .update(pageAnnotations)
      .set({ assetId: translatedAssetId })
      .where(eq(pageAnnotations.assetId, row.originalAssetId))
      .run();
    txn
      .update(archiveTranslations)
      .set({
        translatedAssetId,
        status: "done",
        phase: null,
        error: null,
        progressDone: result.totalUnits,
        progressTotal: result.totalUnits,
        failedUnits: result.failedUnits,
      })
      .where(eq(archiveTranslations.id, translationId))
      .run();
  });

  // Committed: from here on nothing may remove the new asset.
  pending.newAssetId = undefined;
  await silentDeleteAsset(userId, row.originalAssetId);
  logger.info(
    `[Translation][${jobId}] Swapped archive ${row.originalAssetId} -> ${translatedAssetId} (${result.failedUnits}/${result.totalUnits} units failed)`,
  );

  try {
    await regenerateDerivedData({
      jobId,
      bookmarkId,
      userId,
      url: link.url,
      html: result.html,
      oldContentAssetId: bookmarkAssets.find(
        (a) => a.assetType === AssetTypes.LINK_HTML_CONTENT,
      )?.id,
    });
  } catch (e) {
    logger.error(
      `[Translation][${jobId}] Failed to regenerate derived data (the translation itself was applied): ${e}`,
    );
  }
}

// Re-derives the reader content (and the search index) from the translated
// archive, mirroring what the crawler does for a freshly stored archive.
async function regenerateDerivedData({
  jobId,
  bookmarkId,
  userId,
  url,
  html,
  oldContentAssetId,
}: {
  jobId: string;
  bookmarkId: string;
  userId: string;
  url: string;
  html: string;
  oldContentAssetId: string | undefined;
}) {
  const parsed = await runParseSubprocess(
    html,
    url,
    jobId,
    AbortSignal.timeout(serverConfig.crawler.parseTimeoutSec * 1000 + 5000),
  );
  const readable = parsed.readableContent?.content;
  const stored = await storeHtmlContent(readable, userId, jobId);

  try {
    await db.transaction((txn) => {
      txn
        .update(bookmarkLinks)
        .set({
          htmlContent:
            stored.result === "store_inline" ? (readable ?? null) : null,
          contentAssetId: stored.result === "stored" ? stored.assetId : null,
          readerViewStatus: parsed.readerViewAssessment?.status ?? null,
          readerViewScore: parsed.readerViewAssessment?.score ?? null,
          readerViewReasons: parsed.readerViewAssessment?.reasons ?? null,
          readerViewClassifierVersion:
            parsed.readerViewAssessment?.classifierVersion ?? null,
        })
        .where(eq(bookmarkLinks.id, bookmarkId))
        .run();
      if (stored.result === "stored") {
        updateAsset(
          oldContentAssetId,
          {
            id: stored.assetId,
            bookmarkId,
            userId,
            assetType: AssetTypes.LINK_HTML_CONTENT,
            contentType: ASSET_TYPES.TEXT_HTML,
            size: stored.size,
            fileName: null,
          },
          txn,
        );
      } else if (oldContentAssetId) {
        txn.delete(assets).where(eq(assets.id, oldContentAssetId)).run();
      }
    });
  } catch (e) {
    if (stored.result === "stored") {
      await silentDeleteAsset(userId, stored.assetId);
    }
    throw e;
  }
  await silentDeleteAsset(userId, oldContentAssetId);
  await triggerSearchReindex(bookmarkId, { groupId: userId });
}
