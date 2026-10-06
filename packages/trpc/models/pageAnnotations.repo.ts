import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import type { DB } from "@karakeep/db";
import { pageAnnotations } from "@karakeep/db/schema";
import {
  zNewPageAnnotationSchema,
  zPageAnnotationSchema,
  zUpdatePageAnnotationSchema,
} from "@karakeep/shared/types/pageAnnotations";

type PageAnnotation = z.infer<typeof zPageAnnotationSchema>;

export class PageAnnotationsRepo {
  constructor(private db: DB) {}

  async get(id: string): Promise<PageAnnotation | null> {
    const annotation = await this.db.query.pageAnnotations.findFirst({
      where: eq(pageAnnotations.id, id),
    });
    return annotation ?? null;
  }

  async create(
    userId: string,
    input: z.infer<typeof zNewPageAnnotationSchema>,
  ): Promise<PageAnnotation> {
    const [result] = await this.db
      .insert(pageAnnotations)
      .values({
        bookmarkId: input.bookmarkId,
        assetId: input.assetId,
        exact: input.exact,
        prefix: input.prefix,
        suffix: input.suffix,
        startOffset: input.startOffset,
        color: input.color,
        comment: input.comment,
        userId,
      })
      .returning();

    return result;
  }

  async getForBookmark(bookmarkId: string): Promise<PageAnnotation[]> {
    return await this.db.query.pageAnnotations.findMany({
      where: eq(pageAnnotations.bookmarkId, bookmarkId),
      orderBy: [asc(pageAnnotations.startOffset)],
    });
  }

  async delete(id: string): Promise<PageAnnotation | null> {
    const result = await this.db
      .delete(pageAnnotations)
      .where(eq(pageAnnotations.id, id))
      .returning();

    return result[0] ?? null;
  }

  async update(
    id: string,
    input: z.infer<typeof zUpdatePageAnnotationSchema>,
  ): Promise<PageAnnotation | null> {
    const result = await this.db
      .update(pageAnnotations)
      .set({
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.comment !== undefined ? { comment: input.comment } : {}),
        updatedAt: new Date(),
      })
      .where(eq(pageAnnotations.id, id))
      .returning();

    return result[0] ?? null;
  }
}
