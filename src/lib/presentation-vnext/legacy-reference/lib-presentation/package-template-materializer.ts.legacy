import type { Deck, Slide, SlideTemplate } from "./deck-core";
import type {
  Paragraph,
  SlideElement,
  TableElement,
  TextElement,
  VisualElement,
} from "./deck-elements";
import { makeElementId, makeSlideId } from "./deck-ids";
import {
  applyThemePackage,
  getThemePackage,
  resolveThemePackageTemplateId,
  slideFromThemePackageTemplate,
  type ThemePackageId,
} from "./theme-packages";
import type {
  GeneratedPackageDeckPlan,
  GeneratedPackageSlidePlan,
  GeneratedSlideSlots,
  GeneratedTableSlot,
} from "@/lib/ai/package-template-deck-plan";

function paragraphsFromText(text: string): Paragraph[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => ({ text: line }));
}

function paragraphsFromBullets(items: readonly string[]): Paragraph[] {
  return items.map((text) => ({ text, listType: "bullet" as const }));
}

function setTextElement(
  element: TextElement,
  text: string,
  paragraphs: Paragraph[] = paragraphsFromText(text),
): TextElement {
  return {
    ...element,
    content: {
      kind: "text",
      text,
      paragraphs: paragraphs.length > 0 ? paragraphs : [{ text }],
      ...(element.content.fitMode ? { fitMode: element.content.fitMode } : {}),
    },
  };
}

function tableElementFromSlot(
  table: GeneratedTableSlot,
  zIndex: number,
): TableElement {
  return {
    id: makeElementId(),
    kind: "table",
    role: "table",
    box: { x: 10, y: 26, w: 80, h: table.caption ? 54 : 58 },
    zIndex,
    content: {
      kind: "table",
      header: true,
      ...(table.caption ? { caption: table.caption } : {}),
      columns: table.columns.map((label, index) => ({
        id: `col-${index + 1}`,
        label,
      })),
      rows: table.rows.map((row, rowIndex) => ({
        id: `row-${rowIndex + 1}`,
        cells: table.columns.map((_, columnIndex) => ({
          text: row[columnIndex] ?? "",
        })),
      })),
    },
  } as unknown as TableElement;
}

function fillTableElement(
  element: TableElement,
  table: GeneratedTableSlot,
): TableElement {
  return {
    ...element,
    role: "table",
    content: tableElementFromSlot(table, element.zIndex).content,
  };
}

function textForRole(
  role: string | undefined,
  slots: GeneratedSlideSlots,
): { text: string; paragraphs?: Paragraph[] } | null {
  switch (role) {
    case "title":
    case "sectionTitle":
      return { text: slots.title };
    case "subtitle":
      return slots.subtitle || slots.kicker
        ? { text: slots.subtitle ?? slots.kicker ?? "" }
        : null;
    case "quote":
      return slots.quote ? { text: slots.quote } : null;
    case "caption":
      return slots.caption ? { text: slots.caption } : null;
    case "bullet": {
      const bullets =
        slots.bullets ?? slots.leftBullets ?? slots.rightBullets ?? undefined;
      if (!bullets || bullets.length === 0) return null;
      return {
        text: bullets.join("\n"),
        paragraphs: paragraphsFromBullets(bullets),
      };
    }
    case "body":
    default: {
      const body =
        slots.body ??
        slots.leftBody ??
        slots.rightBody ??
        slots.subtitle ??
        slots.bullets?.join("\n");
      return body ? { text: body } : null;
    }
  }
}

