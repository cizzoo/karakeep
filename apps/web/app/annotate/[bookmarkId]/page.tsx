import { notFound } from "next/navigation";
import AnnotationViewer from "@/components/dashboard/annotate/AnnotationViewer";
import { api } from "@/server/api/client";
import { TRPCError } from "@trpc/server";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { getBookmarkTitle } from "@karakeep/shared/utils/bookmarkUtils";

export default async function AnnotatePage(props: {
  params: Promise<{ bookmarkId: string }>;
}) {
  const params = await props.params;
  let bookmark;
  try {
    bookmark = await api.bookmarks.getBookmark({
      bookmarkId: params.bookmarkId,
    });
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") {
      notFound();
    }
    throw e;
  }

  return (
    <AnnotationViewer
      bookmarkId={bookmark.id}
      bookmarkTitle={getBookmarkTitle(bookmark) ?? bookmark.id}
      originalUrl={
        bookmark.content.type === BookmarkTypes.LINK
          ? bookmark.content.url
          : null
      }
    />
  );
}
