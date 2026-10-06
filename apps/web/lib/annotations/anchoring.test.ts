// @vitest-environment jsdom

import { beforeEach, describe, expect, test } from "vitest";

import {
  anchor,
  buildIndex,
  describeRange,
  rangeFromPositions,
} from "./anchoring";

function setBody(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("anchoring", () => {
  test("round trip: describe a range inside one text node, anchor it, get the same positions", () => {
    const root = setBody("<p>Hello wonderful world.</p>");
    const textNode = root.querySelector("p")!.firstChild!;

    const index = buildIndex(root);
    const range = document.createRange();
    // Select "wonderful"
    range.setStart(textNode, 6);
    range.setEnd(textNode, 15);

    const selector = describeRange(index, range);
    expect(selector).not.toBeNull();
    expect(selector!.exact).toEqual("wonderful");

    const anchored = anchor(index, selector!);
    expect(anchored).not.toBeNull();
    expect(anchored!.start).toEqual(6);
    expect(anchored!.end).toEqual(15);
  });

  test("handles a range spanning several elements", () => {
    const root = setBody("<p>a<b>b</b>c</p><p>d</p>");
    const index = buildIndex(root);
    expect(index.text).toEqual("abcd");

    // Select from the start of "a" to the end of "d" (whole document).
    const range = rangeFromPositions(index, 0, 4);
    expect(range).not.toBeNull();

    const selector = describeRange(index, range!);
    expect(selector).not.toBeNull();
    expect(selector!.exact).toEqual("abcd");

    const anchored = anchor(index, selector!);
    expect(anchored).not.toBeNull();
    expect(anchored!.start).toEqual(0);
    expect(anchored!.end).toEqual(4);
  });

  test("handles a selection boundary on an element (not inside a text node)", () => {
    const root = setBody("<p>first<span>second</span></p>");
    const p = root.querySelector("p")!;
    const index = buildIndex(root);

    // Start the range at the element boundary (before any child), and end it
    // after the last child.
    const range = document.createRange();
    range.setStart(p, 0);
    range.setEnd(p, p.childNodes.length);

    const selector = describeRange(index, range);
    expect(selector).not.toBeNull();
    expect(selector!.exact).toEqual("firstsecond");
  });

  test("ignores text inside <script> and <style>", () => {
    const root = setBody(
      "<p>visible</p><script>var x = 'hidden-script';</script><style>.a { color: red; } /* hidden-style */</style>",
    );
    const index = buildIndex(root);
    expect(index.text).toEqual("visible");
  });

  test("duplicate quote: prefix/suffix context picks the right occurrence", () => {
    const root = setBody(
      "<p>The cat sat on the mat. The cat sat on the roof.</p>",
    );
    const index = buildIndex(root);

    // "The cat sat on the" appears twice; disambiguate via the suffix.
    const selector = {
      exact: "The cat sat on the",
      prefix: "",
      suffix: " roof",
      startOffset: 0,
    };

    const anchored = anchor(index, selector);
    expect(anchored).not.toBeNull();
    expect(index.text.slice(anchored!.end, anchored!.end + 5)).toEqual(" roof");
  });

  test("duplicate quote with identical context: startOffset proximity picks the right occurrence", () => {
    const root = setBody("<p>ping ping ping ping</p>");
    const index = buildIndex(root);
    // "ping" occurs at 0, 5, 10, 15. All have identical (empty) surrounding
    // context relative to the short prefix/suffix given here, so the closest
    // to startOffset should win.
    const selector = {
      exact: "ping",
      prefix: "",
      suffix: "",
      startOffset: 10,
    };

    const anchored = anchor(index, selector);
    expect(anchored).not.toBeNull();
    expect(anchored!.start).toEqual(10);
  });

  test("returns null when the quote is no longer present after a DOM change", () => {
    const root = setBody("<p>Some original text.</p>");
    const index = buildIndex(root);
    const selector = {
      exact: "text that was removed",
      prefix: "",
      suffix: "",
      startOffset: 0,
    };

    expect(anchor(index, selector)).toBeNull();
  });

  test("describeRange returns null for a whitespace-only selection", () => {
    const root = setBody("<p>word1   word2</p>");
    const textNode = root.querySelector("p")!.firstChild!;
    const index = buildIndex(root);

    const range = document.createRange();
    range.setStart(textNode, 5);
    range.setEnd(textNode, 8);

    expect(describeRange(index, range)).toBeNull();
  });

  test("does not throw for a document with zero text nodes", () => {
    const root = setBody("<div><span></span><br/></div>");
    expect(() => buildIndex(root)).not.toThrow();
    const index = buildIndex(root);
    expect(index.text).toEqual("");
    expect(
      anchor(index, {
        exact: "anything",
        prefix: "",
        suffix: "",
        startOffset: 0,
      }),
    ).toBeNull();
  });
});
