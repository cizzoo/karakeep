import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, serialize } from "parse5";
import { describe, expect, test } from "vitest";

import { estimateTokens, splitEncoded } from "./batch";
import {
  BatchResult,
  BatchSegment,
  BatchTranslator,
  isAlreadyTranslated,
  PROMPT_VERSION,
  translateDocument,
  TranslationCancelledError,
  TranslationTooLargeError,
} from "./index";
import { validateTranslation } from "./validate";

const FIXTURES = join(__dirname, "__fixtures__");
const fixture = (n: string) => readFileSync(join(FIXTURES, n), "utf8");

type Fn = (text: string, temperature?: number) => string | undefined;

function mock(fn: Fn, opts: { truncateAbove?: number } = {}) {
  const calls: { segs: BatchSegment[]; temperature?: number }[] = [];
  const translator: BatchTranslator = {
    translate(segs, o): Promise<BatchResult> {
      calls.push({ segs, temperature: o.temperature });
      const segments = new Map<number, string>();
      for (const s of segs) {
        const out = fn(s.text, o.temperature);
        if (out !== undefined) segments.set(s.id, out);
      }
      const truncated =
        opts.truncateAbove !== undefined && segs.length > opts.truncateAbove;
      return Promise.resolve({ segments, truncated });
    },
  };
  return { translator, calls };
}

const identity: Fn = (t) => t;
const base = { batchTokenBudget: 1500, maxUnits: 8000 };

/** Re-parse + serialize, dropping the attributes translation is allowed to set. */
function norm(html: string): string {
  const doc = parse(html);
  interface N {
    tagName?: string;
    attrs: { name: string }[];
    childNodes?: N[];
    content?: N;
  }
  const walk = (n: N) => {
    if (n.tagName === "html") {
      n.attrs = n.attrs.filter(
        (a) => a.name !== "lang" && a.name !== "data-karakeep-translation",
      );
    }
    for (const c of n.childNodes ?? []) walk(c);
    if (n.content) walk(n.content);
  };
  walk(doc as unknown as N);
  return serialize(doc);
}

describe("identity round trip", () => {
  for (const f of readdirSync(FIXTURES)) {
    test(`${f} is DOM-equivalent after identity translation`, async () => {
      const html = fixture(f);
      const { translator, calls } = mock(identity);
      const res = await translateDocument(html, { ...base, translator });
      expect(calls.length).toBeGreaterThan(0);
      expect(res.failedUnits).toBe(0);
      expect(norm(res.html)).toBe(norm(html));
      expect(res.html).toMatch(/<html [^>]*lang="en"/);
      expect(res.html).toContain('data-karakeep-translation="1"');
    });
  }

  test("keeps doctype and the leading SingleFile comment", async () => {
    const { translator } = mock(identity);
    const res = await translateDocument(fixture("singlefile.html.txt"), {
      ...base,
      translator,
    });
    const doctype = res.html.indexOf("<!DOCTYPE html>");
    const comment = res.html.indexOf("Page saved with SingleFile");
    const head = res.html.indexOf("<head>");
    expect(doctype).toBe(0);
    expect(comment).toBeGreaterThan(doctype);
    expect(head).toBeGreaterThan(comment);
    // comment placed before <html> (document child) survives as well
    const before = await translateDocument(
      "<!DOCTYPE html><!-- before html --><html><head></head><body><p>中文内容段落测试。</p></body></html>",
      { ...base, translator },
    );
    expect(
      before.html.startsWith("<!DOCTYPE html><!-- before html --><html"),
    ).toBe(true);
    expect(res.html).toContain("data:image/gif;base64,R0lGODlhAQABAAAAACw=");
  });

  test("handles a page with a multi-megabyte data: URI", async () => {
    const big = "A".repeat(3_000_000);
    const html = `<!DOCTYPE html><!-- c --><html><head><title>x</title></head><body><p>中文内容测试段落在这里。</p><img src="data:image/png;base64,${big}"></body></html>`;
    const { translator } = mock(
      (t) => `Chinese content test paragraph ${t.length}`,
    );
    const res = await translateDocument(html, { ...base, translator });
    expect(res.failedUnits).toBe(0);
    expect(res.html).toContain(big);
    expect(res.html).toContain("Chinese content test paragraph");
  });
});

