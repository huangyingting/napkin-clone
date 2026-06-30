import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AddSlideTemplatePicker } from "./add-slide-template-picker";
import { createDefaultTemplateRegistry } from "@/lib/presentation-vnext/theme-packages";

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
});
