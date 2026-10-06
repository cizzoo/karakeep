import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { archiveTranslations, assets, AssetTypes } from "@karakeep/db/schema";
import serverConfig from "@karakeep/shared/config";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import type { CustomTestContext } from "../testUtils";
import { defaultBeforeEach, getTestQueueMocks } from "../testUtils";

beforeEach<CustomTestContext>(defaultBeforeEach(true));

const translation = serverConfig.translation as { enabled: boolean };
const originalEnabled = translation.enabled;
afterEach(() => {
  translation.enabled = originalEnabled;
});

async function setup(ctx: CustomTestContext, withArchive = true) {
  const caller = ctx.apiCallers[0];
  const bookmark = await caller.bookmarks.createBookmark({
    url: "https://example.com",
    type: BookmarkTypes.LINK,
  });
  const user = await caller.users.whoami();
  let archiveId: string | null = null;
  if (withArchive) {
    archiveId = "archive-asset-1";
    await ctx.db.insert(assets).values({
      id: archiveId,
      assetType: AssetTypes.LINK_PRECRAWLED_ARCHIVE,
      bookmarkId: bookmark.id,
      userId: user.id,
      contentType: "text/html",
      size: 10,
    });
  }
  return { caller, bookmark, user, archiveId };
}

describe("Archive Translations Routes", () => {
  test<CustomTestContext>("fails when the feature is disabled", async (ctx) => {
    translation.enabled = false;
    const { caller, bookmark } = await setup(ctx);
    await expect(
      caller.archiveTranslations.translateArchive({ bookmarkId: bookmark.id }),
    ).rejects.toThrow(/not enabled/);
  });

  test<CustomTestContext>("fails when there is no archive", async (ctx) => {
    translation.enabled = true;
    const { caller, bookmark } = await setup(ctx, false);
    await expect(
      caller.archiveTranslations.translateArchive({ bookmarkId: bookmark.id }),
    ).rejects.toThrow(/no archive/);
  });

  test<CustomTestContext>("enqueues a translation and dedups while active", async (ctx) => {
    translation.enabled = true;
    const mocks = getTestQueueMocks();
    mocks.translationEnqueue.mockClear();
    const { caller, bookmark, archiveId } = await setup(ctx);

    const res = await caller.archiveTranslations.translateArchive({
      bookmarkId: bookmark.id,
    });
    expect(res.status).toBe("pending");
    expect(res.isApplied).toBe(false);
    expect(mocks.translationEnqueue).toHaveBeenCalledTimes(1);

    const row = await ctx.db.query.archiveTranslations.findFirst();
    expect(row?.originalAssetId).toBe(archiveId);
    expect(mocks.translationEnqueue.mock.calls[0][0]).toEqual({
      translationId: row?.id,
    });

    await caller.archiveTranslations.translateArchive({
      bookmarkId: bookmark.id,
    });
    expect(mocks.translationEnqueue).toHaveBeenCalledTimes(1);
  });

  test<CustomTestContext>("get returns null without a row, status with one", async (ctx) => {
    translation.enabled = true;
    const { caller, bookmark } = await setup(ctx);
    expect(
      await caller.archiveTranslations.getArchiveTranslation({
        bookmarkId: bookmark.id,
      }),
    ).toBeNull();
    await caller.archiveTranslations.translateArchive({
      bookmarkId: bookmark.id,
    });
    const status = await caller.archiveTranslations.getArchiveTranslation({
      bookmarkId: bookmark.id,
    });
    expect(status?.status).toBe("pending");
    expect(status?.highlightsOnArchive).toBe(0);
  });

  test<CustomTestContext>("cancel moves an active translation to cancelled", async (ctx) => {
    translation.enabled = true;
    const { caller, bookmark } = await setup(ctx);
    await caller.archiveTranslations.translateArchive({
      bookmarkId: bookmark.id,
    });
    await caller.archiveTranslations.cancelArchiveTranslation({
      bookmarkId: bookmark.id,
    });
    const status = await caller.archiveTranslations.getArchiveTranslation({
      bookmarkId: bookmark.id,
    });
    expect(status?.status).toBe("cancelled");

    // Retrying resets the same row.
    const again = await caller.archiveTranslations.translateArchive({
      bookmarkId: bookmark.id,
    });
    expect(again.status).toBe("pending");
    expect(await ctx.db.query.archiveTranslations.findMany()).toHaveLength(1);
  });

  test<CustomTestContext>("done row is applied only while the translated asset is the archive", async (ctx) => {
    translation.enabled = true;
    const { caller, bookmark, user } = await setup(ctx);
    await caller.pageAnnotations.create({
      bookmarkId: bookmark.id,
      assetId: null,
      exact: "hello",
      prefix: "",
      suffix: "",
      startOffset: 0,
      color: "yellow",
      comment: null,
    });
    await ctx.db.insert(archiveTranslations).values({
      bookmarkId: bookmark.id,
      userId: user.id,
      originalAssetId: "gone",
      translatedAssetId: "archive-asset-1",
      status: "done",
      model: "translator",
      promptVersion: 1,
    });
    let status = await caller.archiveTranslations.getArchiveTranslation({
      bookmarkId: bookmark.id,
    });
    expect(status?.isApplied).toBe(true);
    expect(status?.highlightsOnArchive).toBe(1);

    await expect(
      caller.archiveTranslations.translateArchive({ bookmarkId: bookmark.id }),
    ).rejects.toThrow(/already translated/);

    // Simulate a re-archive: the current archive is no longer the translated one.
    await ctx.db.insert(assets).values({
      id: "archive-asset-2",
      assetType: AssetTypes.LINK_PRECRAWLED_ARCHIVE,
      bookmarkId: bookmark.id,
      userId: user.id,
      size: 1,
    });
    await ctx.db.delete(assets).where(eq(assets.id, "archive-asset-1"));
    status = await caller.archiveTranslations.getArchiveTranslation({
      bookmarkId: bookmark.id,
    });
    expect(status?.status).toBe("done");
    expect(status?.isApplied).toBe(false);
  });

  test<CustomTestContext>("is owner only", async (ctx) => {
    translation.enabled = true;
    const { bookmark } = await setup(ctx);
    await expect(
      ctx.apiCallers[1].archiveTranslations.translateArchive({
        bookmarkId: bookmark.id,
      }),
    ).rejects.toThrow();
  });
});