describe("translation behaviour", () => {
  test("reorders placeholders and keeps href / code (spec example)", async () => {
    const seen: string[] = [];
    const { translator } = mock((t) => {
      seen.push(t);
      if (t.startsWith("首先")) {
        return "First, we need to register an <c2>eBPF</c2> program in <x1>kernel mode</x1>.<x3/>Then load it.";
      }
      return t;
    });
    const res = await translateDocument(fixture("chinese.html.txt"), {
      ...base,
      translator,
    });
    expect(seen).toContain(
      "首先我们需要在<x1>内核态</x1>注册一个<c2>eBPF</c2>程序。<x3/>然后加载它。",
    );
    expect(res.html).toContain(
      '<p>First, we need to register an <code>eBPF</code> program in <a href="/k" title="内核态说明">kernel mode</a>.<br>Then load it.</p>',
    );
  });

  test("uppercase mock keeps hrefs, code, images, pre and scripts", async () => {
    const upper: Fn = (t) =>
      t.replace(/<c(\d+)>[\s\S]*?<\/c\1>|<[^>]+>|[^<]+/g, (m) =>
        m.startsWith("<")
          ? m
          : m
              .replace(/&(amp|lt|gt);/g, "&$1;")
              .toUpperCase()
              .replace(/&(AMP|LT|GT);/g, (_x, e) => `&${e.toLowerCase()};`),
      );
    const { translator } = mock(upper);
    const res = await translateDocument(fixture("english.html.txt"), {
      ...base,
      translator,
    });
    expect(res.failedUnits).toBe(0);
    expect(res.html).toContain('href="https://example.com/a?x=1&amp;y=2"');
    expect(res.html).toContain("<code>foo(a &lt; b)</code>");
    expect(res.html).toContain('<img src="x.png" alt="A CHART">');
    expect(res.html).toContain("<pre>keep   this\n   as is</pre>");
    expect(res.html).toContain("var a = 1 < 2;");
    expect(res.html).toContain("<title>MY PAGE</title>");
    expect(res.html).toContain("CALL <a ");
    expect(res.html).toContain("THE FUNCTION</a>");
    expect(res.html).toContain("SECOND PARAGRAPH &amp; MORE.");
    expect(res.html).toContain("<em>DEEP <strong>TEXT</strong></em>");
  });

  test("exclusions: pre, translate=no, notranslate, hidden, plain template, script, ascii-only units on CJK page", async () => {
    const seen: string[] = [];
    const { translator } = mock((t) => {
      seen.push(t);
      return t;
    });
    await translateDocument(fixture("chinese.html.txt"), {
      ...base,
      translator,
    });
    const all = seen.join("\n");
    expect(all).not.toContain("不要翻译");
    expect(all).not.toContain("这一段也不要");
    expect(all).not.toContain("隐藏");
    expect(all).not.toContain("普通模板");
    expect(all).not.toContain("脚本里");
    expect(all).not.toContain("这是注释");
    expect(all).not.toContain("Version 2.0.1");
    expect(all).not.toContain("2024-01-01");
    // declarative shadow DOM, ruby, mixed div, title and attrs are sent
    expect(all).toContain("影子根中的文字需要翻译");
    expect(all).toContain("内核编程入门指南");
    expect(all).toContain("内核态说明");
    expect(all).toContain("一张示意图片");
    expect(all).toContain("外层的文字内容<x1>加粗部分</x1>".slice(0, 6));
    expect(all).toContain("块级段落内容在这里");
    expect(all).toContain("尾部的文字内容");
    expect(all).toMatch(
      /汉字<x1>漢<x2\/>.*<\/x1>字的注音示例。|汉字<x1>漢<x2\/><x3\/><x4\/><\/x1>字的注音示例。/,
    );
  });

  test("Latin pages send ASCII-only units too", async () => {
    const seen: string[] = [];
    const { translator } = mock((t) => (seen.push(t), t));
    await translateDocument(fixture("english.html.txt"), {
      ...base,
      translator,
    });
    expect(seen.some((s) => s.includes("Second paragraph"))).toBe(true);
  });

  test("translates mixed div runs in place and declarative shadow DOM", async () => {
    const { translator } = mock((t) =>
      t
        .replace("外层的文字内容", "Outer text")
        .replace("加粗部分", "bold part")
        .replace("块级段落内容在这里", "Block paragraph here")
        .replace("尾部的文字内容", "Trailing text")
        .replace(
          "影子根中的文字需要翻译",
          "Text inside the shadow root needs translating",
        ),
    );
    const res = await translateDocument(fixture("chinese.html.txt"), {
      ...base,
      translator,
    });
    expect(res.html).toContain(
      "<div>Outer text <b>bold part</b><p>Block paragraph here</p> Trailing text</div>",
    );
    expect(res.html).toContain(
      '<template shadowrootmode="open"><p>Text inside the shadow root needs translating</p><slot></slot></template>',
    );
    // untouched
    expect(res.html).toContain('<p translate="no">不要翻译这一段内容</p>');
    expect(res.html).toContain(
      "<pre>int main() { return 0; } // 这是注释</pre>",
    );
    expect(res.html).toContain(
      "<template><p>普通模板里的内容不翻译</p></template>",
    );
  });

  test("attributes and title are translated as plain text units", async () => {
    const { translator } = mock((t) =>
      t
        .replace("一张示意图片", "A diagram image")
        .replace("内核编程入门指南", "Kernel Programming Guide"),
    );
    const res = await translateDocument(fixture("chinese.html.txt"), {
      ...base,
      translator,
    });
    expect(res.html).toContain("<title>Kernel Programming Guide</title>");
    expect(res.html).toContain('alt="A diagram image"');
  });

  test("escapes and decodes entities", async () => {
    const html =
      "<html><head></head><body><p>价格 &lt;5 &amp; 更多内容在这里的说明文字</p></body></html>";
    const seen: string[] = [];
    const { translator } = mock(
      (t) => (
        seen.push(t),
        t
          .replace("价格", "Price")
          .replace("更多内容在这里的说明文字", "more info")
      ),
    );
    const res = await translateDocument(html, { ...base, translator });
    expect(seen[0]).toBe("价格 &lt;5 &amp; 更多内容在这里的说明文字");
    expect(res.html).toContain("<p>Price &lt;5 &amp; more info</p>");
  });

  test("progress, cancellation, size limit", async () => {
    const { translator } = mock(identity);
    const progress: [number, number][] = [];
    const res = await translateDocument(fixture("chinese.html.txt"), {
      ...base,
      translator,
      onProgress: (d, t) => void progress.push([d, t]),
    });
    expect(progress[0][0]).toBe(0);
    expect(progress.at(-1)).toEqual([res.totalUnits, res.totalUnits]);

    await expect(
      translateDocument(fixture("chinese.html.txt"), {
        ...base,
        translator,
        isCancelled: () => Promise.resolve(true),
      }),
    ).rejects.toBeInstanceOf(TranslationCancelledError);

    await expect(
      translateDocument(fixture("chinese.html.txt"), {
        ...base,
        translator,
        maxUnits: 2,
      }),
    ).rejects.toBeInstanceOf(TranslationTooLargeError);
  });

  test("isAlreadyTranslated and PROMPT_VERSION", async () => {
    expect(PROMPT_VERSION).toBe(1);
    expect(isAlreadyTranslated(fixture("chinese.html.txt"))).toBe(false);
    const { translator } = mock(identity);
    const res = await translateDocument(fixture("chinese.html.txt"), {
      ...base,
      translator,
    });
    expect(isAlreadyTranslated(res.html)).toBe(true);
  });
});

