import type { DefaultTreeAdapterMap } from "parse5";
import { defaultTreeAdapter as adapter } from "parse5";

export type Node = DefaultTreeAdapterMap["node"];
export type ChildNode = DefaultTreeAdapterMap["childNode"];
export type ParentNode = DefaultTreeAdapterMap["parentNode"];
export type Element = DefaultTreeAdapterMap["element"];
export type Template = DefaultTreeAdapterMap["template"];
export type TextNode = DefaultTreeAdapterMap["textNode"];
export type Document = DefaultTreeAdapterMap["document"];

export { adapter };

export function isElement(n: Node): n is Element {
  return "tagName" in n;
}

export function isText(n: Node): n is TextNode {
  return n.nodeName === "#text";
}

export function isTemplate(el: Element): el is Template {
  return el.tagName === "template" && "content" in el;
}

export function getAttr(el: Element, name: string): string | undefined {
  return el.attrs.find((a) => a.name === name)?.value;
}

export function hasAttr(el: Element, name: string): boolean {
  return el.attrs.some((a) => a.name === name);
}

export function setAttr(el: Element, name: string, value: string): void {
  const a = el.attrs.find((x) => x.name === name);
  if (a) a.value = value;
  else el.attrs.push({ name, value });
}

/** Declarative shadow root: <template shadowrootmode|shadowroot=...>. */
export function isDeclarativeShadowRoot(el: Element): el is Template {
  return (
    isTemplate(el) &&
    (hasAttr(el, "shadowrootmode") || hasAttr(el, "shadowroot"))
  );
}

export function shallowClone(el: Element): Element {
  const clone = adapter.createElement(
    el.tagName,
    el.namespaceURI,
    el.attrs.map((a) => ({ ...a })),
  );
  if (isTemplate(el)) {
    adapter.setTemplateContent(
      clone as Template,
      adapter.createDocumentFragment(),
    );
  }
  return clone;
}

export function deepClone(node: ChildNode): ChildNode {
  if (isText(node)) return adapter.createTextNode(node.value);
  if (adapter.isCommentNode(node)) {
    return adapter.createCommentNode(node.data);
  }
  if (isElement(node)) {
    const clone = shallowClone(node);
    if (isTemplate(node)) {
      const content = adapter.getTemplateContent(node);
      const target = adapter.getTemplateContent(clone as Template);
      for (const c of content.childNodes) {
        adapter.appendChild(target, deepClone(c));
      }
    }
    for (const c of node.childNodes) {
      adapter.appendChild(clone, deepClone(c));
    }
    return clone;
  }
  // doctype etc. never appear in runs
  return node;
}

export function textContent(node: ChildNode): string {
  if (isText(node)) return node.value;
  if (isElement(node)) {
    return node.childNodes.map((c) => textContent(c)).join("");
  }
  return "";
}
