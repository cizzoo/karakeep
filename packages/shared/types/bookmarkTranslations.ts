import { z } from "zod";

// Bump when the translation prompt or the segmenter changes.
export const BOOKMARK_TRANSLATION_PROMPT_VERSION = 1;

export const zTranslationStatusSchema = z.object({
  status: z.enum(["pending", "running", "done", "failed", "cancelled"]),
  phase: z.enum(["warming_up", "translating", "saving"]).nullable(),
  progressDone: z.number(),
  progressTotal: z.number(),
  failedUnits: z.number(),
  error: z.string().nullable(),
  model: z.string(),
  updatedAt: z.date(),
  // The reader content changed since the translation was made.
  isStale: z.boolean(),
  // Highlights made on the English version; they are deleted together with it.
  englishHighlightsCount: z.number(),
});
export type ZTranslationStatus = z.infer<typeof zTranslationStatusSchema>;

export const zTranslatedContentSchema = z.object({ html: z.string() });