describe("validation and fallback", () => {
  const html = `<html><head></head><body>
<p>阿尔法段落<a href="/1">链接一</a>结束了。</p>
<p>贝塔段落<a href="/2">链接二</a>结束了。</p>
<p>伽马段落<a href="/3">链接三</a>结束了。</p>
<p>德尔塔段落<a href="/4">链接四</a>结束了。</p>
<p>艾普西隆段落<a href="/5">链接五</a>结束了。</p>
<p>泽塔段落<a href="/6">链接六</a>结束了。</p>
<p>正常段落<a href="/7">链接七</a>结束了。</p></body></html>`;

  test("malformed outputs keep the original unit and count failures", async () => {
    const { translator, calls } = mock((t) => {
      if (t.startsWith("阿尔法")) return "Alpha paragraph link one ends."; // missing placeholders
      if (t.startsWith("贝塔"))
        return "Beta <b>paragraph</b> <x1>link two</x1> ends here."; // extra tag
      if (t.startsWith("伽马"))
        return "Gamma <x1>paragraph </x1>link three ends</x1>."; // broken nesting
      if (t.startsWith("德尔塔")) return "   "; // empty
      if (t.startsWith("艾普西隆")) return undefined; // missing segment id
      if (t.startsWith("泽塔"))
        return "Zeta paragraph <x1>link six</x1> ends. <x1>link six</x1>"; // duplicated placeholder
      return "Normal paragraph <x1>link seven</x1> ends here.";
    });
    const res = await translateDocument(html, { ...base, translator });
    expect(res.failedUnits).toBe(6);
    expect(res.totalUnits).toBe(7);
    for (const c of [
      "阿尔法段落",
      "贝塔段落",
      "伽马段落",
      "德尔塔段落",
      "艾普西隆段落",
      "泽塔段落",
    ]) {
      expect(res.html).toContain(c);
    }
    expect(res.html).toContain(
      'Normal paragraph <a href="/7">link seven</a> ends here.',
    );
    // failed units were retried alone at temperature 0.1
    expect(
      calls.filter((c) => c.temperature === 0.1).length,
    ).toBeGreaterThanOrEqual(6);
    // result is still a valid document
    expect(() => parse(res.html)).not.toThrow();
  });

  test("a failing first attempt recovers on the temperature 0.1 retry", async () => {
    const { translator } = mock((t, temp) =>
      temp === 0.1 ? "Retried text <x1>link</x1> done." : "garbage <i>",
    );
    const res = await translateDocument(
      '<html><body><p>需要重试的段落<a href="/x">链接</a>完成。</p></body></html>',
      { ...base, translator },
    );
    expect(res.failedUnits).toBe(0);
    expect(res.html).toContain('Retried text <a href="/x">link</a> done.');
  });

  test("truncated multi-unit batches are split in halves down to single units", async () => {
    const { translator, calls } = mock((t) => t.replace(/段落/, "para"), {
      truncateAbove: 1,
    });
    const res = await translateDocument(html, { ...base, translator });
    expect(res.failedUnits).toBe(0);
    expect(calls[0].segs.length).toBe(7);
    expect(calls.some((c) => c.segs.length === 4)).toBe(true);
    expect(calls.some((c) => c.segs.length === 1)).toBe(true);
    expect(res.html).toContain("阿尔法para");
  });

  test("id mismatch splits the batch", async () => {
    let first = true;
    const translator: BatchTranslator = {
      translate(segs) {
        const segments = new Map(segs.map((s) => [s.id, s.text] as const));
        if (first && segs.length > 1) {
          first = false;
          segments.set(99, "extra");
        }
        return Promise.resolve({ segments, truncated: false });
      },
    };
    const res = await translateDocument(html, { ...base, translator });
    expect(res.failedUnits).toBe(0);
  });

  test("validateTranslation unit cases", () => {
    const input = "你好<x1>世界</x1>和<c2>foo</c2><x3/>结束";
    expect(
      validateTranslation(
        input,
        "Hello <x1>world</x1> and <c2>foo</c2><x3/>end",
      ),
    ).not.toBeNull();
    expect(
      validateTranslation(input, "Hello <x1>world</x1> and <c2>foo</c2>end"),
    ).toBeNull();
    expect(
      validateTranslation(
        input,
        "Hello <x1>world and <c2>foo</c2></x1><x3/>end",
      ),
    ).not.toBeNull();
    expect(
      validateTranslation(input, "<x3/>Hello <x1>world and <c2>bar</c2>"),
    ).toBeNull();
    expect(validateTranslation("长文本".repeat(10), "x")).toBeNull(); // ratio
    expect(validateTranslation("你好", "<script>alert(1)</script>")).toBeNull();
    expect(validateTranslation("你好", "a < b is fine")).not.toBeNull();
    expect(validateTranslation("你好", undefined)).toBeNull();
  });
});

