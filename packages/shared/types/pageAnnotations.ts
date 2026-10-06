import { z } from "zod";

const zAnnotationColorSchema = z.enum(["red", "green", "blue", "yellow"]);
export type ZAnnotationColor = z.infer<typeof zAnnotationColorSchema>;
export const SUPPORTED_ANNOTATION_COLORS = zAnnotationColorSchema.options;

const zTextQuoteSelectorSchema = z.object({
  exact: z.string().min(1).max(10_000),
  prefix: z.string().max(32),
  suffix: z.string().max(32),
  startOffset: z.number().int().nonnegative(),
});

const zPageAnnotationBaseSchema = zTextQuoteSelectorSchema.extend({
  bookmarkId: z.string(),
  assetId: z.string().nullable(),
  color: zAnnotationColorSchema.default("yellow"),
  comment: z.string().max(10_000).nullable(),
});

export const zPageAnnotationSchema = zPageAnnotationBaseSchema.extend(
  z.object({
    id: z.string(),
    userId: z.string(),
    createdAt: z.date(),
    updatedAt: z.date().nullable(),
  }).shape,
);
export type ZPageAnnotation = z.infer<typeof zPageAnnotationSchema>;

export const zNewPageAnnotationSchema = zPageAnnotationBaseSchema;

export const zUpdatePageAnnotationSchema = z.object({
  annotationId: z.string(),
  color: zAnnotationColorSchema.optional(),
  comment: z.string().max(10_000).nullable().optional(),
});

export const zArchiveInfoSchema = z
  .object({
    assetId: z.string(),
    assetType: z.enum(["fullPageArchive", "precrawledArchive"]),
  })
  .nullable();
export type ZArchiveInfo = z.infer<typeof zArchiveInfoSchema>;
