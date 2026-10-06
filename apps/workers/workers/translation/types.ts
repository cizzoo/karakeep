export interface BatchSegment {
  id: number;
  /** Encoded unit (placeholders, escaped & < >). */
  text: string;
}

export interface BatchResult {
  /** Raw model output per seg id (still encoded). */
  segments: Map<number, string>;
  /** finish_reason === "length" */
  truncated: boolean;
}

export interface BatchTranslator {
  translate(
    segments: BatchSegment[],
    opts: { title: string; temperature?: number; signal?: AbortSignal },
  ): Promise<BatchResult>;
}

/**
 * The server rejected the request itself (e.g. 400/413, context exceeded).
 * Retrying the same payload is pointless, but splitting the batch may help.
 */
export class TranslatorBadRequestError extends Error {}

export class TranslationTooLargeError extends Error {}
export class TranslationCancelledError extends Error {}