describe("batching", () => {
  test("respects the token budget and keeps document order", async () => {
    const paras = Array.from(
      { length: 60 },
      (_, i) => `<p>这是第${i}段用于测试批处理预算的中文文本内容。</p>`,
    ).join("");
    const html = `<html><head></head><body>${paras}</body></html>`;
    const { translator, calls } = mock(identity);
    const budget = 200;
    await translateDocument(html, {
      translator,
      batchTokenBudget: budget,
      maxUnits: 1000,
    });
    expect(calls.length).toBeGreaterThan(3);
    const flat: string[] = [];
    for (const c of calls) {
      const sum = c.segs.reduce((a, s) => a + estimateTokens(s.text), 0);
      expect(sum).toBeLessThanOrEqual(budget);
      flat.push(...c.segs.map((s) => s.text));
    }
    expect(flat.length).toBe(60);
  });

  test("splitEncoded cuts only at safe sentence boundaries", () => {
    const s1 = "这是第一句话，内容比较长一些。";
    const pair = "<x1>里面有句号。还有第二句。</x1>";
    const text = `${s1}${s1}${pair}${s1}<c2>a. b. c.</c2>${s1}Hello world. Next sentence here! ${s1}`;
    const parts = splitEncoded(text, 20);
    expect(parts.length).toBeGreaterThan(2);
    for (const p of parts) {
      const opens = (p.match(/<x\d+>/g) ?? []).length;
      const closes = (p.match(/<\/x\d+>/g) ?? []).length;
      expect(opens).toBe(closes);
      const co = (p.match(/<c\d+>/g) ?? []).length;
      const cc = (p.match(/<\/c\d+>/g) ?? []).length;
      expect(co).toBe(cc);
    }
    expect(parts.join("").replace(/\s/g, "")).toBe(text.replace(/\s/g, ""));
    // no safe split point: returned whole
    const whole = `<x1>${"长".repeat(100)}。${"长".repeat(100)}</x1>`;
    expect(splitEncoded(whole, 10)).toEqual([whole]);
  });

  test("oversized units are split, translated per part and re-joined", async () => {
    const sentence = "这是一个用来测试拆分的句子，长度足够。";
    const html = `<html><head></head><body><p>${sentence.repeat(30)}<a href="/z">链接</a></p></body></html>`;
    const { translator, calls } = mock((t) =>
      t.replaceAll(sentence, "Sentence."),
    );
    const res = await translateDocument(html, {
      translator,
      batchTokenBudget: 100,
      maxUnits: 10,
    });
    expect(res.totalUnits).toBe(1);
    expect(res.failedUnits).toBe(0);
    expect(calls.length).toBeGreaterThan(1);
    const text = res.html.match(/<p>([\s\S]*)<\/p>/)![1];
    expect(text).toContain("Sentence. Sentence.");
    expect(text.endsWith('<a href="/z">链接</a>')).toBe(true);
    expect(res.html.match(/<a /g)!.length).toBe(1);
  });
});

