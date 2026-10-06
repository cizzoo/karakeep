import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import type { DB } from "@karakeep/db";
import { assets } from "@karakeep/db/schema";
import type { ZArchiveInfo } from "@karakeep/shared/types/pageAnnotations";
import {
  zNewPageAnnotationSchema,
  zPageAnnotationSchema,
  zUpdatePageAnnotationSchema,
} from "@karakeep/shared/types/pageAnnotations";

import type { Actor, Authorized } from "../lib/actor";
import { actorUserId, assertOwnership, authorize } from "../lib/actor";
import { selectAnnotatableArchive } from "./pageAnnotations.archive";
import { PageAnnotationsRepo } from "./pageAnnotations.repo";

type PageAnnotation = z.infer<typeof zPageAnnotationSchema>;

export class PageAnnotationsService {
  private repo: PageAnnotationsRepo;

  constructor(private db: DB) {
    this.repo = new PageAnnotationsRepo(db);
  }

  async get(actor: Actor, id: string): Promise<Authorized<PageAnnotation>> {
    const annotation = await this.repo.get(id);
    if (!annotation) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Annotation not found",
      });
    }
    return authorize(annotation, () =>
      assertOwnership(actor, annotation.userId),
    );
  }

  async getArchiveInfo(bookmarkId: string): Promise<ZArchiveInfo> {
    const bookmarkAssets = await this.db.query.assets.findMany({
      where: eq(assets.bookmarkId, bookmarkId),
    });
    return selectAnnotatableArchive(bookmarkAssets);
  }

  async getForBookmark(bookmarkId: string): Promise<PageAnnotation[]> {
    return await this.repo.getForBookmark(bookmarkId);
  }

  async create(
    actor: Actor,
    input: z.infer<typeof zNewPageAnnotationSchema>,
  ): Promise<PageAnnotation> {
    if (input.assetId) {
      const asset = await this.db.query.assets.findFirst({
        where: eq(assets.id, input.assetId),
      });
      if (!asset || asset.bookmarkId !== input.bookmarkId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Asset does not belong to this bookmark",
        });
      }
    }
    return await this.repo.create(actorUserId(actor), input);
  }

  async update(
    annotation: Authorized<PageAnnotation>,
    input: z.infer<typeof zUpdatePageAnnotationSchema>,
  ): Promise<PageAnnotation> {
    const updated = await this.repo.update(annotation.id, input);
    if (!updated) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    return updated;
  }

  async delete(
    annotation: Authorized<PageAnnotation>,
  ): Promise<PageAnnotation> {
    const deleted = await this.repo.delete(annotation.id);
    if (!deleted) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    return deleted;
  }
}
