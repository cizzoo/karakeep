import { describe, expect, test } from "vitest";

import { AssetTypes } from "@karakeep/db/schema";

import { selectAnnotatableArchive } from "./pageAnnotations.archive";

describe("selectAnnotatableArchive", () => {
  test("prefers the precrawled (SingleFile) archive over the full-page (monolith) archive", () => {
    const result = selectAnnotatableArchive([
      { id: "full-page-asset", assetType: AssetTypes.LINK_FULL_PAGE_ARCHIVE },
      {
        id: "precrawled-asset",
        assetType: AssetTypes.LINK_PRECRAWLED_ARCHIVE,
      },
    ]);
    expect(result).toEqual({
      assetId: "precrawled-asset",
      assetType: "precrawledArchive",
    });
  });

  test("falls back to the full-page archive when no precrawled archive exists", () => {
    const result = selectAnnotatableArchive([
      { id: "full-page-asset", assetType: AssetTypes.LINK_FULL_PAGE_ARCHIVE },
      { id: "screenshot-asset", assetType: AssetTypes.LINK_SCREENSHOT },
    ]);
    expect(result).toEqual({
      assetId: "full-page-asset",
      assetType: "fullPageArchive",
    });
  });

  test("returns null when neither archive type exists", () => {
    const result = selectAnnotatableArchive([
      { id: "screenshot-asset", assetType: AssetTypes.LINK_SCREENSHOT },
      { id: "pdf-asset", assetType: AssetTypes.LINK_PDF },
    ]);
    expect(result).toBeNull();
  });

  test("returns null for an empty asset list", () => {
    expect(selectAnnotatableArchive([])).toBeNull();
  });
});
