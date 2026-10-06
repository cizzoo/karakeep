import { afterEach, describe, expect, test, vi } from "vitest";

import {
  parseSegments,
  stripThink,
  TranslatorClient,
  TranslatorClientConfig,
  TranslatorConfigError,
} from "./client";
import { translateDocument } from "./index";
import { TranslatorBadRequestError } from "./types";

let counter = 0;
function cfg(
  over: Partial<TranslatorClientConfig> = {},
): TranslatorClientConfig {
  return {
    baseUrl: `http://translator-${++counter}.test/v1`,
    apiKey: "SECRET-KEY",
    model: "translator",
    targetLanguage: "English",
    temperature: 0.3,
    requestTimeoutSec: 5,
    maxConcurrency: 2,
    maxOutputTokens: 6000,
    ...over,
  };
}

function ok(content: string, finish = "stop") {
  return new Response(
    JSON.stringify({
      choices: [{ finish_reason: finish, message: { content } }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function client(c: TranslatorClientConfig, fetchImpl: typeof fetch) {
  return new TranslatorClient(c, {
    fetchImpl: fetchImpl,
    retryDelaysMs: [1, 1, 1],
  });
}

const segs = [
  { id: 1, text: "你好<x1>世界</x1>" },
  { id: 2, text: "第二段" },
];

afterEach(() => vi.restoreAllMocks());

describe("TranslatorClient.translate", () => {
  test("builds the request and parses wrapped segments", async () => {
    const f = vi
      .fn()
      .mockResolvedValue(
        ok('<seg id="1">Hello <x1>world</x1></seg>\n<seg id="2">Second</seg>'),
      );
    const c = cfg();
    const res = await client(c, f).translate(segs, { title: 'My "title"' });
    expect(res.truncated).toBe(false);
    expect(res.segments.get(1)).toBe("Hello <x1>world</x1>");
    expect(res.segments.get(2)).toBe("Second");

    const [url, init] = f.mock.calls[0];
    expect(url).toBe(`${c.baseUrl}/chat/completions`);
    expect(init.headers.Authorization).toBe("Bearer SECRET-KEY");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("translator");
    expect(body.stream).toBe(false);
    expect(body.temperature).toBe(0.3);
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(body.max_tokens).toBeLessThanOrEqual(6000);
    expect(body.max_tokens).toBeGreaterThanOrEqual(256);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("My 'title'");
    expect(body.messages[0].content).toContain("fluent English");
    expect(body.messages[1].content).toBe(
      '<seg id="1">你好<x1>世界</x1></seg>\n<seg id="2">第二段</seg>',
    );
  });

  test("temperature override and max_tokens cap", async () => {
    const f = vi.fn().mockResolvedValue(ok('<seg id="1">x</seg>'));
    const c = cfg({ maxOutputTokens: 300 });
    await client(c, f).translate([{ id: 1, text: "长".repeat(1000) }], {
      title: "",
      temperature: 0.1,
    });
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body.temperature).toBe(0.1);
    expect(body.max_tokens).toBe(300);
  });

  test("strips <think> blocks and accepts an unwrapped single segment", async () => {
    const f = vi
      .fn()
      .mockResolvedValue(
        ok('<think>reasoning <seg id="9">no</seg></think>\nHello there'),
      );
    const res = await client(cfg(), f).translate([{ id: 5, text: "你好" }], {
      title: "",
    });
    expect([...res.segments]).toEqual([[5, "Hello there"]]);
  });

  test("duplicate ids are dropped, finish_reason length flags truncation", async () => {
    const f = vi
      .fn()
      .mockResolvedValue(
        ok(
          '<seg id="1">a</seg><seg id="1">b</seg><seg id="2">c</seg>',
          "length",
        ),
      );
    const res = await client(cfg(), f).translate(segs, { title: "" });
    expect(res.truncated).toBe(true);
    expect(res.segments.has(1)).toBe(false);
    expect(res.segments.get(2)).toBe("c");
  });

  test("malformed multi-segment output yields no segments (no unwrapped fallback)", async () => {
    const f = vi.fn().mockResolvedValue(ok("just some text"));
    const res = await client(cfg(), f).translate(segs, { title: "" });
    expect(res.segments.size).toBe(0);
  });

  test("retries on 5xx then succeeds", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response("boom", { status: 503 }))
      .mockResolvedValueOnce(new Response("boom", { status: 500 }))
      .mockResolvedValueOnce(ok('<seg id="1">ok</seg><seg id="2">ok2</seg>'));
    const res = await client(cfg(), f).translate(segs, { title: "" });
    expect(f).toHaveBeenCalledTimes(3);
    expect(res.segments.get(1)).toBe("ok");
  });

  test("gives up after 3 retries on persistent 5xx", async () => {
    const f = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response("x", { status: 502 })),
      );
    await expect(
      client(cfg(), f).translate(segs, { title: "" }),
    ).rejects.toThrow(/502/);
    expect(f).toHaveBeenCalledTimes(4);
  });

  test("retries network errors", async () => {
    const f = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(ok('<seg id="1">a</seg><seg id="2">b</seg>'));
    const res = await client(cfg(), f).translate(segs, { title: "" });
    expect(res.segments.size).toBe(2);
    expect(f).toHaveBeenCalledTimes(2);
  });

  test("times out slow requests and retries", async () => {
    let n = 0;
    const f = vi.fn().mockImplementation((_u: string, init: RequestInit) => {
      if (n++ === 0) {
        return new Promise((_res, rej) => {
          init.signal!.addEventListener("abort", () =>
            rej(init.signal!.reason),
          );
        });
      }
      return Promise.resolve(ok('<seg id="1">a</seg><seg id="2">b</seg>'));
    });
    const res = await client(cfg({ requestTimeoutSec: 0.05 }), f).translate(
      segs,
      { title: "" },
    );
    expect(res.segments.size).toBe(2);
    expect(f).toHaveBeenCalledTimes(2);
  });

  test("cold start: slow first response still succeeds", async () => {
    const f = vi
      .fn()
      .mockImplementation(
        () =>
          new Promise((r) =>
            setTimeout(
              () => r(ok('<seg id="1">a</seg><seg id="2">b</seg>')),
              100,
            ),
          ),
      );
    const res = await client(cfg(), f).translate(segs, { title: "" });
    expect(res.segments.size).toBe(2);
  });

  test("401 and 404 are fatal config errors without retry", async () => {
    for (const status of [401, 404]) {
      const f = vi.fn().mockResolvedValue(new Response("{}", { status }));
      await expect(
        client(cfg(), f).translate(segs, { title: "" }),
      ).rejects.toBeInstanceOf(TranslatorConfigError);
      expect(f).toHaveBeenCalledTimes(1);
    }
  });

  test("other 4xx surface as TranslatorBadRequestError, never leak the key", async () => {
    const f = vi
      .fn()
      .mockResolvedValue(new Response("context too long", { status: 400 }));
    const err = await client(cfg(), f)
      .translate(segs, { title: "" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(TranslatorBadRequestError);
    expect(String(err.message)).not.toContain("SECRET-KEY");
    expect(f).toHaveBeenCalledTimes(1);
  });

  test("caller abort stops immediately", async () => {
    const ac = new AbortController();
    ac.abort(new Error("cancelled"));
    const f = vi.fn();
    await expect(
      client(cfg(), f).translate(segs, { title: "", signal: ac.signal }),
    ).rejects.toThrow("cancelled");
    expect(f).not.toHaveBeenCalled();
  });

  test("process-wide concurrency limit is enforced", async () => {
    let inflight = 0;
    let max = 0;
    const f = vi.fn().mockImplementation(async () => {
      inflight++;
      max = Math.max(max, inflight);
      await new Promise((r) => setTimeout(r, 20));
      inflight--;
      return ok('<seg id="1">a</seg><seg id="2">b</seg>');
    });
    const c = cfg({ maxConcurrency: 2 });
    const a = client(c, f);
    const b = client(c, f);
    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        (i % 2 ? a : b).translate(segs, { title: "" }),
      ),
    );
    expect(f).toHaveBeenCalledTimes(6);
    expect(max).toBe(2);
  });
});

