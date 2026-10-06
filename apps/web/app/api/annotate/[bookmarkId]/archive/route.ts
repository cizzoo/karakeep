import { Readable } from "node:stream";
import { NextRequest } from "next/server";
import {
  createContextFromRequest,
  createTrcpClientFromCtx,
} from "@/server/api/client";

import {
  createAssetReadStream,
  getAssetSize,
  readAssetMetadata,
} from "@karakeep/shared-server";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookmarkId: string }> },
) {
  const { bookmarkId } = await params;
  const ctx = await createContextFromRequest(request);
  if (!ctx.user) {
    return new Response(null, { status: 404 });
  }

  const caller = createTrcpClientFromCtx(() => ctx);
  const archiveInfo = await caller.pageAnnotations
    .getArchiveInfo({ bookmarkId })
    .catch(() => null);
  if (!archiveInfo) {
    return new Response(null, { status: 404 });
  }

  const [metadata, size] = await Promise.all([
    readAssetMetadata({ userId: ctx.user.id, assetId: archiveInfo.assetId }),
    getAssetSize({ userId: ctx.user.id, assetId: archiveInfo.assetId }),
  ]);
  const nodeStream = await createAssetReadStream({
    userId: ctx.user.id,
    assetId: archiveInfo.assetId,
  });

  return new Response(
    Readable.toWeb(
      nodeStream as Readable,
    ) as unknown as ReadableStream<Uint8Array>,
    {
      status: 200,
      headers: {
        "Content-Type": metadata.contentType ?? "text/html; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
        "Content-Length": size.toString(),
        "Content-Security-Policy":
          "script-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'",
      },
    },
  );
}
