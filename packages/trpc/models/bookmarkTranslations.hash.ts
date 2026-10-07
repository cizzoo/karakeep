import { createHash } from "node:crypto";

// Identifies the exact reader HTML a translation was made from.
export function hashReaderHtml(html: string): string {
  return createHash("sha256").update(html, "utf8").digest("hex");
}
