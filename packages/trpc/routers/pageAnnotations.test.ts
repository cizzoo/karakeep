import { beforeEach, describe, expect, test } from "vitest";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import type { CustomTestContext } from "../testUtils";
import { defaultBeforeEach } from "../testUtils";

beforeEach<CustomTestContext>(defaultBeforeEach(true));

describe("Page Annotations Routes", () => {
  test<CustomTestContext>("create annotation", async ({ apiCallers }) => {
    const api = apiCallers[0].pageAnnotations;
    const bookmarksApi = apiCallers[0].bookmarks;

    const bookmark = await bookmarksApi.createBookmark({
      url: "https://example.com",
      type: BookmarkTypes.LINK,
    });

    const annotation = await api.create({
      bookmarkId: bookmark.id,
      assetId: null,
      exact: "Test highlighted text",
      prefix: "before ",
      suffix: " after",
      startOffset: 42,
      color: "yellow",
      comment: "A comment",
    });

    expect(annotation.bookmarkId).toEqual(bookmark.id);
    expect(annotation.exact).toEqual("Test highlighted text");
    expect(annotation.color).toEqual("yellow");
    expect(annotation.comment).toEqual("A comment");
    expect(annotation.updatedAt).toBeNull();
  });

  test<CustomTestContext>("create annotation rejects an assetId that doesn't belong to the bookmark", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].pageAnnotations;
    const bookmarksApi = apiCallers[0].bookmarks;

    const bookmark = await bookmarksApi.createBookmark({
      url: "https://example.com",
      type: BookmarkTypes.LINK,
    });

    await expect(() =>
      api.create({
        bookmarkId: bookmark.id,
        assetId: "non-existent-asset-id",
        exact: "Test text",
        prefix: "",
        suffix: "",
        startOffset: 0,
        color: "yellow",
        comment: null,
      }),
    ).rejects.toThrow(/Asset does not belong to this bookmark/);
  });

  test<CustomTestContext>("update annotation", async ({ apiCallers }) => {
    const api = apiCallers[0].pageAnnotations;
    const bookmarksApi = apiCallers[0].bookmarks;

    const bookmark = await bookmarksApi.createBookmark({
      url: "https://example.com",
      type: BookmarkTypes.LINK,
    });

    const annotation = await api.create({
      bookmarkId: bookmark.id,
      assetId: null,
      exact: "Original text",
      prefix: "",
      suffix: "",
      startOffset: 0,
      color: "yellow",
      comment: "Original comment",
    });

    const updated = await api.update({
      annotationId: annotation.id,
      color: "blue",
      comment: "Updated comment",
    });

    expect(updated.color).toEqual("blue");
    expect(updated.comment).toEqual("Updated comment");
    expect(updated.exact).toEqual("Original text");
    expect(updated.updatedAt).not.toBeNull();
  });

  test<CustomTestContext>("delete annotation", async ({ apiCallers }) => {
    const api = apiCallers[0].pageAnnotations;
    const bookmarksApi = apiCallers[0].bookmarks;

    const bookmark = await bookmarksApi.createBookmark({
      url: "https://example.com",
      type: BookmarkTypes.LINK,
    });

    const annotation = await api.create({
      bookmarkId: bookmark.id,
      assetId: null,
      exact: "To be deleted",
      prefix: "",
      suffix: "",
      startOffset: 0,
      color: "yellow",
      comment: null,
    });

    await api.delete({ annotationId: annotation.id });

    await expect(() =>
      api.update({ annotationId: annotation.id, color: "blue" }),
    ).rejects.toThrow(/Annotation not found/);
  });

  test<CustomTestContext>("getForBookmark orders annotations by startOffset", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].pageAnnotations;
    const bookmarksApi = apiCallers[0].bookmarks;

    const bookmark = await bookmarksApi.createBookmark({
      url: "https://example.com",
      type: BookmarkTypes.LINK,
    });

    const second = await api.create({
      bookmarkId: bookmark.id,
      assetId: null,
      exact: "Second",
      prefix: "",
      suffix: "",
      startOffset: 100,
      color: "yellow",
      comment: null,
    });
    const first = await api.create({
      bookmarkId: bookmark.id,
      assetId: null,
      exact: "First",
      prefix: "",
      suffix: "",
      startOffset: 10,
      color: "yellow",
      comment: null,
    });

    const res = await api.getForBookmark({ bookmarkId: bookmark.id });
    expect(res.annotations.map((a) => a.id)).toEqual([first.id, second.id]);
  });

  test<CustomTestContext>("deleting the bookmark cascades to its annotations", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].pageAnnotations;
    const bookmarksApi = apiCallers[0].bookmarks;

    const bookmark = await bookmarksApi.createBookmark({
      url: "https://example.com",
      type: BookmarkTypes.LINK,
    });

    const annotation = await api.create({
      bookmarkId: bookmark.id,
      assetId: null,
      exact: "Will be cascaded",
      prefix: "",
      suffix: "",
      startOffset: 0,
      color: "yellow",
      comment: null,
    });

    await bookmarksApi.deleteBookmark({ bookmarkId: bookmark.id });

    await expect(() =>
      api.update({ annotationId: annotation.id, color: "blue" }),
    ).rejects.toThrow(/Annotation not found/);
  });

  test<CustomTestContext>("privacy for page annotations", async ({
    apiCallers,
  }) => {
    const apiUser1 = apiCallers[0].pageAnnotations;
    const apiUser2 = apiCallers[1].pageAnnotations;
    const bookmarksApiUser1 = apiCallers[0].bookmarks;
    const bookmarksApiUser2 = apiCallers[1].bookmarks;

    const bookmarkUser1 = await bookmarksApiUser1.createBookmark({
      url: "https://user1-example.com",
      type: BookmarkTypes.LINK,
    });
    const bookmarkUser2 = await bookmarksApiUser2.createBookmark({
      url: "https://user2-example.com",
      type: BookmarkTypes.LINK,
    });

    const annotationUser1 = await apiUser1.create({
      bookmarkId: bookmarkUser1.id,
      assetId: null,
      exact: "User1 annotation",
      prefix: "",
      suffix: "",
      startOffset: 0,
      color: "yellow",
      comment: null,
    });
    const annotationUser2 = await apiUser2.create({
      bookmarkId: bookmarkUser2.id,
      assetId: null,
      exact: "User2 annotation",
      prefix: "",
      suffix: "",
      startOffset: 0,
      color: "blue",
      comment: null,
    });

    // User1 can't create an annotation on User2's bookmark (User1 has no
    // access to it at all, so ensureBookmarkOwnership reports it as
    // not found rather than forbidden, matching the rest of the codebase's
    // privacy convention for bookmarks the caller can't see).
    await expect(() =>
      apiUser1.create({
        bookmarkId: bookmarkUser2.id,
        assetId: null,
        exact: "Trying to annotate someone else's bookmark",
        prefix: "",
        suffix: "",
        startOffset: 0,
        color: "yellow",
        comment: null,
      }),
    ).rejects.toThrow(/Bookmark not found/);

    // User1 can't update or delete User2's annotation.
    await expect(() =>
      apiUser1.update({ annotationId: annotationUser2.id, color: "red" }),
    ).rejects.toThrow(/User is not allowed to access resource/);
    await expect(() =>
      apiUser2.update({ annotationId: annotationUser1.id, color: "red" }),
    ).rejects.toThrow(/User is not allowed to access resource/);
  });
});
