import { plainTextOf, signature, Token, tokenize, wellNested } from "./tokens";

export const MIN_RATIO = 0.2;
export const MAX_RATIO = 6;
const RATIO_MIN_LEN = 20;

/**
 * Validate a model output against the encoded input of the same segment.
 * Returns the parsed tokens when acceptable, null otherwise.
 */
export function validateTranslation(
  input: string,
  output: string | undefined,
): Token[] | null {
  if (output === undefined) return null;
  const out = output.trim();
  if (!out) return null;
  const inTokens = tokenize(input);
  const outTokens = tokenize(out);
  if (!inTokens || !outTokens) return null;

  const a = signature(inTokens);
  const b = signature(outTokens);
  if (a.length !== b.length || a.some((v, i) => v !== b[i])) return null;
  if (!wellNested(outTokens)) return null;

  const inLen = plainTextOf(inTokens).trim().length;
  const outLen = plainTextOf(outTokens).trim().length;
  if (inLen > 0 && outLen === 0) return null;
  if (inLen > RATIO_MIN_LEN) {
    const ratio = outLen / inLen;
    if (ratio < MIN_RATIO || ratio > MAX_RATIO) return null;
  }
  return outTokens;
}
