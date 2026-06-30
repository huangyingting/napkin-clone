import type { Deck } from "@/lib/presentation/deck";
import type { Visual } from "@/lib/visual/schema";
import {
  buildBulletsElement,
  buildDeck,
  buildImageElement,
  buildSlide,
  buildTextElement,
} from "./deck";
import { fixtureAssetChecksum, fixturePngBuffer } from "./assets";
import {
  buildEditorState,
  buildParagraphNode,
  buildVisualLexicalNode,
  type SerializedFixtureEditorState,
} from "./lexical";
import { buildVisual, buildVisualEdge, buildVisualNode } from "./visual";

export {
  FIXTURE_PNG_BASE64,
  fixtureAssetChecksum,
  fixturePngBuffer,
} from "./assets";

export const E2E_PROFILE_FIXTURE = {
  owner: {
    email: process.env.E2E_USER_EMAIL ?? "e2e-owner@textiq.test",
    password: process.env.E2E_USER_PASSWORD ?? "e2e-owner-pw-2026",
    name: "E2E Owner",
  },
  viewer: {
    email: process.env.E2E_VIEWER_EMAIL ?? "e2e-viewer@textiq.test",
    password: process.env.E2E_VIEWER_PASSWORD ?? "e2e-viewer-pw-2026",
    name: "E2E Viewer",
  },
  workspaceId: "e2efixtureworkspace0000001",
  documentId: "e2efixturedocument0000001",
  privateDocumentId: "e2efixtureprivatedoc00001",
  visualId: "e2efixturevisual000000001",
  shareId: "e2efixtureshare01",
  slug: "e2e-fixture-deck",
  slideTitleText: "Release Gate Fixture Slide",
  slideTwoTitleText: "Release Gate Fixture Follow-up",
  slideBodyText: "Deterministic deck for the E2E release gate.",
  documentBodyText: "E2E fixture document body for the release gate profile.",
  documentTitle: "E2E Fixture Deck",
  dashboardTag: {
    name: "release-gate",
    slug: "release-gate",
  },
  dashboardDocuments: {
    alphaFavorite: {
      title: "Alpha favorite deterministic dashboard",
    },
    betaTagged: {
      title: "Beta tagged deterministic dashboard",
    },
  },
} as const;

const F = E2E_PROFILE_FIXTURE;

export function buildE2EProfileVisual(): Visual {
  return buildVisual({
    title: "E2E profile flow",
    width: 700,
    height: 420,
    nodes: [
      buildVisualNode({
        id: "profile-start",
        label: "Seed profile",
        x: 160,
        y: 120,
        icon: "Flag",
      }),
      buildVisualNode({
        id: "profile-deck",
        label: "Open deck",
        x: 360,
        y: 120,
        icon: "Presentation",
      }),
      buildVisualNode({
        id: "profile-export",
        label: "Verify asset",
        x: 560,
        y: 120,
        icon: "Image",
      }),
    ],
    edges: [
      buildVisualEdge({
        id: "profile-e1",
        from: "profile-start",
        to: "profile-deck",
      }),
      buildVisualEdge({
        id: "profile-e2",
        from: "profile-deck",
        to: "profile-export",
      }),
    ],
  });
}

export function buildE2EProfileContentJson(
  visual: Visual = buildE2EProfileVisual(),
): SerializedFixtureEditorState {
  return buildEditorState([
    buildParagraphNode(F.documentBodyText),
    buildVisualLexicalNode(F.visualId, visual),
  ]);
}

export function buildE2EProfileDeck(assetUrl: string, assetId: string): Deck {
  return buildDeck({
    design: { themeId: "default" },
    slides: [
      buildSlide({
        id: "e2e-fixture-slide-1",
        title: F.slideTitleText,
        notes: "",
        designOverrides: {
          background: { type: "solid", color: { value: "#ffffff" } },
        },
        elements: [
          buildTextElement({
            id: "fixture-title",
            role: "title",
            text: F.slideTitleText,
            box: { x: 6, y: 6, w: 88, h: 14 },
            zIndex: 0,
            style: { fontSize: 6, bold: true, italic: false, align: "left" },
          }),
          buildBulletsElement({
            id: "fixture-bullets",
            bullets: [F.slideBodyText, "Second deterministic point"],
            items: [
              { text: F.slideBodyText },
              { text: "Second deterministic point" },
            ],
            box: { x: 8, y: 26, w: 56, h: 50 },
            zIndex: 1,
            style: { fontSize: 4, bold: false, italic: false, align: "left" },
          }),
          buildImageElement({
            id: "fixture-image",
            src: assetUrl,
            assetId,
            alt: "Seeded fixture image",
            fitMode: "contain",
            box: { x: 68, y: 26, w: 26, h: 26 },
            zIndex: 2,
          }),
        ],
      }),
      buildSlide({
        id: "e2e-fixture-slide-2",
        title: F.slideTwoTitleText,
        notes: "",
        designOverrides: {
          background: { type: "solid", color: { value: "#ffffff" } },
        },
        elements: [
          buildTextElement({
            id: "fixture-second-title",
            role: "title",
            text: F.slideTwoTitleText,
            box: { x: 6, y: 6, w: 88, h: 14 },
            zIndex: 0,
            style: { fontSize: 6, bold: true, italic: false, align: "left" },
          }),
          buildBulletsElement({
            id: "fixture-second-bullets",
            bullets: ["Second seeded slide for navigation coverage."],
            items: [{ text: "Second seeded slide for navigation coverage." }],
            box: { x: 8, y: 26, w: 80, h: 50 },
            zIndex: 1,
            style: { fontSize: 4, bold: false, italic: false, align: "left" },
          }),
        ],
      }),
    ],
  });
}

export function buildE2EProfileFixtureDescriptor(opts: {
  assetId: string;
  assetPath: string;
  privateAssetPath: string;
  seededAt: string;
}) {
  return {
    owner: { email: F.owner.email, password: F.owner.password },
    viewer: { email: F.viewer.email, password: F.viewer.password },
    documentId: F.documentId,
    documentPath: `/app/documents/${F.documentId}`,
    shareId: F.shareId,
    slug: F.slug,
    presentPath: `/present/${F.slug}-${F.shareId}`,
    embedPath: `/embed/${F.slug}-${F.shareId}`,
    assetId: opts.assetId,
    assetPath: opts.assetPath,
    privateDocumentId: F.privateDocumentId,
    privateAssetPath: opts.privateAssetPath,
    slideTitleText: F.slideTitleText,
    slideTwoTitleText: F.slideTwoTitleText,
    seededAt: opts.seededAt,
  };
}

export function e2eProfileAssetChecksum(): string {
  return fixtureAssetChecksum(fixturePngBuffer());
}
