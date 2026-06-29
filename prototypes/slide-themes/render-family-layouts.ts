/**
 * Per-render-family layout builders.
 *
 * Each render family gets its own distinct, theme-parameterized
 * layout: varied background treatments (gradients vs. fields vs. framed),
 * different decorative shape signatures, mixed heading/body font pairing, and
 * purpose-fit content geometry. The themes differ by palette, fonts, corner
 * radius, and decorative colors, so a single builder set yields professional,
 * non-repetitive layouts across every package while staying schema-valid
 * (`text`/`shape`/`image` only).
 */

import {
  type BackgroundTreatment,
  type Box,
  type ThemeSpec,
  glassPanel,
  image,
  kicker,
  linearFill,
  motif,
  radialFill,
  radialOrb,
  shape,
  slide,
  text,
  token,
  visualLanguage,
} from "./theme-kit";
import type { ThemePackageRenderFamily } from "@/lib/presentation/theme-template-taxonomy";

type Bg = BackgroundTreatment;

function bullets(items: string[]) {
  return items.map((t) => ({ text: t, listType: "bullet" as const }));
}

let activeSpec: ThemeSpec | null = null;

/** Soft accent gradient over the slide bg — the "lit" treatment. */
function tint(spec: ThemeSpec): Bg {
  const lang = visualLanguage(spec);
  if (lang.backgroundMode === "radial") {
    return {
      type: "radialGradient",
      inner: token("surface"),
      outer: token("slideBg"),
      cx: 72,
      cy: 18,
      r: 78,
    };
  }
  if (lang.backgroundMode === "field") {
    return {
      type: "gradient",
      from: spec.palette.slideBg,
      to: spec.palette.deco[1] ?? spec.palette.surface,
      angle: 135,
    };
  }
  return {
    type: "gradient",
    from: spec.palette.slideBg,
    to: spec.palette.surface,
    angle: 155,
  };
}

function darkField(spec: ThemeSpec): Bg {
  return { type: "solid", color: spec.palette.slideBg };
}

function accentField(spec: ThemeSpec): Bg {
  return { type: "solid", color: spec.palette.accent };
}

/** Bold accent-into-dark gradient for hero covers. */
function hero(spec: ThemeSpec): Bg {
  if (visualLanguage(spec).backgroundMode === "radial") {
    return {
      type: "radialGradient",
      inner: spec.palette.deco[0] ?? spec.palette.accent,
      outer: spec.palette.slideBg,
      cx: 70,
      cy: 28,
      r: 88,
    };
  }
  return {
    type: "gradient",
    from: spec.palette.deco[0] ?? spec.palette.accent,
    to: spec.palette.slideBg,
    angle: 140,
  };
}

/** A decorative organic/geometric orb whose form follows the theme radius. */
function orb(z: number, box: Box, color: string, opacity = 0.16) {
  return radialOrb({
    zIndex: z,
    box,
    inner: color,
    outer: color,
    opacity,
    shape: "ellipse",
    locked: true,
    name: "Orb",
  });
}

function bar(z: number, box: Box, color: string) {
  const spec = activeSpec;
  const grad = spec
    ? linearFill(spec.palette.accent, spec.palette.deco[0] ?? color, 90)
    : color;
  return shape({
    zIndex: z,
    shape: "rect",
    box,
    fill: grad,
    radius: 50,
    locked: true,
    name: "Accent bar",
  });
}

function panel(z: number, box: Box, color: string, radius: number) {
  const lang = activeSpec ? visualLanguage(activeSpec) : null;
  const panelRadius = lang?.card.radius ?? radius;
  return lang?.card.fill === "glass"
    ? glassPanel({
        zIndex: z,
        box,
        fill: radialFill({ value: color }, token("slideBg"), {
          cx: 35,
          cy: 20,
          r: 78,
        }),
        radius: panelRadius,
        stroke: lang.card.stroke
          ? { color: lang.surface === "glass" ? "#ffffff" : color, width: 0.18 }
          : undefined,
        intensity: lang.surface === "glass" ? "medium" : "light",
        locked: true,
        name: "Panel",
      })
    : shape({
        zIndex: z,
        shape: "rect",
        box,
        fill: color,
        radius: panelRadius,
        locked: true,
        name: "Panel",
      });
}

