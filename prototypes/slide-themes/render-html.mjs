/**
 * Renders the validated theme decks into static HTML preview pages.
 *
 * Faithfully mirrors the live slide canvas renderer
 * (`src/components/presentation/slide-canvas/*`): boxes are percent-positioned,
 * font sizes use container-query height units (`cqh`), shapes use the same
 * fill/stroke/clip-path rules, and the slide background resolves
 * slide → master → theme default. No build step needed — open the HTML.
 *
 * Run from the repo root:
 *   node prototypes/slide-themes/render-html.mjs
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const decksDir = join(here, "decks");
const outDir = join(here, "preview");
mkdirSync(outDir, { recursive: true });

const FONT_FAMILY = {
  inter: "'Inter'",
  "source-sans-3": "'Source Sans 3'",
  "ibm-plex-sans": "'IBM Plex Sans'",
  manrope: "'Manrope'",
  "space-grotesk": "'Space Grotesk'",
  "source-serif-4": "'Source Serif 4'",
  "jetbrains-mono": "'JetBrains Mono'",
  "noto-sans-sc": "'Noto Sans SC'",
};

const SHAPE_DEFAULT_FILL = "#6366f1"; // matches ShapeElementView fallback

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function resolveColor(ref, colors) {
  if (!ref) return undefined;
  if (typeof ref === "string") return ref;
  if (ref.value) return ref.value;
  if (ref.token) return colors[ref.token];
  return undefined;
}

function backgroundCss(treatment, colors) {
  if (!treatment) return "";
  if (treatment.type === "solid") {
    return `background:${resolveColor(treatment.color, colors)};`;
  }
  if (treatment.type === "gradient") {
    const from = resolveColor(treatment.from, colors);
    const to = resolveColor(treatment.to, colors);
    const stops = stopList(treatment, colors) ?? `${from}, ${to}`;
    return `background:linear-gradient(${treatment.angle ?? 135}deg, ${stops});`;
  }
  if (treatment.type === "radialGradient") {
    const inner = resolveColor(treatment.inner, colors);
    const outer = resolveColor(treatment.outer, colors);
    const rx = treatment.rx ?? treatment.r ?? 70;
    const ry = treatment.ry ?? treatment.r ?? 70;
    const stops = stopList(treatment, colors) ?? `${inner}, ${outer}`;
    return `background:radial-gradient(${rx}% ${ry}% at ${treatment.cx ?? 50}% ${treatment.cy ?? 50}%, ${stops});`;
  }
  if (treatment.type === "image") {
    return `background:#e9e9ee url(${treatment.url}) center/cover;`;
  }
  return "";
}

function stopList(fill, colors, alpha) {
  if (!Array.isArray(fill?.stops)) return undefined;
  return fill.stops
    .map((stop) => {
      const color = resolveColor(stop.color, colors);
      const value = alpha === undefined ? color : rgba(color, alpha);
      return `${value}${stop.offset !== undefined ? ` ${stop.offset}%` : ""}`;
    })
    .join(", ");
}

function rgba(hex, alpha) {
  const raw = String(hex ?? "#71717a").replace("#", "");
  const expanded =
    raw.length === 3
      ? raw
          .split("")
          .map((part) => `${part}${part}`)
          .join("")
      : raw;
  if (expanded.length < 6) return `rgba(113,113,122,${alpha})`;
  const r = Number.parseInt(expanded.slice(0, 2), 16);
  const g = Number.parseInt(expanded.slice(2, 4), 16);
  const b = Number.parseInt(expanded.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function fillCss(fill, colors, effect) {
  const isGlass = effect?.kind === "glass";
  const alpha =
    isGlass && effect?.intensity === "strong"
      ? 0.4
      : isGlass && effect?.intensity === "light"
        ? 0.05
        : 0.3;
  if (fill?.type === "radialGradient") {
    const inner = resolveColor(fill.inner, colors);
    const outer = resolveColor(fill.outer, colors);
    const rx = fill.rx ?? fill.r ?? 70;
    const ry = fill.ry ?? fill.r ?? 70;
    const stops = stopList(fill, colors, isGlass ? alpha + 0.08 : undefined);
    return isGlass
      ? `radial-gradient(${rx}% ${ry}% at ${fill.cx ?? 50}% ${fill.cy ?? 50}%, ${stops ?? `${rgba(inner, alpha + 0.08)}, ${rgba(outer, alpha)}`})`
      : `radial-gradient(${rx}% ${ry}% at ${fill.cx ?? 50}% ${fill.cy ?? 50}%, ${stops ?? `${inner}, ${outer}`})`;
  }
  if (fill?.type === "linearGradient") {
    const from = resolveColor(fill.from, colors);
    const to = resolveColor(fill.to, colors);
    const stops = stopList(fill, colors, isGlass ? alpha + 0.08 : undefined);
    return isGlass
      ? `linear-gradient(${fill.angle ?? 90}deg, ${stops ?? `${rgba(from, alpha + 0.08)}, ${rgba(to, alpha)}`})`
      : `linear-gradient(${fill.angle ?? 90}deg, ${stops ?? `${from}, ${to}`})`;
  }
  const color = resolveColor(fill, colors) ?? SHAPE_DEFAULT_FILL;
  return isGlass ? rgba(color, alpha) : color;
}

function effectCss(effect) {
  if (!effect) return "";
  if (effect.kind === "blur") return `filter:blur(${effect.radius}cqmin);`;
  if (effect.kind === "glow") {
    return `filter:drop-shadow(0 0 ${effect.blur}cqmin ${rgba(effect.color, effect.opacity ?? 1)});`;
  }
  const blur =
    effect.intensity === "strong" ? 22 : effect.intensity === "light" ? 6 : 14;
  const saturate = effect.intensity === "light" ? 1.16 : 1.3;
  const borderAlpha = effect.intensity === "light" ? 0.12 : 0.45;
  return `backdrop-filter:blur(${blur}px) saturate(${saturate});-webkit-backdrop-filter:blur(${blur}px) saturate(${saturate});border:1px solid ${rgba("#ffffff", borderAlpha)};box-shadow:0 8px 24px rgba(15,23,42,.18);`;
}

function radiusCss(radius, fallback = "0.25rem") {
  if (radius === undefined) return fallback;
  if (typeof radius === "object") {
    return `${radius.topLeft}cqmin ${radius.topRight}cqmin ${radius.bottomRight}cqmin ${radius.bottomLeft}cqmin`;
  }
  return radius >= 50 ? "9999px" : `${radius}cqmin`;
}

function inscribedBox(box) {
  const actualW = box.w * 16;
  const actualH = box.h * 9;
  const side = Math.min(actualW, actualH);
  const w = side / 16;
  const h = side / 9;
  return {
    x: ((box.w - w) / 2 / box.w) * 100,
    y: ((box.h - h) / 2 / box.h) * 100,
    w: (w / box.w) * 100,
    h: (h / box.h) * 100,
  };
}

function boxCss(el) {
  const b = el.box;
  let css = `position:absolute;left:${b.x}%;top:${b.y}%;width:${b.w}%;height:${b.h}%;z-index:${el.zIndex};`;
  if (el.opacity !== undefined && el.opacity < 1)
    css += `opacity:${el.opacity};`;
  if (el.rotation) css += `transform:rotate(${el.rotation}deg);`;
  if (el.shadow) {
    css +=
      el.shadow === true
        ? `filter:drop-shadow(0 0.6cqmin 1.2cqmin rgba(0,0,0,.28));`
        : `filter:drop-shadow(${el.shadow.x}cqmin ${el.shadow.y}cqmin ${el.shadow.blur}cqmin ${rgba(el.shadow.color, el.shadow.opacity ?? 1)});`;
  }
  return css;
}

function textStyleOf(el) {
  return el.designOverrides?.textStyle ?? {};
}

function fontStack(fontId) {
  const fam = FONT_FAMILY[fontId];
  return fam ? `${fam}, system-ui, sans-serif` : "system-ui, sans-serif";
}

function renderText(el, colors, accent) {
  const ts = textStyleOf(el);
  const content = el.content ?? {};
  const paragraphs = content.paragraphs ?? [{ text: content.text ?? "" }];
  const hasList = paragraphs.some((p) => p.listType);
  const color = ts.color ?? colors.onBg;
  const textFill = fillCss(ts.textFill, colors);
  const justify =
    ts.verticalAlign === "top"
      ? "flex-start"
      : ts.verticalAlign === "bottom"
        ? "flex-end"
        : "center";
  let css =
    boxCss(el) +
    `display:flex;flex-direction:column;justify-content:${justify};` +
    `${ts.textFill ? `background:${textFill};-webkit-background-clip:text;background-clip:text;color:transparent;` : `color:${color};`}font-size:${ts.fontSize ?? 4.5}cqh;` +
    `font-weight:${ts.bold ? 700 : 400};font-style:${ts.italic ? "italic" : "normal"};` +
    `text-align:${ts.align ?? "left"};line-height:${ts.lineHeight ?? 1.18};` +
    `font-family:${fontStack(ts.fontId)};overflow:hidden;`;
  if (ts.underline) css += "text-decoration:underline;";
  if (ts.letterSpacing !== undefined)
    css += `letter-spacing:${ts.letterSpacing}em;`;
  if (ts.textTransform) css += `text-transform:${ts.textTransform};`;

  if (hasList) {
    const marker = accent ?? color;
    const gap = content.bulletGap ? `${content.bulletGap}cqh` : "0.7em";
    const items = paragraphs
      .map((p) => {
        const dot =
          p.listType === "number"
            ? `<span style="flex-shrink:0;color:${marker};min-width:1.2em;">•</span>`
            : `<span style="margin-top:.5em;height:.35em;width:.35em;flex-shrink:0;border-radius:9999px;background:${marker};"></span>`;
        return `<li style="display:flex;align-items:flex-start;gap:.55em;"><span aria-hidden="true" style="display:flex;">${dot}</span><span style="min-width:0;overflow-wrap:break-word;">${esc(p.text)}</span></li>`;
      })
      .join("");
    return `<div style="${css}"><ul style="display:flex;flex-direction:column;gap:${gap};margin:0;padding:0;list-style:none;">${items}</ul></div>`;
  }

  const ps = ts.paragraphSpacing;
  const blocks = paragraphs
    .map((p, i) => {
      const mb =
        ps && i < paragraphs.length - 1 ? `margin-bottom:${ps}cqh;` : "";
      return `<div style="width:100%;white-space:pre-wrap;overflow-wrap:break-word;${mb}">${esc(p.text || "\u00a0")}</div>`;
    })
    .join("");
  return `<div style="${css}">${blocks}</div>`;
}

function renderShape(el, colors = {}) {
  const d = el.designOverrides ?? {};
  const fill = fillCss(d.fill, colors, d.effect);
  const stroke = d.stroke;
  const shape = el.content?.shape;
  const effect = effectCss(d.effect);
  const overflow = "hidden";
  if (shape === "line") {
    return `<div style="${boxCss(el)}display:flex;align-items:center;"><div style="height:${stroke?.width ? `${stroke.width}cqmin` : "100%"};width:100%;background:${stroke?.color ?? fill};"></div></div>`;
  }
  if (shape === "ellipse" && d.effect?.kind === "blur") {
    return `<div style="${boxCss(el)}background:${fill};border-radius:50%;${effect}"></div>`;
  }
  if (shape === "triangle") {
    return `<div style="${boxCss(el)}overflow:${overflow};"><div style="position:absolute;inset:0;background:${fill};clip-path:polygon(50% 0%,0% 100%,100% 100%);${effect}"></div></div>`;
  }
  if (shape === "diamond") {
    return `<div style="${boxCss(el)}overflow:${overflow};"><div style="position:absolute;inset:0;background:${fill};clip-path:polygon(50% 0%,100% 50%,50% 100%,0% 50%);${effect}"></div></div>`;
  }
  if (shape === "circle" || shape === "square") {
    const inner = inscribedBox(el.box);
    const radius =
      shape === "circle"
        ? "9999px"
        : d.radius !== undefined
          ? radiusCss(d.radius)
          : "0.25rem";
    const border = stroke
      ? `border:${stroke.width}cqmin solid ${stroke.color};`
      : "";
    return `<div style="${boxCss(el)}overflow:${overflow};"><div style="position:absolute;left:${inner.x}%;top:${inner.y}%;width:${inner.w}%;height:${inner.h}%;background:${fill};border-radius:${radius};${border}${effect}"></div></div>`;
  }
  const radius =
    shape === "ellipse"
      ? "50%"
      : d.radius !== undefined
        ? radiusCss(d.radius)
        : "0.25rem";
  const border = stroke
    ? `border:${stroke.width}cqmin solid ${stroke.color};`
    : "";
  return `<div style="${boxCss(el)}overflow:${overflow};background:${fill};border-radius:${radius};${border}${effect}"></div>`;
}

function renderImage(el) {
  const d = el.designOverrides ?? {};
  const src = el.content?.src ?? "";
  const fit = d.fitMode === "cover" ? "cover" : "contain";
  let radius = d.radius !== undefined ? `${d.radius}%` : "0";
  let clip = "";
  if (d.maskShape === "circle") clip = "clip-path:circle(50% at 50% 50%);";
  if (d.maskShape === "ellipse")
    clip = "clip-path:ellipse(50% 50% at 50% 50%);";
  if (d.maskShape === "diamond")
    clip = "clip-path:polygon(50% 0%,100% 50%,50% 100%,0% 50%);";
  if (d.maskShape === "triangle")
    clip = "clip-path:polygon(50% 0%,0% 100%,100% 100%);";
  return `<div style="${boxCss(el)}background:#e9e9ee url('${src}') center/${fit} no-repeat;border-radius:${radius};${clip}"></div>`;
}

function renderElement(el, colors, accent) {
  switch (el.kind) {
    case "text":
      return renderText(el, colors, accent);
    case "shape":
      return renderShape(el, colors);
    case "image":
      return renderImage(el);
    default:
      return "";
  }
}

function renderSlide(deck, slide, index, colors, accent) {
  const master = deck.masters.find((m) => m.id === deck.defaultMasterId);
  const treatment =
    slide.designOverrides?.background ??
    master?.background ??
    deck.design.themeOverrides?.tokenSet?.defaultBackground;
  const bg = backgroundCss(treatment, colors);

  const slideEls = [...(slide.elements ?? [])].sort(
    (a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0),
  );
  const body = slideEls.map((el) => renderElement(el, colors, accent)).join("");

  // Master foreground chrome (footer + page number).
  const chrome = (master?.elements ?? [])
    .map((el) => {
      const copy = JSON.parse(JSON.stringify(el));
      if (copy.content?.text) {
        copy.content.text = copy.content.text.replace(
          /\{\{pageNumber\}\}/g,
          String(index + 1),
        );
        copy.content.paragraphs = [{ text: copy.content.text }];
      }
      return renderElement(copy, colors, accent);
    })
    .join("");

  return `<figure class="slide-wrap"><div class="slide" style="${bg}">${body}${chrome}</div><figcaption>${index + 1} · ${esc(slide.title || slide.id)}</figcaption></figure>`;
}

const FONTS_LINK = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&family=Manrope:wght@400;600;700;800&family=Noto+Sans+SC:wght@400;600;700&family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400;1,8..60,600&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">`;

const PAGE_CSS = `
*{box-sizing:border-box}
body{margin:0;background:#1b1d22;color:#e7e8ec;font-family:'Inter',system-ui,sans-serif;padding:32px 0 64px}
header{max-width:1120px;margin:0 auto 24px;padding:0 24px}
header h1{font-family:'Space Grotesk',system-ui,sans-serif;font-size:26px;margin:0 0 4px}
header p{color:#a0a3ac;margin:0;font-size:14px}
header a{color:#9db4ff}
.deck{max-width:1120px;margin:0 auto;display:flex;flex-direction:column;gap:28px;padding:0 24px}
.slide-wrap{margin:0}
.slide{position:relative;width:100%;aspect-ratio:16/9;container-type:size;container-name:slide;border-radius:10px;overflow:hidden;isolation:isolate;contain:paint;box-shadow:0 10px 30px rgba(0,0,0,.45);}
figcaption{margin-top:8px;font-size:12px;color:#8b8f99;font-variant-numeric:tabular-nums}
nav{max-width:1120px;margin:0 auto 28px;padding:0 24px;display:flex;flex-wrap:wrap;gap:10px}
nav a{display:inline-block;padding:8px 14px;border-radius:999px;background:#2a2d35;color:#e7e8ec;text-decoration:none;font-size:13px;border:1px solid #3a3e48}
nav a:hover{background:#343843}
`;

const files = readdirSync(decksDir).filter((f) => f.endsWith(".deck.json"));
const themes = [];

for (const f of files) {
  const deck = JSON.parse(readFileSync(join(decksDir, f), "utf8"));
  const tokenSet = deck.design.themeOverrides?.tokenSet ?? {};
  const colors = tokenSet.colors ?? {};
  const accent = colors.accent;
  const id = f.replace(".deck.json", "");
  const name = tokenSet.name ?? id;
  const slides = deck.slides
    .map((slide, i) => renderSlide(deck, slide, i, colors, accent))
    .join("\n");

  const navLinks = files
    .map((other) => {
      const oid = other.replace(".deck.json", "");
      const active =
        oid === id ? ' style="background:#3a3e48;font-weight:600"' : "";
      return `<a href="${oid}.html"${active}>${oid}</a>`;
    })
    .join("");

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${FONTS_LINK}<title>${esc(name)} — theme preview</title><style>${PAGE_CSS}</style></head><body><header><h1>${esc(name)}</h1><p>Professional v6 slide theme · heading ${esc(tokenSet.typography?.headingFontFamily?.split(",")[0] ?? "")} · accent ${esc(accent ?? "")}</p></header><nav>${navLinks}</nav><main class="deck">${slides}</main></body></html>`;
  writeFileSync(join(outDir, `${id}.html`), html, "utf8");
  themes.push({
    id,
    name,
    accent,
    tagline: tokenSet.typography?.headingFontFamily,
  });
  console.log(`✓ preview/${id}.html`);
}

// Index gallery: first (cover) slide of each theme.
const cards = [];
for (const f of files) {
  const deck = JSON.parse(readFileSync(join(decksDir, f), "utf8"));
  const tokenSet = deck.design.themeOverrides?.tokenSet ?? {};
  const colors = tokenSet.colors ?? {};
  const id = f.replace(".deck.json", "");
  const cover = renderSlide(deck, deck.slides[0], 0, colors, colors.accent);
  cards.push(
    `<a class="card" href="${id}.html"><div class="card-stage">${cover}</div><div class="card-meta"><strong>${esc(tokenSet.name ?? id)}</strong></div></a>`,
  );
}
const indexHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${FONTS_LINK}<title>Slide themes — gallery</title><style>${PAGE_CSS}
.grid{max-width:1120px;margin:0 auto;padding:0 24px;display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:24px}
.card{text-decoration:none;color:inherit}
.card-stage .slide{box-shadow:0 8px 22px rgba(0,0,0,.4)}
.card-stage figcaption{display:none}
.card-meta{margin-top:10px;font-size:15px}
.card:hover .slide{outline:2px solid #9db4ff}
</style></head><body><header><h1>Professional slide themes</h1><p>Eight v6 theme decks rendered with the same conventions as the live canvas. Click a theme for the full template set.</p></header><main class="grid">${cards.join("")}</main></body></html>`;
writeFileSync(join(outDir, "index.html"), indexHtml, "utf8");
console.log(
  `✓ preview/index.html\n\nOpen prototypes/slide-themes/preview/index.html`,
);