function fillTemplateElements(
  elements: readonly SlideElement[],
  plan: GeneratedPackageSlidePlan,
): SlideElement[] {
  const slots = plan.slots;
  let titleFilled = false;
  let bodyFilled = false;
  let bulletsFilled = false;
  let tableFilled = false;
  let visualFilled = false;

  const filled: SlideElement[] = [];
  for (const element of elements) {
    if (element.kind === "visual") {
      if (!slots.visualId) continue;
      visualFilled = true;
      filled.push({
        ...element,
        content: {
          ...element.content,
          kind: "visual",
          visualId: slots.visualId,
        },
      } as VisualElement);
      continue;
    }

    if (element.kind === "table") {
      if (!slots.table) continue;
      tableFilled = true;
      filled.push(fillTableElement(element, slots.table));
      continue;
    }

    if (element.kind === "text") {
      let candidate = textForRole(element.role, slots);
      if (!candidate && !titleFilled) {
        candidate = { text: slots.title };
      } else if (!candidate && !bodyFilled && slots.body) {
        candidate = { text: slots.body };
      } else if (!candidate && !bulletsFilled && slots.bullets) {
        candidate = {
          text: slots.bullets.join("\n"),
          paragraphs: paragraphsFromBullets(slots.bullets),
        };
      }
      if (!candidate || candidate.text.trim().length === 0) continue;
      if (element.role === "title" || !titleFilled) titleFilled = true;
      if (element.role === "bullet") bulletsFilled = true;
      if (element.role !== "title" && element.role !== "sectionTitle") {
        bodyFilled = true;
      }
      filled.push(
        setTextElement(element, candidate.text, candidate.paragraphs),
      );
      continue;
    }

    filled.push(element);
  }

  let zIndex =
    filled.reduce((max, element) => Math.max(max, element.zIndex), -1) + 1;
  if (!titleFilled) {
    filled.push({
      id: makeElementId(),
      kind: "text",
      role: "title",
      box: { x: 8, y: 8, w: 84, h: 14 },
      zIndex: zIndex++,
      content: {
        kind: "text",
        text: slots.title,
        paragraphs: [{ text: slots.title }],
      },
      designOverrides: {
        textStyle: { fontSize: 6, bold: true, italic: false, align: "left" },
      },
    } as unknown as SlideElement);
  }
  if (!bodyFilled && slots.body) {
    filled.push({
      id: makeElementId(),
      kind: "text",
      role: "body",
      box: { x: 10, y: 26, w: 80, h: 28 },
      zIndex: zIndex++,
      content: {
        kind: "text",
        text: slots.body,
        paragraphs: paragraphsFromText(slots.body),
      },
      designOverrides: {
        textStyle: { fontSize: 3.4, bold: false, italic: false, align: "left" },
      },
    } as unknown as SlideElement);
  }
  if (!bulletsFilled && slots.bullets && slots.bullets.length > 0) {
    filled.push({
      id: makeElementId(),
      kind: "text",
      role: "bullet",
      box: { x: 10, y: 32, w: 80, h: 40 },
      zIndex: zIndex++,
      content: {
        kind: "text",
        text: slots.bullets.join("\n"),
        paragraphs: paragraphsFromBullets(slots.bullets),
      },
      designOverrides: {
        textStyle: { fontSize: 3.3, bold: false, italic: false, align: "left" },
      },
    } as unknown as SlideElement);
  }
  if (!tableFilled && slots.table) {
    filled.push(tableElementFromSlot(slots.table, zIndex++));
  }
  if (!visualFilled && slots.visualId) {
    filled.push({
      id: makeElementId(),
      kind: "visual",
      role: "visual",
      box: { x: 54, y: 26, w: 38, h: 54 },
      zIndex,
      content: { kind: "visual", visualId: slots.visualId },
    } as unknown as SlideElement);
  }
  return filled.map((element, index) => ({ ...element, zIndex: index }));
}

function findTemplate(
  deck: Deck,
  templateId: string,
): SlideTemplate | undefined {
  return (deck.customTemplates ?? []).find(
    (template) => template.id === templateId,
  );
}

export function materializePackageTemplateDeck({
  baseDeck,
  packageId,
  plan,
}: {
  baseDeck: Deck;
  packageId: ThemePackageId;
  plan: GeneratedPackageDeckPlan;
}): Deck | null {
  const themePackage = getThemePackage(packageId);
  if (!themePackage) return null;
  const themed = applyThemePackage({ ...baseDeck, slides: [] }, packageId);
  if (!themed) return null;

  const slides: Slide[] = plan.slides.map((slidePlan, index) => {
    const templateId = resolveThemePackageTemplateId(
      packageId,
      slidePlan.templateKind,
    );
    const template = findTemplate(themed, templateId);
    const slide = template
      ? slideFromThemePackageTemplate(template)
      : ({
          id: makeSlideId(),
          index,
          title: slidePlan.title,
          notes: "",
          elements: [],
        } as Slide);
    return {
      ...slide,
      id: makeSlideId(),
      index,
      title: slidePlan.title,
      notes: slidePlan.notes ?? "",
      templateId,
      masterId: themePackage.defaultMasterId,
      elements: fillTemplateElements(slide.elements ?? [], slidePlan),
    } as Slide;
  });

  return {
    ...themed,
    slides,
  } as Deck;
}