function H(spec: ThemeSpec, box: Box, txt: string, size = 6, color?: string) {
  return text({
    zIndex: 10,
    box,
    role: "title",
    text: txt,
    style: {
      fontSize: size,
      color: color ?? spec.palette.onBg,
      fontId: spec.fonts.heading,
      bold: true,
      align: "left",
      lineHeight: 1.04,
    },
  });
}

function Sub(spec: ThemeSpec, box: Box, txt: string, color?: string) {
  return text({
    zIndex: 11,
    box,
    role: "subtitle",
    text: txt,
    style: {
      fontSize: 3.2,
      color: color ?? spec.palette.muted,
      fontId: spec.fonts.body,
      align: "left",
      lineHeight: 1.35,
    },
  });
}

function Body(spec: ThemeSpec, box: Box, txt: string, color?: string) {
  return text({
    zIndex: 11,
    box,
    role: "body",
    text: txt,
    style: {
      fontSize: 3.2,
      color: color ?? spec.palette.onSurface,
      fontId: spec.fonts.body,
      align: "left",
      lineHeight: 1.5,
    },
  });
}

function List(spec: ThemeSpec, box: Box, items: string[], color?: string) {
  return text({
    zIndex: 11,
    box,
    role: "bullet",
    paragraphs: bullets(items),
    style: {
      fontSize: 3.1,
      color: color ?? spec.palette.onSurface,
      fontId: spec.fonts.body,
      align: "left",
      lineHeight: 1.55,
      paragraphSpacing: 1.7,
    },
  });
}

function Label(spec: ThemeSpec, box: Box, txt: string, color?: string) {
  return text({
    zIndex: 12,
    box,
    role: "label",
    text: txt,
    style: {
      fontSize: 2.5,
      color: color ?? spec.palette.accent,
      fontId: spec.fonts.heading,
      bold: true,
      align: "left",
    },
  });
}

function card(
  spec: ThemeSpec,
  x: number,
  label: string,
  lines: string[],
  w = 27,
  accentTop = false,
) {
  const p = spec.palette;
  const els = [
    panel(8, { x, y: 30, w, h: 50 }, p.surface, spec.cornerRadiusPt + 4),
    Label(spec, { x: x + 2.5, y: 34, w: w - 5, h: 6 }, label),
    List(spec, { x: x + 2.5, y: 41, w: w - 5, h: 36 }, lines),
  ];
  if (accentTop)
    els.unshift(
      shape({
        zIndex: 9,
        shape: "rect",
        box: { x, y: 30, w, h: 1.4 },
        fill: p.accent,
        locked: true,
        name: "Edge",
      }),
    );
  return els;
}

const T = (spec: ThemeSpec, kind: string) => `theme:${spec.id}:${kind}`;
type Builder = (spec: ThemeSpec) => { els: Record<string, unknown>[]; bg?: Bg };

function variantIndex(kind: string): number {
  return [...kind].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4;
}