describe("fragment mode (reader content)", () => {
  const fragment =
    '<div id="readability-page-1" class="page"><h2>内核编程入门</h2>' +
    '<p>首先我们需要在<a href="/k" title="内核态说明">内核态</a>注册一个<code>eBPF</code>程序。</p>' +
    '<pre>keep   this</pre><img src="x.png" alt="一张示意图片"></div>';

  test("identity translation round-trips byte-exact without html attrs", async () => {
    const { translator, calls } = mock(identity);
    const res = await translateDocument(fragment, {
      ...base,
      translator,
      fragment: true,
    });
    expect(calls.length).toBeGreaterThan(0);
    expect(res.failedUnits).toBe(0);
    expect(res.html).toBe(fragment);
    expect(res.html).not.toContain("data-karakeep-translation");
    expect(res.html).not.toContain("<html");
  });

  test("translates text and attributes, passes the title to the model", async () => {
    const titles: (string | undefined)[] = [];
    const translator: BatchTranslator = {
      translate(segs, o): Promise<BatchResult> {
        titles.push(o.title);
        return Promise.resolve({
          segments: new Map(
            segs.map((s) => [
              s.id,
              s.text === "内核编程入门"
                ? "Intro to kernel programming"
                : s.text === "内核态说明"
                  ? "Kernel mode note"
                  : s.text === "一张示意图片"
                    ? "A diagram"
                    : "First, we register an <c2>eBPF</c2> program in <x1>kernel mode</x1>.",
            ]),
          ),
          truncated: false,
        });
      },
    };
    const res = await translateDocument(fragment, {
      ...base,
      translator,
      fragment: true,
      title: "My Bookmark",
    });
    expect(titles.every((t) => t === "My Bookmark")).toBe(true);
    expect(res.failedUnits).toBe(0);
    expect(res.html).toContain("<h2>Intro to kernel programming</h2>");
    expect(res.html).toContain(
      '<p>First, we register an <code>eBPF</code> program in <a href="/k" title="Kernel mode note">kernel mode</a>.</p>',
    );
    expect(res.html).toContain('alt="A diagram"');
    expect(res.html).toContain("<pre>keep   this</pre>");
    expect(res.html.startsWith('<div id="readability-page-1"')).toBe(true);
  });
});
