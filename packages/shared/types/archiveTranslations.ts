import { z } from "zod";

// Bump when the translation prompt or the segmenter changes.
export const ARCHIVE_TRANSLATION_PROMPT_VERSION = 1;

export const zTranslationStatusSchema = z.object({
  status: z.enum(["pending", "running", "done", "failed", "cancelled"]),
  phase: z.enum(["warming_up", "translating", "saving"]).nullable(),
  progressDone: z.number(),
  progressTotal: z.number(),
  failedUnits: z.number(),
  // The bookmark's current archive asset id is the translated one.
  isApplied: z.boolean(),
  // Number of page annotations on the bookmark (used by confirmation dialogs).
  highlightsOnArchive: z.number(),
  error: z.string().nullable(),
  model: z.string(),
  updatedAt: z.date(),
  translatedAssetId: z.string().nullable(),
});
export type ZTranslationStatus = z.infer<typeof zTranslationStatusSchema>;