function familyChrome(
  spec: ThemeSpec,
  family: ThemePackageRenderFamily,
  kind: string,
): Record<string, unknown>[] {
  const lang = visualLanguage(spec);
  const p = spec.palette;
  const variant = variantIndex(kind);
  const primary = p.deco[0] ?? p.accent;
  const secondary = p.deco[1] ?? p.surface;
  const quiet = p.deco[2] ?? p.muted;

  const corner = variant % 2 === 0 ? -18 : 72;
  const heroOrb = radialOrb({
    zIndex: 1,
    box: { x: corner, y: variant < 2 ? -24 : 58, w: 52, h: 76 },
    inner: secondary,
    outer: secondary,
    opacity: lang.surface === "glass" ? 0.45 : 0.2,
    shape: "ellipse",
    name: `${family} glow`,
  });
  const accentMotif = motif({
    zIndex: 2,
    shape: lang.motifShapes.accent,
    box: {
      x: variant % 2 === 0 ? 84 : 5,
      y: variant < 2 ? 12 : 72,
      w: 8,
      h: 14,
    },
    fill: radialFill(primary, token("slideBg"), { cx: 42, cy: 34, r: 72 }),
    opacity: 0.42,
    rotation: variant * 18 - 18,
    name: `${family} motif`,
  });
  const secondaryMotif = motif({
    zIndex: 2,
    shape: lang.motifShapes.secondary,
    box: {
      x: variant % 2 === 0 ? 4 : 88,
      y: variant < 2 ? 78 : 8,
      w: 6,
      h: 11,
    },
    fill: secondary,
    opacity: 0.22,
    rotation: variant * -14,
    name: `${family} secondary motif`,
  });

  if (
    ["cover", "section-divider", "quote-hero", "stat-hero", "closing"].includes(
      family,
    )
  ) {
    return [heroOrb, accentMotif, secondaryMotif];
  }

  if (["two-column", "matrix-2x2"].includes(family)) {
    return [
      heroOrb,
      secondaryMotif,
      motif({
        zIndex: 2,
        shape: lang.motifShapes.primary,
        box: { x: 46, y: 43, w: 8, h: 14 },
        fill: primary,
        opacity: 0.18,
        rotation: 45,
        name: `${family} center motif`,
      }),
    ];
  }

  if (["team-grid", "pricing-cards", "metric-row"].includes(family)) {
    return [heroOrb, accentMotif, secondaryMotif];
  }

  if (
    [
      "process-steps",
      "timeline",
      "roadmap",
      "framework-diagram",
      "architecture-diagram",
    ].includes(family)
  ) {
    return [
      shape({
        zIndex: 1,
        shape: "rect",
        box: { x: 8, y: 86, w: 84, h: 0.35 },
        fill: quiet,
        opacity: 0.35,
        locked: true,
        name: `${family} baseline`,
      }),
      accentMotif,
      secondaryMotif,
    ];
  }

  return [heroOrb, secondaryMotif];
}

