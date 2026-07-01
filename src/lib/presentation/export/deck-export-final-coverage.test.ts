import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";

import { exportDeckAsSlideImages } from "@/lib/presentation/export/deck-export-slide-images";
import type { DeckOp } from "@/lib/presentation/export/deck-export-spec";
import { deckExportTestHelpers } from "@/test/deck-export-helpers";
import {
  buildDeck,
  buildImageElement,
  buildShapeElement,
  buildSlide,
} from "@/test/builders/deck";

const exportGlobals = globalThis as typeof globalThis & {
  DOMParser?: typeof DOMParser;
  FileReader?: typeof FileReader;
  Image?: typeof Image;
  XMLSerializer?: typeof XMLSerializer;
  SVGSVGElement?: typeof SVGSVGElement;
  document?: Document;
  URL: typeof URL;
};

const originalDOMParser = exportGlobals.DOMParser;
const originalFileReader = exportGlobals.FileReader;
const originalImage = exportGlobals.Image;
const originalXMLSerializer = exportGlobals.XMLSerializer;
const originalSVGSVGElement = exportGlobals.SVGSVGElement;
const originalDocument = exportGlobals.document;
const originalCreateObjectURL = exportGlobals.URL.createObjectURL;
const originalRevokeObjectURL = exportGlobals.URL.revokeObjectURL;

afterEach(() => {
  exportGlobals.DOMParser = originalDOMParser;
  exportGlobals.FileReader = originalFileReader;
  exportGlobals.Image = originalImage;
  exportGlobals.XMLSerializer = originalXMLSerializer;
  exportGlobals.SVGSVGElement = originalSVGSVGElement;
  exportGlobals.document = originalDocument;
  exportGlobals.URL.createObjectURL = originalCreateObjectURL;
  exportGlobals.URL.revokeObjectURL = originalRevokeObjectURL;
});

function fakeSvg(
  width = 20,
  height = 10,
  viewBox = `0 0 ${width} ${height}`,
): SVGSVGElement {
  return {
    tagName: "svg",
    viewBox: { baseVal: { width, height } },
    getAttribute(name: string) {
      return name === "viewBox" ? viewBox : null;
    },
  } as unknown as SVGSVGElement;
}

function installRasterDom(svg = fakeSvg()): void {
  exportGlobals.SVGSVGElement = class {} as unknown as typeof SVGSVGElement;
  exportGlobals.DOMParser = class {
    parseFromString(): { documentElement: SVGSVGElement } {
      return { documentElement: svg };
    }
  } as unknown as typeof DOMParser;
  exportGlobals.XMLSerializer = class {
    serializeToString(): string {
      const viewBox = svg.getAttribute("viewBox") ?? "0 0 20 10";
      return `<svg viewBox="${viewBox}"><rect x="0" y="0" width="20" height="10" fill="#fff" /></svg>`;
    }
  } as unknown as typeof XMLSerializer;
  exportGlobals.document = {
    createElement: (tagName: string) => {
      assert.equal(tagName, "canvas");
      return {
        width: 0,
        height: 0,
        getContext: () => ({ scale() {}, drawImage() {} }),
        toBlob: (callback: (blob: Blob) => void) =>
          callback(new Blob(["png"], { type: "image/png" })),
      };
    },
  } as unknown as Document;
  exportGlobals.URL.createObjectURL = () => "blob:textiq-final";
  exportGlobals.URL.revokeObjectURL = () => {};
  exportGlobals.Image = class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    set src(_value: string) {
      this.onload?.();
    }
  } as unknown as typeof Image;
  exportGlobals.FileReader = class {
    result: string | ArrayBuffer | null = null;
    onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
    onloadend: (() => void) | null = null;

    readAsDataURL(_blob: Blob): void {
      this.result = "data:image/png;base64,ZmFrZQ==";
      this.onload?.({ target: this } as unknown as ProgressEvent<FileReader>);
      this.onloadend?.();
    }

    readAsArrayBuffer(blob: Blob): void {
      void blob.arrayBuffer().then((buffer) => {
        this.result = buffer;
        this.onload?.({ target: this } as unknown as ProgressEvent<FileReader>);
        this.onloadend?.();
      });
    }
  } as unknown as typeof FileReader;
}

function recordingSlide() {
  const textCalls: Array<{ text: unknown; options: Record<string, unknown> }> =
    [];
  const shapeCalls: Array<{
    shape: unknown;
    options: Record<string, unknown>;
  }> = [];
  const imageCalls: Array<Record<string, unknown>> = [];
  const slide = {
    addText(text: unknown, options: Record<string, unknown>) {
      textCalls.push({ text, options });
    },
    addShape(shape: unknown, options: Record<string, unknown>) {
      shapeCalls.push({ shape, options });
    },
    addImage(options: Record<string, unknown>) {
      imageCalls.push(options);
    },
  } as Parameters<typeof deckExportTestHelpers.applyDeckOp>[0];
  return { slide, textCalls, shapeCalls, imageCalls };
}

