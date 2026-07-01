import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AddSlideTemplatePicker } from "./add-slide-template-picker";
import { createDefaultTemplateRegistry } from "@/lib/presentation-vnext/theme-packages";

function findButtonByText(node: unknown, text: string): any {
  if (!isValidElement(node)) return undefined;
  const element = node as any;
  const children = element.props.children;
  const childText = Array.isArray(children)
    ? children.filter((child) => typeof child === "string").join("")
    : typeof children === "string"
      ? children
      : "";
  if (element.type === "button" && childText.includes(text)) return element;
  const childNodes = Array.isArray(children) ? children : [children];
  for (const child of childNodes) {
    const found = findButtonByText(child, text);
    if (found) return found;
  }
  return undefined;
}

describe("AddSlideTemplatePicker", () => {
  test("renders semantic template groups and layout choices in product language", () => {
    const registry = createDefaultTemplateRegistry();
    const html = renderToStaticMarkup(
      createElement(AddSlideTemplatePicker, {
        templates: registry
          .all()
          .filter((template) =>
            ["cover", "content", "comparison"].includes(template.kind),
          ),
        onChoose: () => undefined,
        onClose: () => undefined,
      }),
    );

    assert.match(html, /Add semantic slide/);
    assert.match(html, /Cover/);
    assert.match(html, /Content/);
    assert.match(html, /Compare/);
    assert.match(html, /airy · balanced/);
  });

  test("emits the chosen semantic template kind and layout", () => {
    const registry = createDefaultTemplateRegistry();
    const choices: unknown[] = [];
    const tree = AddSlideTemplatePicker({
      templates: [registry.get("content")!],
      onChoose: (choice) => choices.push(choice),
      onClose: () => undefined,
    });
    const airyButton = findButtonByText(tree, "airy · balanced");

    assert.ok(airyButton);
    airyButton.props.onClick();
    assert.deepEqual(choices, [{ kind: "content", layoutId: "content-airy" }]);
  });

  test("routes the close button to the onClose callback", () => {
    const registry = createDefaultTemplateRegistry();
    const calls: string[] = [];
    const tree = AddSlideTemplatePicker({
      templates: [registry.get("content")!],
      onChoose: () => undefined,
      onClose: () => calls.push("close"),
    });
    const closeButton = findButtonByText(tree, "Close");

    assert.ok(closeButton);
    closeButton.props.onClick();
    assert.deepEqual(calls, ["close"]);
  });
});
