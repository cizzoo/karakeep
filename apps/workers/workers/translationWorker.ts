import { and, eq, ne } from "drizzle-orm";
import { workerStatsCounter } from "metrics";
import { withWorkerEventLog, withWorkerTracing } from "workerTracing";

import { db } from "@karakeep/db";
import {
  bookmarkLinks,
  bookmarks,
  bookmarkTranslations,
} from "@karakeep/db/schema";
import {
  addLogFields,
  TranslationQueue,
  zTranslationRequestSchema,
} from "@karakeep/shared-server";
import type { ZTranslationRequest } from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import type { DequeuedJob } from "@karakeep/shared/queueing";
import { getQueueClient } from "@karakeep/shared/queueing";
import { Bookmark } from "@karakeep/trpc/models/bookmarks";
import { hashReaderHtml } from "@karakeep/trpc/models/bookmarkTranslations.hash";

import {
  TranslationCancelledError,
  TranslationTooLargeError,
  translateDocument,
  TranslatorClient,
  TranslatorConfigError,
} from "./translation";

const MAX_FAILED_RATIO = 0.2;
const PROGRESS_THROTTLE_MS = 1000;

/** Thrown for expected failures; the message is shown to the user. */
class TranslationFailure extends Error {}

export class TranslationWorker {
  static async build() {
    logger.info("Starting bookmark translation worker ...");

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

type RowUpdate = Partial<typeof bookmarkTranslations.$inferInsert>;

// Updates the row unless it has been cancelled (or otherwise left "running").
async function updateWhileRunning(translationId: string, set: RowUpdate) {
  await db
    .update(bookmarkTranslations)
    .set(set)
    .where(
      and(
        eq(bookmarkTranslations.id, translationId),
        eq(bookmarkTranslations.status, "running"),
      ),
    );
}

async function markFailed(translationId: string, error: string) {
  await db
    .update(bookmarkTranslations)
    .set({ status: "failed", phase: null, error: error.slice(0, 2000) })
    .where(
      and(
        eq(bookmarkTranslations.id, translationId),
        // Never override cancelled/done.
        eq(bookmarkTranslations.status, "running"),
      ),
    );
  // A row that never made it to running (still pending) should fail as well.
  await db
    .update(bookmarkTranslations)
    .set({ status: "failed", phase: null, error: error.slice(0, 2000) })
    .where(
      and(
        eq(bookmarkTranslations.id, translationId),
        eq(bookmarkTranslations.status, "pending"),
      ),
    );
}

async function isCancelledInDb(translationId: string) {
  const row = await db.query.bookmarkTranslations.findFirst({
    where: eq(bookmarkTranslations.id, translationId),
    columns: { status: true },
  });
  return !row || row.status === "cancelled";
}

async function runWorker(job: DequeuedJob<ZTranslationRequest>) {
  const { translationId } = job.data;
  addLogFields<"translationWorker.run">({ "translation.id": translationId });

  const row = await db.query.bookmarkTranslations.findFirst({
    where: eq(bookmarkTranslations.id, translationId),
  });
  if (!row) {
    logger.warn(`[Translation][${job.id}] Row ${translationId} not found`);
    return;
  }
  addLogFields<"translationWorker.run">({ "bookmark.id": row.bookmarkId });
  if (row.status === "cancelled") {
    return;
  }

  try {
    await db
      .update(bookmarkTranslations)
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
          eq(bookmarkTranslations.id, translationId),
          // Don't resurrect a job cancelled after we read the row.
          ne(bookmarkTranslations.status, "cancelled"),
        ),
      );

    await translate(job.id, row);
  } catch (e) {
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
  row: typeof bookmarkTranslations.$inferSelect,
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
    columns: { htmlContent: true, contentAssetId: true, title: true },
  });
  if (!link) {
    throw new TranslationFailure("The bookmark no longer exists");
  }
  const bookmark = await db.query.bookmarks.findFirst({
    where: eq(bookmarks.id, bookmarkId),
    columns: { title: true },
  });

  // Same source as the reader view: inline content or the HTML content asset.
  const html = await Bookmark.getBookmarkHtmlContent(link, userId);
  if (!html) {
    throw new TranslationFailure(
      "This bookmark has no reader content to translate",
    );
  }
  if (Buffer.byteLength(html, "utf8") > cfg.maxHtmlSizeMb * 1024 * 1024) {
    throw new TranslationFailure(
      `The reader content is larger than the ${cfg.maxHtmlSizeMb} MB translation limit`,
    );
  }
  const sourceHash = hashReaderHtml(html);

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
    fragment: true,
    title: bookmark?.title ?? link.title ?? undefined,
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
    throw new TranslationFailure("Nothing to translate in this bookmark");
  }
  if (result.failedUnits / result.totalUnits > MAX_FAILED_RATIO) {
    throw new TranslationFailure(
      `Too many passages could not be translated (${result.failedUnits}/${result.totalUnits})`,
    );
  }
  if (await isCancelledInDb(translationId)) {
    throw new TranslationCancelledError("cancelled");
  }

  await updateWhileRunning(translationId, { phase: "saving" });

  // Only a row that is still running may be completed (not cancelled/deleted).
  const saved = await db
    .update(bookmarkTranslations)
    .set({
      status: "done",
      phase: null,
      error: null,
      progressDone: result.totalUnits,
      progressTotal: result.totalUnits,
      failedUnits: result.failedUnits,
      sourceHash,
      translatedHtml: result.html,
    })
    .where(
      and(
        eq(bookmarkTranslations.id, translationId),
        eq(bookmarkTranslations.status, "running"),
      ),
    )
    .returning({ id: bookmarkTranslations.id });
  if (saved.length === 0) {
    throw new TranslationCancelledError("cancelled");
  }
  logger.info(
    `[Translation][${jobId}] Stored translation for bookmark ${bookmarkId} (${result.failedUnits}/${result.totalUnits} units failed)`,
  );
}
