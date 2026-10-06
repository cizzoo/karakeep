import { AsyncSemaphore } from "@karakeep/shared/concurrency";

import { estimateTokens } from "./batch";
import {
  BatchResult,
  BatchSegment,
  BatchTranslator,
  TranslatorBadRequestError,
} from "./types";

export interface TranslatorClientConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  targetLanguage: string;
  temperature: number;
  requestTimeoutSec: number;
  maxConcurrency: number;
  maxOutputTokens: number;
}

export interface TranslatorClientOptions {
  /** Backoff delays between retries (ms). Default [5000, 15000, 45000]. */
  retryDelaysMs?: number[];
  fetchImpl?: typeof fetch;
}

/** 401/404: misconfiguration, fatal, never retried. */
export class TranslatorConfigError extends Error {}

const DEFAULT_RETRY_DELAYS = [5_000, 15_000, 45_000];

// Process-wide limiter, keyed by base URL.
const semaphores = new Map<string, AsyncSemaphore>();
function semaphoreFor(baseUrl: string, permits: number): AsyncSemaphore {
  let s = semaphores.get(baseUrl);
  if (!s) {
    s = new AsyncSemaphore(Math.max(1, permits));
    semaphores.set(baseUrl, s);
  }
  return s;
}

export function buildSystemPrompt(title: string, targetLanguage: string) {
  const safeTitle = title.replace(/\s+/g, " ").replace(/"/g, "'").slice(0, 200);
  return `You are a professional translator. Translate the text of every segment into natural, fluent ${targetLanguage}.
The document title is: "${safeTitle}".

Rules:
1. Return exactly the same segments, with the same <seg id="N"> wrappers, in the same order, one output segment per input segment. Output nothing else: no notes, no explanations.
2. Keep every placeholder tag exactly as written: <xN>...</xN>, <xN/>, <cN>...</cN>. Same names, same count, properly nested. You may move placeholders to follow ${targetLanguage} word order.
3. Translate the text inside <xN>...</xN>. Copy the text inside <cN>...</cN> unchanged.
4. Keep URLs, file paths, numbers, code identifiers, product names and units unchanged.
5. If a segment is already in ${targetLanguage}, return it unchanged.
6. Keep &amp;, &lt; and &gt; as they are.`;
}

export function stripThink(content: string): string {
  let out = content.replace(/<think>[\s\S]*?<\/think>/g, "");
  // Unterminated think block: nothing usable follows it.
  out = out.replace(/<think>[\s\S]*$/, "");
  return out.trim();
}

/** Parse `<seg id="N">…</seg>` wrappers. Duplicated ids are dropped. */
export function parseSegments(
  content: string,
  expectedCount: number,
  onlyId?: number,
): Map<number, string> {
  const map = new Map<number, string>();
  const dups = new Set<number>();
  const re = /<seg\s+id="(\d+)"\s*>([\s\S]*?)<\/seg>/g;
  let m: RegExpExecArray | null;
  let matched = 0;
  while ((m = re.exec(content)) !== null) {
    matched++;
    const id = parseInt(m[1], 10);
    if (map.has(id) || dups.has(id)) {
      dups.add(id);
      map.delete(id);
    } else {
      map.set(id, m[2].trim());
    }
  }
  if (matched === 0 && expectedCount === 1 && onlyId !== undefined) {
    const whole = content.trim();
    if (whole) map.set(onlyId, whole);
  }
  return map;
}

export class TranslatorClient implements BatchTranslator {
  private readonly retryDelays: number[];
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly cfg: TranslatorClientConfig,
    options: TranslatorClientOptions = {},
  ) {
    this.retryDelays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS;
    this.fetchImpl = options.fetchImpl ?? ((...a) => fetch(...a));
  }

  private get base(): string {
    return this.cfg.baseUrl.replace(/\/+$/, "");
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.cfg.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  async preflight(): Promise<"loaded" | "unloaded" | "unknown"> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}/models`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      return "unknown";
    }
    if (res.status === 401) {
      throw new TranslatorConfigError(
        "Translator rejected the API key (401). Check TRANSLATION_API_KEY.",
      );
    }
    if (!res.ok) return "unknown";
    try {
      const json = (await res.json()) as {
        data?: { id?: string; status?: { value?: string } }[];
      };
      const entry = json.data?.find((m) => m.id === this.cfg.model);
      const v = entry?.status?.value;
      if (v === "loaded" || v === "unloaded") return v;
    } catch {
      // fall through
    }
    return "unknown";
  }

  async translate(
    segments: BatchSegment[],
    opts: { title: string; temperature?: number; signal?: AbortSignal },
  ): Promise<BatchResult> {
    const user = segments
      .map((s) => `<seg id="${s.id}">${s.text}</seg>`)
      .join("\n");
    const maxTokens = Math.min(
      this.cfg.maxOutputTokens,
      3 * estimateTokens(user) + 256,
    );
    const body = JSON.stringify({
      model: this.cfg.model,
      temperature: opts.temperature ?? this.cfg.temperature,
      max_tokens: maxTokens,
      stream: false,
      chat_template_kwargs: { enable_thinking: false },
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(opts.title, this.cfg.targetLanguage),
        },
        { role: "user", content: user },
      ],
    });

    const sem = semaphoreFor(this.base, this.cfg.maxConcurrency);
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.retryDelays.length; attempt++) {
      if (attempt > 0) {
        await sleep(this.retryDelays[attempt - 1], opts.signal);
      }
      if (opts.signal?.aborted) throw abortError(opts.signal);
      await sem.acquire();
      try {
        return await this.once(body, segments, opts.signal);
      } catch (e) {
        if (
          e instanceof TranslatorConfigError ||
          e instanceof TranslatorBadRequestError ||
          opts.signal?.aborted
        ) {
          throw e;
        }
        lastErr = e;
      } finally {
        sem.release();
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error("Translator request failed");
  }

  private async once(
    body: string,
    segments: BatchSegment[],
    signal?: AbortSignal,
  ): Promise<BatchResult> {
    const timeout = AbortSignal.timeout(this.cfg.requestTimeoutSec * 1000);
    const res = await this.fetchImpl(`${this.base}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body,
      signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
    });
    if (res.status === 401 || res.status === 404) {
      throw new TranslatorConfigError(
        res.status === 401
          ? "Translator rejected the API key (401). Check TRANSLATION_API_KEY."
          : `Translator endpoint or model not found (404). Check TRANSLATION_BASE_URL and TRANSLATION_MODEL.`,
      );
    }
    if (res.status >= 500) {
      throw new Error(`Translator server error ${res.status}`);
    }
    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 200);
      throw new TranslatorBadRequestError(
        `Translator rejected request (${res.status}): ${text}`,
      );
    }
    const json = (await res.json()) as {
      choices?: {
        finish_reason?: string;
        message?: { content?: string | null };
      }[];
    };
    const choice = json.choices?.[0];
    if (!choice) throw new Error("Translator returned no choices");
    const content = stripThink(choice.message?.content ?? "");
    return {
      segments: parseSegments(
        content,
        segments.length,
        segments.length === 1 ? segments[0].id : undefined,
      ),
      truncated: choice.finish_reason === "length",
    };
  }
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error("Translation aborted");
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError(signal));
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(abortError(signal!));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
