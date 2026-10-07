import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  bookmarkLinks,
  bookmarkTranslations,
  highlights,
} from "@karakeep/db/schema";
import serverConfig from "@karakeep/shared/config";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import { hashReaderHtml } from "../models/bookmarkTranslations.hash";
import type { CustomTestContext } from "../testUtils";
import { defaultBeforeEach, getTestQueueMocks } from "../testUtils";

beforeEach<CustomTestContext>(defaultBeforeEach(true));

const translation = serverConfig.translation as { enabled: boolean };
const originalEnabled = translation.enabled;
afterEach(() => {
  translation.enabled = originalEnabled;
});

const READER_HTML = "<div><p>你好,世界。这是一个测试段落。</p></div>";

async function setup(ctx: CustomTestContext, withContent = true) {
  const caller = ctx.apiCallers[0];
  const bookmark = await caller.bookmarks.createBookmark({
    url: "https://example.com",
    type: BookmarkTypes.LINK,
  });
  const user = await caller.users.whoami();
  if (withContent) {
    await ctx.db
      .update(bookmarkLinks)
      .set({ htmlContent: READER_HTML })
      .where(eq(bookmarkLinks.id, bookmark.id));
  }
  return { caller, bookmark, user };
}

describe("Bookmark Translations Routes", () => {
  test<CustomTestContext>("fails when the feature is disabled", async (ctx) => {
    translation.enabled = false;
    const { caller, bookmark } = await setup(ctx);
    await expect(
      caller.bookmarkTranslations.translate({ bookmarkId: bookmark.id }),
    ).rejects.toThrow(/not enabled/);
  });

  test<CustomTestContext>("fails when there is no reader content", async (ctx) => {
    translation.enabled = true;
    const { caller, bookmark } = await setup(ctx, false);
    await expect(
      caller.bookmarkTranslations.translate({ bookmarkId: bookmark.id }),
    ).rejects.toThrow(/no reader content/);
  });

  test<CustomTestContext>("enqueues a translation and dedups while active", async (ctx) => {
    translation.enabled = true;
    const mocks = getTestQueueMocks();
    mocks.translationEnqueue.mockClear();
    const { caller, bookmark } = await setup(ctx);

    const res = await caller.bookmarkTranslations.translate({
      bookmarkId: bookmark.id,
    });
    expect(res.status).toBe("pending");
    expect(res.isStale).toBe(false);
    expect(mocks.translationEnqueue).toHaveBeenCalledTimes(1);

    const row = await ctx.db.query.bookmarkTranslations.findFirst();
    expect(mocks.translationEnqueue.mock.calls[0][0]).toEqual({
      translationId: row?.id,
    });

    await caller.bookmarkTranslations.translate({ bookmarkId: bookmark.id });
    expect(mocks.translationEnqueue).toHaveBeenCalledTimes(1);
  });

  test<CustomTestContext>("getStatus returns null without a row, status with one", async (ctx) => {
    translation.enabled = true;
    const { caller, bookmark } = await setup(ctx);
    expect(
      await caller.bookmarkTranslations.getStatus({ bookmarkId: bookmark.id }),
    ).toBeNull();
    await caller.bookmarkTranslations.translate({ bookmarkId: bookmark.id });
    const status = await caller.bookmarkTranslations.getStatus({
      bookmarkId: bookmark.id,
    });
    expect(status?.status).toBe("pending");
  });

  test<CustomTestContext>("cancel moves an active translation to cancelled, retry resets the row", async (ctx) => {
    translation.enabled = true;
    const { caller, bookmark } = await setup(ctx);
    await caller.bookmarkTranslations.translate({ bookmarkId: bookmark.id });
    await caller.bookmarkTranslations.cancel({ bookmarkId: bookmark.id });
    const status = await caller.bookmarkTranslations.getStatus({
      bookmarkId: bookmark.id,
    });
    expect(status?.status).toBe("cancelled");

    const again = await caller.bookmarkTranslations.translate({
      bookmarkId: bookmark.id,
    });
    expect(again.status).toBe("pending");
    expect(await ctx.db.query.bookmarkTranslations.findMany()).toHaveLength(1);
  });

  test<CustomTestContext>("done translation: content is served, already-translated is a no-op, staleness is detected", async (ctx) => {
    translation.enabled = true;
    const mocks = getTestQueueMocks();
    const { caller, bookmark, user } = await setup(ctx);
    expect(
      await caller.bookmarkTranslations.getTranslatedContent({
        bookmarkId: bookmark.id,
      }),
    ).toBeNull();

    await ctx.db.insert(bookmarkTranslations).values({
      bookmarkId: bookmark.id,
      userId: user.id,
      status: "done",
      model: "translator",
      promptVersion: 1,
      sourceHash: hashReaderHtml(READER_HTML),
      translatedHtml: "<div><p>Hello, world.</p></div>",
    });
    expect(
      await caller.bookmarkTranslations.getTranslatedContent({
        bookmarkId: bookmark.id,
      }),
    ).toEqual({ html: "<div><p>Hello, world.</p></div>" });
    let status = await caller.bookmarkTranslations.getStatus({
      bookmarkId: bookmark.id,
    });
    expect(status?.status).toBe("done");
    expect(status?.isStale).toBe(false);

    mocks.translationEnqueue.mockClear();
    const res = await caller.bookmarkTranslations.translate({
      bookmarkId: bookmark.id,
    });
    expect(res.status).toBe("done");
    expect(mocks.translationEnqueue).not.toHaveBeenCalled();

    // The reader content changes (e.g. a re-crawl).
    await ctx.db
      .update(bookmarkLinks)
      .set({ htmlContent: "<div><p>新的内容。</p></div>" })
      .where(eq(bookmarkLinks.id, bookmark.id));
    status = await caller.bookmarkTranslations.getStatus({
      bookmarkId: bookmark.id,
    });
    expect(status?.isStale).toBe(true);

    const again = await caller.bookmarkTranslations.translate({
      bookmarkId: bookmark.id,
    });
    expect(again.status).toBe("pending");
    expect(mocks.translationEnqueue).toHaveBeenCalledTimes(1);
    expect(
      await caller.bookmarkTranslations.getTranslatedContent({
        bookmarkId: bookmark.id,
      }),
    ).toBeNull();
  });

  test<CustomTestContext>("delete removes the translation", async (ctx) => {
    translation.enabled = true;
    const { caller, bookmark } = await setup(ctx);
    await caller.bookmarkTranslations.translate({ bookmarkId: bookmark.id });
    await caller.bookmarkTranslations.delete({ bookmarkId: bookmark.id });
    expect(
      await caller.bookmarkTranslations.getStatus({ bookmarkId: bookmark.id }),
    ).toBeNull();
    expect(await ctx.db.query.bookmarkTranslations.findMany()).toHaveLength(0);
  });

  async function addHighlights(
    ctx: CustomTestContext,
    bookmarkId: string,
    userId: string,
  ) {
    await ctx.db.insert(highlights).values([
      {
        bookmarkId,
        userId,
        startOffset: 0,
        endOffset: 3,
        text: "orig",
        contentLanguage: null,
      },
      {
        bookmarkId,
        userId,
        startOffset: 0,
        endOffset: 3,
        text: "en1",
        contentLanguage: "en",
      },
      {
        bookmarkId,
        userId,
        startOffset: 4,
        endOffset: 7,
        text: "en2",
        contentLanguage: "en",
      },
    ]);
  }

  async function insertDone(
    ctx: CustomTestContext,
    bookmarkId: string,
    userId: string,
  ) {
    await ctx.db.insert(bookmarkTranslations).values({
      bookmarkId,
      userId,
      status: "done",
      model: "translator",
      promptVersion: 1,
      sourceHash: hashReaderHtml(READER_HTML),
      translatedHtml: "<div><p>Hello, world.</p></div>",
    });
  }

  async function remainingTexts(ctx: CustomTestContext) {
    return (await ctx.db.query.highlights.findMany()).map((h) => h.text).sort();
  }

  test<CustomTestContext>("delete removes only the English highlights", async (ctx) => {
    translation.enabled = true;
    const { caller, bookmark, user } = await setup(ctx);
    await insertDone(ctx, bookmark.id, user.id);
    await addHighlights(ctx, bookmark.id, user.id);
    const status = await caller.bookmarkTranslations.getStatus({
      bookmarkId: bookmark.id,
    });
    expect(status?.englishHighlightsCount).toBe(2);

    await caller.bookmarkTranslations.delete({ bookmarkId: bookmark.id });
    expect(await remainingTexts(ctx)).toEqual(["orig"]);
  });

  test<CustomTestContext>("retranslating a stale translation removes only the English highlights", async (ctx) => {
    translation.enabled = true;
    const { caller, bookmark, user } = await setup(ctx);
    await insertDone(ctx, bookmark.id, user.id);
    await addHighlights(ctx, bookmark.id, user.id);
    await ctx.db
      .update(bookmarkLinks)
      .set({ htmlContent: "<div><p>新的内容。</p></div>" })
      .where(eq(bookmarkLinks.id, bookmark.id));

    const res = await caller.bookmarkTranslations.translate({
      bookmarkId: bookmark.id,
    });
    expect(res.status).toBe("pending");
    expect(res.englishHighlightsCount).toBe(0);
    expect(await remainingTexts(ctx)).toEqual(["orig"]);
  });

  test<CustomTestContext>("an up-to-date translation keeps its highlights", async (ctx) => {
    translation.enabled = true;
    const { caller, bookmark, user } = await setup(ctx);
    await insertDone(ctx, bookmark.id, user.id);
    await addHighlights(ctx, bookmark.id, user.id);
    const res = await caller.bookmarkTranslations.translate({
      bookmarkId: bookmark.id,
    });
    expect(res.status).toBe("done");
    expect(res.englishHighlightsCount).toBe(2);
    expect(await remainingTexts(ctx)).toEqual(["en1", "en2", "orig"]);
  });

  test<CustomTestContext>("is owner only", async (ctx) => {
    translation.enabled = true;
    const { bookmark } = await setup(ctx);
    const other = ctx.apiCallers[1];
    await expect(
      other.bookmarkTranslations.translate({ bookmarkId: bookmark.id }),
    ).rejects.toThrow();
    await expect(
      other.bookmarkTranslations.getStatus({ bookmarkId: bookmark.id }),
    ).rejects.toThrow();
    await expect(
      other.bookmarkTranslations.getTranslatedContent({
        bookmarkId: bookmark.id,
      }),
    ).rejects.toThrow();
    await expect(
      other.bookmarkTranslations.delete({ bookmarkId: bookmark.id }),
    ).rejects.toThrow();
  });
});
