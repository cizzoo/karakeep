import { AssetTypes } from "@karakeep/db/schema";
import type { ZArchiveInfo } from "@karakeep/shared/types/pageAnnotations";

export interface ArchiveCandidateAsset {
  id: string;
  assetType: string;
}

export function selectAnnotatableArchive(
  assets: ArchiveCandidateAsset[],
): ZArchiveInfo {
  const precrawled = assets.find(
    (a) => a.assetType === AssetTypes.LINK_PRECRAWLED_ARCHIVE,
  );
  if (precrawled) {
    return { assetId: precrawled.id, assetType: "precrawledArchive" };
  }
  const fullPage = assets.find(
    (a) => a.assetType === AssetTypes.LINK_FULL_PAGE_ARCHIVE,
  );
  if (fullPage) {
    return { assetId: fullPage.id, assetType: "fullPageArchive" };
  }
  return null;
}