describe("deck export final coverage", () => {
  test("PPTX dispatch rasterizes styled shapes and transformed visual fallbacks", async () => {
    installRasterDom(fakeSvg(40, 20));
    const { slide, imageCalls } = recordingSlide();

    const styledShapes: DeckOp[] = [
      {
        kind: "shape",
        shape: "ellipse",
        x: 1,
        y: 1,
        w: 2,
        h: 1,
        color: "112233",
        fill: {
          type: "radialGradient",
          inner: "ffffff",
          outer: "112233",
          stops: [
            { color: "ffffff", offset: 0 },
            { color: "112233", offset: 100 },
          ],
        },
        effect: { kind: "blur", radius: 0.5 },
        text: "Blurred & <escaped>",
        textColor: "ffffff",
        rotation: 15,
        shadow: true,
      },
      {
        kind: "shape",
        shape: "square",
        x: 1,
        y: 2,
        w: 1,
        h: 2,
        color: "abc",
        fill: "abc",
        effect: { kind: "glass", intensity: "strong" },
        radius: 0.1,
      },
      {
        kind: "shape",
        shape: "circle",
        x: 2,
        y: 2,
        w: 1,
        h: 1,
        color: "112233",
        fill: { type: "linearGradient", from: "112233", to: "445566" },
        effect: { kind: "glass", intensity: "light" },
      },
      {
        kind: "shape",
        shape: "diamond",
        x: 3,
        y: 2,
        w: 1,
        h: 1,
        color: "112233",
        fill: { type: "radialGradient", inner: "ffffff", outer: "112233" },
        effect: { kind: "glass", intensity: "medium" },
      },
      {
        kind: "shape",
        shape: "line",
        x: 0,
        y: 0,
        w: 3,
        h: 1,
        color: "112233",
        effect: { kind: "blur", radius: 0.2 },
      },
    ];

    for (const op of styledShapes) {
      await deckExportTestHelpers.applyDeckOp(slide, op, () => null);
    }

    await deckExportTestHelpers.applyDeckOp(
      slide,
      {
        kind: "image",
        src: "https://cdn.example.test/cropped.png",
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        fitMode: "none",
        maskShape: "diamond",
        crop: { top: 0.2, right: 0.1, bottom: 0.1, left: 0.2 },
        radius: 0.2,
        alt: "Raster image",
        rotation: 5,
        shadow: true,
      },
      () => null,
    );

    await deckExportTestHelpers.applyDeckOp(
      slide,
      {
        kind: "visual-fallback",
        visualId: "visual-1",
        x: 0,
        y: 0,
        w: 4,
        h: 4,
        rotation: 30,
        shadow: true,
        opacity: 0.4,
      } as DeckOp,
      () => fakeSvg(20, 10),
    );

    assert.equal(imageCalls.length, 7);
    assert.equal(imageCalls[0]?.data, "data:image/png;base64,ZmFrZQ==");
    assert.equal(imageCalls[0]?.rotate, 15);
    assert.equal(imageCalls[5]?.altText, "Raster image");
    assert.equal(imageCalls[6]?.x, 0);
    assert.equal(imageCalls[6]?.y, 1);
    assert.equal(imageCalls[6]?.w, 4);
    assert.equal(imageCalls[6]?.h, 2);
    assert.equal(imageCalls[6]?.transparency, 60);
  });

  test("PPTX visual fallback ignores missing and zero-sized SVGs", async () => {
    installRasterDom(fakeSvg(0, 0));
    const { slide, imageCalls } = recordingSlide();
    const op = {
      kind: "visual-fallback",
      visualId: "visual-empty",
      x: 0,
      y: 0,
      w: 4,
      h: 4,
    } as DeckOp;

    await deckExportTestHelpers.applyDeckOp(slide, op, () => null);
    await deckExportTestHelpers.applyDeckOp(slide, op, () => fakeSvg(0, 10));

    assert.equal(imageCalls.length, 0);
  });

  test("slide image export writes rich SVG and raster PNG zip entries", async () => {
    installRasterDom(fakeSvg(1200, 675, "0 0 1200 675"));
    const deck = buildDeck({
      slides: [
        buildSlide({
          id: "slide-export-final",
          index: 0,
          title: "Export final",
          designOverrides: {
            background: {
              type: "image",
              url: "https://cdn.example.test/background.png",
            },
          },
          elements: [
            buildShapeElement({
              id: "glass-triangle",
              shape: "triangle",
              text: "Triangle",
              box: { x: 5, y: 5, w: 20, h: 20 },
              designOverrides: {
                fill: {
                  type: "linearGradient",
                  from: { value: "#112233" },
                  to: { value: "#445566" },
                  angle: 30,
                  stops: [
                    { color: { value: "#112233" }, offset: 0 },
                    { color: { value: "#445566" }, offset: 100 },
                  ],
                },
                effect: { kind: "glass", intensity: "light" },
              },
            }),
            buildImageElement({
              id: "rounded-image",
              src: "https://cdn.example.test/image.png",
              alt: "Rounded",
              maskShape: "rounded",
              radius: 8,
              fitMode: "cover",
              opacity: 0.8,
              shadow: true,
              box: { x: 40, y: 10, w: 30, h: 25 },
            }),
            buildImageElement({
              id: "circle-image",
              src: "data:image/png;base64,AAAA",
              maskShape: "circle",
              fitMode: "contain",
              box: { x: 72, y: 10, w: 20, h: 20 },
            }),
          ],
        }),
      ],
    });

    const [{ default: JSZip }, svgBlob, pngBlob] = await Promise.all([
      import("jszip"),
      exportDeckAsSlideImages(deck, new Map(), () => null),
      exportDeckAsSlideImages(deck, new Map(), () => null, {
        format: "png",
        scale: 2,
      }),
    ]);

    assert.ok(svgBlob);
    assert.ok(pngBlob);
    const svgZip = await JSZip.loadAsync(await svgBlob!.arrayBuffer());
    const svg = await svgZip.file("slide-01.svg")!.async("string");
    assert.match(svg, /background\.png/);
    assert.match(svg, /foreignObject/);
    assert.match(svg, /clipPath/);
    assert.match(svg, /xMidYMid slice/);

    const pngZip = await JSZip.loadAsync(await pngBlob!.arrayBuffer());
    const png = await pngZip.file("slide-01.png")!.async("uint8array");
    assert.ok(png.byteLength > 0);
  });
});