describe("TranslatorClient.preflight", () => {
  const models = (value: string) =>
    new Response(
      JSON.stringify({ data: [{ id: "translator", status: { value } }] }),
      { status: 200 },
    );

  test("loaded / unloaded", async () => {
    const c = cfg();
    let f = vi.fn().mockResolvedValue(models("loaded"));
    expect(await client(c, f).preflight()).toBe("loaded");
    expect(f.mock.calls[0][0]).toBe(`${c.baseUrl}/models`);
    f = vi.fn().mockResolvedValue(models("unloaded"));
    expect(await client(c, f).preflight()).toBe("unloaded");
  });

  test("unknown on errors, throws on 401", async () => {
    expect(
      await client(
        cfg(),
        vi.fn().mockRejectedValue(new Error("down")),
      ).preflight(),
    ).toBe("unknown");
    expect(
      await client(
        cfg(),
        vi.fn().mockResolvedValue(new Response("x", { status: 500 })),
      ).preflight(),
    ).toBe("unknown");
    expect(
      await client(
        cfg(),
        vi.fn().mockResolvedValue(new Response("not json", { status: 200 })),
      ).preflight(),
    ).toBe("unknown");
    await expect(
      client(
        cfg(),
        vi.fn().mockResolvedValue(new Response("", { status: 401 })),
      ).preflight(),
    ).rejects.toBeInstanceOf(TranslatorConfigError);
  });
});

describe("helpers", () => {
  test("stripThink / parseSegments", () => {
    expect(stripThink("<think>a</think>b<think>c</think>d")).toBe("bd");
    expect(stripThink("x<think>unterminated")).toBe("x");
    const m = parseSegments('<seg id="3"> a </seg>\n<seg id="4">b</seg>', 2);
    expect([...m]).toEqual([
      [3, "a"],
      [4, "b"],
    ]);
  });
});

describe("client + library end to end", () => {
  test("translates a document through a fake llama-swap", async () => {
    const f = vi
      .fn()
      .mockImplementation(async (_u: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        const user: string = body.messages[1].content;
        const out = user.replace(
          />([^<]+)</g,
          (_m, t) => `>${t.replace("你好", "Hello")}<`,
        );
        return ok(out.replace(/<seg id="(\d+)">你好/g, '<seg id="$1">Hello'));
      });
    const c = client(cfg(), f);
    const res = await translateDocument(
      '<html><head><title>标题</title></head><body><p>你好，世界。</p><p>你好 <a href="/a">链接</a> 再见。</p></body></html>',
      { translator: c, batchTokenBudget: 1500, maxUnits: 100 },
    );
    expect(res.failedUnits).toBe(0);
    expect(res.html).toContain("<p>Hello，世界。</p>");
    expect(res.html).toContain('Hello <a href="/a">链接</a> 再见。');
  });
});