const L: Partial<Record<ThemePackageRenderFamily, Builder>> = {
  cover: (s) => ({
    bg: hero(s),
    els: [
      orb(
        1,
        { x: 38, y: -24, w: 64, h: 92 },
        s.palette.deco[1] ?? s.palette.accent,
        0.85,
      ),
      orb(
        2,
        { x: 52, y: 18, w: 52, h: 70 },
        s.palette.deco[0] ?? s.palette.accent,
        0.8,
      ),
      bar(3, { x: 8, y: 31, w: 2, h: 24 }, s.palette.accent),
      kicker(
        9,
        { x: 11, y: 26, w: 50, h: 5 },
        "PRESENTATION · 2026",
        "#ffffff",
        s.fonts.heading,
      ),
      H(
        s,
        { x: 10.5, y: 33, w: 78, h: 30 },
        "A clear, confident\nopening",
        11,
        "#ffffff",
      ),
      Sub(
        s,
        { x: 11, y: 66, w: 56, h: 10 },
        "Set the scene with one strong promise.",
        "#ffffffcc",
      ),
      glassPanel({
        zIndex: 9,
        box: { x: 11, y: 82, w: 22, h: 9 },
        fill: { value: "#ffffff" },
        radius: 50,
        intensity: "light",
        name: "CTA chip",
      }),
      kicker(
        10,
        { x: 14, y: 82.5, w: 18, h: 8 },
        "STUDIO · 2026",
        "#ffffff",
        s.fonts.heading,
      ),
    ],
  }),
  "section-divider": (s) => ({
    bg: accentField(s),
    els: [
      orb(2, { x: -14, y: 40, w: 58, h: 80 }, "#ffffff", 0.12),
      text({
        zIndex: 10,
        box: { x: 9, y: 24, w: 30, h: 20 },
        text: "01",
        style: {
          fontSize: 17,
          color: "#ffffff",
          fontId: s.fonts.heading,
          bold: true,
          align: "left",
        },
        opacity: 0.45,
      }),
      H(s, { x: 9, y: 50, w: 78, h: 18 }, "A new section", 9, "#ffffff"),
    ],
  }),
  agenda: (s) => ({
    bg: tint(s),
    els: [
      H(s, { x: 8, y: 12, w: 60, h: 9 }, "Agenda", 6),
      ...[
        "Where we are",
        "What we found",
        "What we recommend",
        "What happens next",
      ].flatMap((t, i) => [
        panel(
          8,
          { x: 8, y: 28 + i * 15, w: 84, h: 11 },
          s.palette.surface,
          s.cornerRadiusPt + 2,
        ),
        Label(s, { x: 11, y: 30.5 + i * 15, w: 6, h: 6 }, `0${i + 1}`),
        Body(s, { x: 18, y: 30.5 + i * 15, w: 70, h: 7 }, t),
      ]),
    ],
  }),
  "summary-list": (s) => ({
    bg: tint(s),
    els: [
      kicker(
        9,
        { x: 8, y: 12, w: 40, h: 5 },
        "EXECUTIVE SUMMARY",
        s.palette.accent,
        s.fonts.heading,
      ),
      H(s, { x: 8, y: 18, w: 80, h: 9 }, "The bottom line", 5.6),
      List(s, { x: 8, y: 32, w: 84, h: 52 }, [
        "Demand is strong; focus is the constraint.",
        "Two levers recover most of the upside.",
        "Ship the core path now, defer exploration.",
        "Decision needed: scope and owner model.",
      ]),
    ],
  }),
  "title-bullets": (s) => ({
    bg: tint(s),
    els: [
      bar(9, { x: 8, y: 17, w: 1.4, h: 12 }, s.palette.accent),
      H(s, { x: 11, y: 16, w: 60, h: 12 }, "Three forces converging", 5.6),
      List(s, { x: 11, y: 33, w: 46, h: 50 }, [
        "Cost has dropped enough to be ambient.",
        "Teams expect tooling that adapts to them.",
        "The winning interface disappears.",
      ]),
      panel(
        8,
        { x: 58, y: 30, w: 34, h: 52 },
        s.palette.surface,
        s.cornerRadiusPt + 6,
      ),
      image({
        zIndex: 9,
        box: { x: 61, y: 34, w: 28, h: 44 },
        radius: s.cornerRadiusPt + 2,
        fitMode: "cover",
      }),
    ],
  }),
  "title-body": (s) => ({
    bg: tint(s),
    els: [
      H(s, { x: 8, y: 13, w: 78, h: 12 }, "Detailed context", 5.6),
      Sub(
        s,
        { x: 8, y: 27, w: 68, h: 7 },
        "A dense narrative slide for the explanation that needs room.",
      ),
      panel(
        8,
        { x: 7, y: 38, w: 86, h: 44 },
        s.palette.surface,
        s.cornerRadiusPt + 5,
      ),
      Body(
        s,
        { x: 11, y: 43, w: 78, h: 32 },
        "Use this layout when the deck needs a real explanatory paragraph: background, requirements, analysis, caveats, or a compact narrative that should not be forced into bullets. The text area is intentionally broad and calm so dense content remains readable.",
      ),
      bar(9, { x: 11, y: 80, w: 18, h: 0.8 }, s.palette.accent),
    ],
  }),
  "visual-focus": (s) => ({
    bg: darkField(s),
    els: [
      image({
        zIndex: 1,
        box: { x: 0, y: 0, w: 100, h: 100 },
        fitMode: "cover",
      }),
      panel(
        8,
        { x: 8, y: 64, w: 50, h: 24 },
        s.palette.accent,
        s.cornerRadiusPt,
      ),
      H(
        s,
        { x: 11, y: 68, w: 44, h: 12 },
        "One image, full focus",
        5,
        "#ffffff",
      ),
    ],
  }),
  "quote-hero": (s) => ({
    bg: tint(s),
    els: [
      text({
        zIndex: 9,
        box: { x: 6, y: 6, w: 30, h: 30 },
        text: "\u201c",
        style: {
          fontSize: 30,
          color: s.palette.accent,
          fontId: s.fonts.heading,
          bold: true,
          align: "left",
        },
      }),
      text({
        zIndex: 10,
        box: { x: 14, y: 30, w: 72, h: 34 },
        role: "quote",
        text: "Taste is attention, paid consistently, until it looks effortless.",
        style: {
          fontSize: 6.2,
          color: s.palette.onBg,
          fontId: s.fonts.heading,
          italic: true,
          align: "left",
          lineHeight: 1.2,
        },
      }),
      bar(9, { x: 14, y: 68, w: 10, h: 0.8 }, s.palette.accent),
      Sub(s, { x: 14, y: 71, w: 50, h: 6 }, "— Director of Design"),
    ],
  }),
  "stat-hero": (s) => ({
    bg: hero(s),
    els: [
      orb(
        1,
        { x: 56, y: 16, w: 60, h: 86 },
        s.palette.deco[1] ?? s.palette.accent,
        0.3,
      ),
      kicker(
        9,
        { x: 9, y: 22, w: 40, h: 5 },
        "HEADLINE",
        "#ffffff",
        s.fonts.heading,
      ),
      text({
        zIndex: 10,
        box: { x: 8, y: 28, w: 80, h: 38 },
        text: "4.8\u00d7",
        style: {
          fontSize: 30,
          color: "#ffffff",
          fontId: s.fonts.heading,
          bold: true,
          align: "left",
        },
      }),
      Sub(
        s,
        { x: 9, y: 70, w: 60, h: 12 },
        "faster from idea to shipped, across pilot teams.",
        "#ffffffcc",
      ),
    ],
  }),
  "metric-row": (s) => ({
    bg: tint(s),
    els: [
      H(s, { x: 8, y: 12, w: 70, h: 9 }, "By the numbers", 5.4),
      ...[0, 1, 2].flatMap((i) => [
        panel(
          8,
          { x: 8 + i * 29, y: 30, w: 26, h: 46 },
          s.palette.surface,
          s.cornerRadiusPt + 4,
        ),
        text({
          zIndex: 10,
          box: { x: 10 + i * 29, y: 36, w: 22, h: 12 },
          text: ["86%", "3.2\u00d7", "$2.4M"][i],
          style: {
            fontSize: 8,
            color: s.palette.accent,
            fontId: s.fonts.heading,
            bold: true,
            align: "left",
          },
        }),
        Sub(
          s,
          { x: 10 + i * 29, y: 52, w: 22, h: 18 },
          ["owners assigned", "cycle speedup", "new ARR"][i],
          s.palette.onSurface,
        ),
      ]),
    ],
  }),
  "data-insight": (s) => ({
    bg: tint(s),
    els: [
      H(s, { x: 8, y: 12, w: 56, h: 9 }, "The signal", 5.4),
      List(s, { x: 8, y: 30, w: 40, h: 50 }, [
        "Activation recovered after onboarding.",
        "Enterprise cycles longer, higher confidence.",
        "Early support lifts retention most.",
      ]),
      panel(
        8,
        { x: 54, y: 24, w: 38, h: 56 },
        s.palette.surface,
        s.cornerRadiusPt + 4,
      ),
      bar(9, { x: 58, y: 70, w: 8, h: 26 }, s.palette.accent),
      bar(
        9,
        { x: 68, y: 56, w: 8, h: 40 },
        s.palette.deco[0] ?? s.palette.accent,
      ),
      bar(9, { x: 78, y: 44, w: 8, h: 52 }, s.palette.accent),
    ],
  }),
  table: (s) => ({
    bg: tint(s),
    els: [
      H(s, { x: 8, y: 12, w: 70, h: 9 }, "Evidence", 5.4),
      ...[0, 1, 2, 3].map((r) =>
        panel(
          7 + r,
          { x: 8, y: 28 + r * 13, w: 84, h: 11 },
          r === 0
            ? s.palette.accent
            : r % 2
              ? s.palette.surface
              : s.palette.slideBg,
          s.cornerRadiusPt,
        ),
      ),
      Label(s, { x: 11, y: 30.5, w: 30, h: 6 }, "CLAIM", "#ffffff"),
      Label(s, { x: 60, y: 30.5, w: 30, h: 6 }, "SOURCE", "#ffffff"),
    ],
  }),
  "two-column": (s) => ({
    bg: tint(s),
    els: [
      H(s, { x: 8, y: 12, w: 80, h: 8 }, "Side by side", 5.4),
      ...card(
        s,
        8,
        "OPTION A",
        ["Lower risk", "Faster approval", "Limited upside"],
        40,
      ),
      ...card(
        s,
        52,
        "OPTION B",
        ["Higher upside", "Clear ownership", "Needs sequencing"],
        40,
        true,
      ),
    ],
  }),
  "matrix-2x2": (s) => ({
    bg: tint(s),
    els: [
      H(s, { x: 8, y: 10, w: 70, h: 8 }, "Positioning", 5.2),
      ...[0, 1, 2, 3].map((i) =>
        panel(
          8,
          {
            x: 22 + (i % 2) * 36,
            y: 24 + Math.floor(i / 2) * 32,
            w: 34,
            h: 30,
          },
          i === 1 ? s.palette.accent : s.palette.surface,
          s.cornerRadiusPt + 2,
        ),
      ),
    ],
  }),
  "process-steps": (s) => ({
    bg: tint(s),
    els: [
      H(s, { x: 8, y: 12, w: 70, h: 9 }, "How it flows", 5.4),
      ...[0, 1, 2, 3].flatMap((i) => [
        shape({
          zIndex: 8,
          shape: "circle",
          box: { x: 8 + i * 22, y: 40, w: 9, h: 16 },
          fill: i === 0 ? s.palette.accent : s.palette.surface,
          locked: true,
          name: "Step",
        }),
        Body(
          s,
          { x: 7 + i * 22, y: 58, w: 18, h: 12 },
          ["Scope", "Build", "Verify", "Ship"][i],
        ),
      ]),
    ],
  }),
  timeline: (s) => ({
    bg: tint(s),
    els: [
      H(s, { x: 8, y: 12, w: 70, h: 9 }, "Timeline", 5.4),
      shape({
        zIndex: 7,
        shape: "rect",
        box: { x: 8, y: 48, w: 84, h: 0.5 },
        fill: s.palette.muted,
        locked: true,
        name: "Track",
      }),
      ...[0, 1, 2, 3].flatMap((i) => [
        bar(9, { x: 10 + i * 22, y: 44, w: 1.2, h: 8 }, s.palette.accent),
        Body(
          s,
          { x: 8 + i * 22, y: 54, w: 18, h: 10 },
          ["Q1", "Q2", "Q3", "Q4"][i],
        ),
      ]),
    ],
  }),
  roadmap: (s) => ({
    bg: tint(s),
    els: [0, 1, 2].flatMap((i) => [
      panel(
        8,
        { x: 8, y: 24 + i * 22, w: 84, h: 17 },
        i === 0 ? s.palette.accent : s.palette.surface,
        s.cornerRadiusPt + 2,
      ),
      Body(
        s,
        { x: 12, y: 30 + i * 22, w: 70, h: 7 },
        ["Now", "Next", "Later"][i],
        i === 0 ? "#ffffff" : undefined,
      ),
    ]),
  }),
  "framework-diagram": (s) => ({
    bg: tint(s),
    els: [
      orb(1, { x: 30, y: 22, w: 40, h: 56 }, s.palette.accent, 0.12),
      panel(
        8,
        { x: 35, y: 32, w: 30, h: 36 },
        s.palette.surface,
        s.cornerRadiusPt + 8,
      ),
      H(s, { x: 36, y: 44, w: 28, h: 10 }, "Framework", 4.4),
    ],
  }),
  "architecture-diagram": (s) => ({
    bg: tint(s),
    els: [0, 1, 2].flatMap((i) => [
      panel(
        8,
        { x: 10 + i * 28, y: 36, w: 22, h: 24 },
        s.palette.surface,
        s.cornerRadiusPt,
      ),
      Body(
        s,
        { x: 12 + i * 28, y: 44, w: 18, h: 8 },
        ["Edge", "Core", "Data"][i],
      ),
    ]),
  }),
  "case-study": (s) => ({
    bg: tint(s),
    els: [
      panel(
        8,
        { x: 52, y: 12, w: 40, h: 76 },
        s.palette.surface,
        s.cornerRadiusPt + 4,
      ),
      image({
        zIndex: 9,
        box: { x: 55, y: 16, w: 34, h: 40 },
        radius: s.cornerRadiusPt,
        fitMode: "cover",
      }),
      H(s, { x: 8, y: 16, w: 40, h: 12 }, "Customer story", 5),
      List(s, { x: 8, y: 34, w: 40, h: 46 }, ["Context", "Action", "Result"]),
    ],
  }),
  "risk-register": (s) => ({
    bg: tint(s),
    els: [
      H(s, { x: 8, y: 12, w: 70, h: 8 }, "Risks", 5.4),
      ...[0, 1, 2].flatMap((i) => [
        panel(
          8,
          { x: 8, y: 28 + i * 18, w: 84, h: 14 },
          s.palette.surface,
          s.cornerRadiusPt,
        ),
        bar(9, { x: 8, y: 28 + i * 18, w: 1.2, h: 14 }, s.palette.accent),
        Body(
          s,
          { x: 12, y: 32 + i * 18, w: 76, h: 7 },
          ["Adoption", "Timing", "Scope"][i],
        ),
      ]),
    ],
  }),
  recommendation: (s) => ({
    bg: accentField(s),
    els: [
      text({
        zIndex: 10,
        box: { x: 9, y: 36, w: 70, h: 16 },
        role: "title",
        text: "We recommend B",
        style: {
          fontSize: 7.5,
          color: "#ffffff",
          fontId: s.fonts.heading,
          bold: true,
          align: "left",
        },
      }),
      Sub(
        s,
        { x: 9, y: 56, w: 60, h: 8 },
        "Highest upside with manageable risk.",
        "#ffffff",
      ),
    ],
  }),
  "team-grid": (s) => ({
    bg: tint(s),
    els: [0, 1, 2, 3].flatMap((i) => [
      shape({
        zIndex: 8,
        shape: "circle",
        box: { x: 10 + i * 21, y: 30, w: 14, h: 25 },
        fill: s.palette.surface,
        locked: true,
        name: "Avatar",
      }),
      Body(
        s,
        { x: 8 + i * 21, y: 58, w: 18, h: 8 },
        ["Lead", "PM", "Eng", "Ops"][i],
      ),
    ]),
  }),
  "pricing-cards": (s) => ({
    bg: tint(s),
    els: [
      ...card(s, 12, "STARTER", ["Core", "3/mo", "Email"], 32),
      ...card(s, 56, "SCALE", ["All", "Unlimited", "Strategist"], 32, true),
    ],
  }),
  closing: (s) => ({
    bg: hero(s),
    els: [
      orb(2, { x: 54, y: 24, w: 64, h: 88 }, s.palette.accent, 0.4),
      bar(3, { x: 8, y: 40, w: 10, h: 1 }, "#ffffff"),
      H(s, { x: 8, y: 44, w: 78, h: 16 }, "Thank you.", 11, "#ffffff"),
      Sub(
        s,
        { x: 8, y: 64, w: 56, h: 8 },
        "hello@studio · studio.com",
        "#ffffffcc",
      ),
    ],
  }),
  "appendix-detail": (s) => ({
    bg: tint(s),
    els: [
      H(s, { x: 8, y: 12, w: 70, h: 8 }, "Appendix", 5),
      List(s, { x: 8, y: 28, w: 84, h: 56 }, [
        "Method & sources",
        "Definitions",
        "Detailed tables",
        "Glossary",
      ]),
    ],
  }),
};

export function familySlide(
  spec: ThemeSpec,
  kind: string,
  family: ThemePackageRenderFamily,
  label: string,
): Record<string, unknown> | null {
  const build = L[family];
  if (!build) return null;
  activeSpec = spec;
  try {
    const { els, bg } = build(spec);
    return slide(
      `${spec.id}-${kind}`,
      label,
      T(spec, kind),
      [...familyChrome(spec, family, kind), ...els],
      bg,
    );
  } finally {
    activeSpec = null;
  }
}
