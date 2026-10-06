import { parse, serialize } from "parse5";

import { estimateTokens, groupBatches, splitEncoded } from "./batch";
import { setAttr } from "./dom";
import {
  applyAttrReplacement,
  applyRunReplacements,
  UnitReplacement,
} from "./reconstruct";
import {
  asciiRatio,
  dominantScriptIsNonLatin,
  segmentDocument,
  Unit,
} from "./segment";
import { Token, tokenize } from "./tokens";
import {
  BatchTranslator,
  TranslationCancelledError,
  TranslationTooLargeError,
  TranslatorBadRequestError,
} from "./types";
import { validateTranslation } from "./validate";

// Single source of truth shared with the tRPC layer, which stores it on the
// translation row. Bump it when the prompt or the segmenter changes.
export { ARCHIVE_TRANSLATION_PROMPT_VERSION as PROMPT_VERSION } from "@karakeep/shared/types/archiveTranslations";

export * from "./client";
export * from "./types";

export interface TranslateDocumentOptions {
  translator: BatchTranslator;
  batchTokenBudget: number;
  maxUnits: number;
  maxConcurrentBatches?: number;
  onProgress?: (done: number, total: number) => void | Promise<void>;
  isCancelled?: () => Promise<boolean>;
}

export interface TranslateDocumentResult {
  html: string;
  totalUnits: number;
  failedUnits: number;
}

export function isAlreadyTranslated(html: string): boolean {
  const head = html.slice(0, 200_000);
  return /<html\b[^>]*\sdata-karakeep-translation(\s|=|>|\/)/i.test(head);
}

const ASCII_SKIP_RATIO = 0.95;

interface Part {
  unit: Unit;
  index: number;
  text: string;
}

export async function translateDocument(
  html: string,
  opts: TranslateDocumentOptions,
): Promise<TranslateDocumentResult> {
  const doc = parse(html);
  const seg = segmentDocument(doc);
  let units = seg.units;
  if (dominantScriptIsNonLatin(units)) {
    units = units.filter((u) => asciiRatio(u.plain) < ASCII_SKIP_RATIO);
  }
  if (units.length > opts.maxUnits) {
    throw new TranslationTooLargeError(
      `Page has ${units.length} translatable units (limit ${opts.maxUnits})`,
    );
  }

  const total = units.length;
  const budget = opts.batchTokenBudget;
  const parts: Part[] = [];
  const partTexts = new Map<Unit, string[]>();
  for (const u of units) {
    const texts = splitEncoded(u.encoded, budget);
    partTexts.set(u, texts);
    texts.forEach((text, index) => parts.push({ unit: u, index, text }));
  }

  const results = new Map<Unit, (string | null | undefined)[]>();
  const remaining = new Map<Unit, number>();
  for (const u of units) {
    const n = partTexts.get(u)!.length;
    results.set(u, Array.from<string | null | undefined>({ length: n }));
    remaining.set(u, n);
  }
  let done = 0;
  const finishPart = async (p: Part, value: string | null) => {
    results.get(p.unit)![p.index] = value;
    const left = remaining.get(p.unit)! - 1;
    remaining.set(p.unit, left);
    if (left === 0) {
      done++;
      await opts.onProgress?.(done, total);
    }
  };

  const checkCancel = async () => {
    if (opts.isCancelled && (await opts.isCancelled())) {
      throw new TranslationCancelledError("Translation cancelled");
    }
  };

  const title = seg.title;

  const run = async (batch: Part[], temperature?: number): Promise<void> => {
    await checkCancel();
    const segments = batch.map((p, i) => ({ id: i + 1, text: p.text }));
    let res;
    try {
      res = await opts.translator.translate(segments, { title, temperature });
    } catch (e) {
      if (e instanceof TranslatorBadRequestError) {
        if (batch.length > 1) return splitAndRun(batch, temperature);
        return finishPart(batch[0], null);
      }
      throw e;
    }
    const expected = new Set(segments.map((s) => s.id));
    const gotIds = [...res.segments.keys()];
    const idsOk =
      gotIds.length === expected.size && gotIds.every((id) => expected.has(id));
    if (res.truncated || !idsOk) {
      if (batch.length > 1) return splitAndRun(batch, temperature);
      if (temperature === undefined) return run(batch, 0.1);
      return finishPart(batch[0], null);
    }
    const retry: Part[] = [];
    for (let i = 0; i < batch.length; i++) {
      const p = batch[i];
      const out = res.segments.get(i + 1);
      if (validateTranslation(p.text, out) && out !== undefined) {
        await finishPart(p, out.trim());
      } else if (temperature === undefined) {
        retry.push(p);
      } else {
        await finishPart(p, null);
      }
    }
    for (const p of retry) await run([p], 0.1);
  };

  const splitAndRun = async (batch: Part[], temperature?: number) => {
    const mid = Math.ceil(batch.length / 2);
    await run(batch.slice(0, mid), temperature);
    await run(batch.slice(mid), temperature);
  };

  const batches = groupBatches(parts, (p) => estimateTokens(p.text), budget);
  const queue = [...batches];
  const concurrency = Math.max(1, opts.maxConcurrentBatches ?? 2);
  let failure: unknown;
  const worker = async () => {
    while (queue.length > 0 && failure === undefined) {
      const batch = queue.shift()!;
      try {
        await run(batch);
      } catch (e) {
        failure = e;
        return;
      }
    }
  };
  await opts.onProgress?.(0, total);
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  if (failure !== undefined) throw failure;

  // Assemble per-unit results.
  const attrReps: UnitReplacement[] = [];
  const runReps: UnitReplacement[] = [];
  let failedUnits = 0;
  for (const u of units) {
    const rs = results.get(u)!;
    if (rs.some((r) => r === null || r === undefined)) {
      failedUnits++;
      continue;
    }
    const joined = (rs as string[]).join(" ");
    if (joined === u.encoded) continue; // unchanged, keep original nodes
    const tokens: Token[] | null = tokenize(joined);
    if (!tokens) {
      failedUnits++;
      continue;
    }
    (u.kind === "attr" ? attrReps : runReps).push({ unit: u, tokens });
  }
  // Attribute edits first so that cloned placeholders carry them.
  for (const r of attrReps) applyAttrReplacement(r);
  applyRunReplacements(runReps);

  if (seg.html) {
    setAttr(seg.html, "lang", "en");
    setAttr(seg.html, "data-karakeep-translation", "1");
  }
  return { html: serialize(doc), totalUnits: total, failedUnits };
}
