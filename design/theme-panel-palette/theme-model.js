/**
 * Shared data + helpers for the deck-template design mockups.
 * Mirrors the real model: deck-theme-token-data.ts, deck-theme-token-types.ts,
 * slide-templates.ts — so previews are faithful to what the app renders.
 */

window.THEMES = [
  { id: "default", name: "Default",
    colors: { slideBg: "#ffffff", surface: "#f1f5f9", accent: "#6366f1", onBg: "#0f172a", onSurface: "#1e293b", onAccent: "#ffffff", muted: "#64748b" },
    fontFamily: "Inter", headingFontFamily: "Inter" },
  { id: "indigo", name: "Indigo",
    colors: { slideBg: "#ffffff", surface: "#eef2ff", accent: "#4f46e5", onBg: "#1e1b4b", onSurface: "#312e81", onAccent: "#ffffff", muted: "#6366f1" },
    fontFamily: "Inter", headingFontFamily: "Space Grotesk" },
  { id: "ocean", name: "Ocean",
    colors: { slideBg: "#f6fbff", surface: "#e0f2fe", accent: "#0284c7", onBg: "#0c4a6e", onSurface: "#075985", onAccent: "#ffffff", muted: "#0ea5e9" },
    fontFamily: "Avenir Next", headingFontFamily: "Avenir Next" },
  { id: "forest", name: "Forest",
    colors: { slideBg: "#f6fdf8", surface: "#dcfce7", accent: "#16a34a", onBg: "#14532d", onSurface: "#166534", onAccent: "#ffffff", muted: "#22c55e" },
    fontFamily: "Trebuchet MS", headingFontFamily: "Trebuchet MS" },
  { id: "sunset", name: "Sunset",
    colors: { slideBg: "#fffaf5", surface: "#ffedd5", accent: "#ea580c", onBg: "#431407", onSurface: "#7c2d12", onAccent: "#ffffff", muted: "#f97316" },
    fontFamily: "Georgia", headingFontFamily: "Avenir Next" },
  { id: "grape", name: "Grape",
    colors: { slideBg: "#fdf7ff", surface: "#f3e8ff", accent: "#9333ea", onBg: "#3b0764", onSurface: "#581c87", onAccent: "#ffffff", muted: "#a855f7" },
    fontFamily: "Avenir Next", headingFontFamily: "Trebuchet MS" },
];

window.TEMPLATE_KINDS = [
  { kind: "title", label: "Title", description: "Title, subtitle, footer" },
  { kind: "content", label: "Content", description: "Title, body, visual, footer" },
  { kind: "visual", label: "Visual", description: "Full-bleed visual + caption" },
  { kind: "two-column", label: "Two-column", description: "Title over two columns" },
  { kind: "blank", label: "Blank", description: "Empty slide" },
];

window.FONT_OPTIONS = [
  "Inter", "Space Grotesk", "Avenir Next", "Trebuchet MS", "Georgia",
  "Roboto", "Poppins", "Merriweather", "Source Serif", "IBM Plex Sans",
];

window.TEXT_ROLES = [
  { role: "h1", label: "Heading 1", size: 38, weight: 700, heading: true },
  { role: "h2", label: "Heading 2", size: 30, weight: 700, heading: true },
  { role: "h3", label: "Heading 3", size: 24, weight: 600, heading: true },
  { role: "subtitle", label: "Subtitle", size: 24, weight: 400, heading: true },
  { role: "body", label: "Body", size: 16, weight: 400, heading: false },
  { role: "bullet", label: "Bullet", size: 14, weight: 400, heading: false },
  { role: "caption", label: "Caption", size: 10, weight: 400, heading: false },
  { role: "footer", label: "Footer", size: 10, weight: 400, heading: false },
  { role: "shapeLabel", label: "Shape label", size: 16, weight: 600, heading: true },
];

window.WEIGHTS = [
  { v: 300, l: "Light" }, { v: 400, l: "Regular" }, { v: 500, l: "Medium" },
  { v: 600, l: "Semibold" }, { v: 700, l: "Bold" }, { v: 800, l: "Extrabold" },
];

window.makeConfig = function makeConfig(themeId) {
  const t = window.THEMES.find((x) => x.id === themeId) || window.THEMES[0];
  const roles = {};
  window.TEXT_ROLES.forEach((r) => {
    roles[r.role] = {
      fontFamily: r.heading ? t.headingFontFamily : t.fontFamily,
      size: r.size, weight: r.weight,
      color: r.role === "footer" || r.role === "caption" ? t.colors.muted : t.colors.onBg,
    };
  });
  return {
    themeId: t.id, themeName: t.name,
    colors: { ...t.colors },
    headingFontFamily: t.headingFontFamily, bodyFontFamily: t.fontFamily,
    roles,
    bullet: { markerColor: t.colors.accent, numberStyle: "decimal" },
    image: { fitMode: "contain" },
    connector: { color: t.colors.onBg, endArrow: "arrow" },
    // BackgroundTreatment: solid falls back to the live Background token; a
    // gradient paints from/to at `angle`. Gradient stops persist when toggled.
    background: { type: "solid", from: t.colors.slideBg, to: t.colors.surface, angle: 135 },
  };
};

window.configAsTheme = function configAsTheme(cfg) {
  return { colors: cfg.colors, fontFamily: cfg.bodyFontFamily, headingFontFamily: cfg.headingFontFamily, background: cfg.background };
};

/** Quick-pick swatches for the color picker, drawn from the live config. */
window.themeSwatches = function themeSwatches(cfg) {
  const c = cfg.colors;
  return [c.accent, c.onBg, c.slideBg, c.surface, c.onSurface, c.muted, "#000000", "#ffffff"];
};

/**
 * The deck's semantic color palette — the ColorToken set from
 * deck-theme-token-types.ts. Ordered for display as a cohesive palette and
 * grouped so integrations can show "base" vs "on-color" roles.
 */
window.PALETTE_TOKENS = [
  { token: "slideBg", label: "Background", group: "base", role: "Slide canvas fill" },
  { token: "surface", label: "Surface", group: "base", role: "Cards / callouts" },
  { token: "accent", label: "Accent", group: "base", role: "Brand / highlights" },
  { token: "muted", label: "Muted", group: "base", role: "Secondary text" },
  { token: "onBg", label: "Text", group: "on", role: "Text on background" },
  { token: "onSurface", label: "On surface", group: "on", role: "Text on surface" },
  { token: "onAccent", label: "On accent", group: "on", role: "Text on accent" },
];

/** Curated multi-swatch palette schemes that can be applied in one click. */
window.PALETTE_SCHEMES = [
  { id: "indigo", name: "Indigo", colors: { slideBg: "#ffffff", surface: "#eef2ff", accent: "#4f46e5", onBg: "#1e1b4b", onSurface: "#312e81", onAccent: "#ffffff", muted: "#6366f1" } },
  { id: "slate", name: "Slate", colors: { slideBg: "#f8fafc", surface: "#e2e8f0", accent: "#0f172a", onBg: "#0f172a", onSurface: "#1e293b", onAccent: "#ffffff", muted: "#64748b" } },
  { id: "ocean", name: "Ocean", colors: { slideBg: "#f6fbff", surface: "#e0f2fe", accent: "#0284c7", onBg: "#0c4a6e", onSurface: "#075985", onAccent: "#ffffff", muted: "#0ea5e9" } },
  { id: "sunset", name: "Sunset", colors: { slideBg: "#fffaf5", surface: "#ffedd5", accent: "#ea580c", onBg: "#431407", onSurface: "#7c2d12", onAccent: "#ffffff", muted: "#f97316" } },
  { id: "forest", name: "Forest", colors: { slideBg: "#f6fdf8", surface: "#dcfce7", accent: "#16a34a", onBg: "#14532d", onSurface: "#166534", onAccent: "#ffffff", muted: "#22c55e" } },
  { id: "grape", name: "Grape", colors: { slideBg: "#fdf7ff", surface: "#f3e8ff", accent: "#9333ea", onBg: "#3b0764", onSurface: "#581c87", onAccent: "#ffffff", muted: "#a855f7" } },
];

/** Curated gradient backgrounds for one-click selection (from → to @ angle). */
window.GRADIENT_PRESETS = [
  { name: "Indigo", from: "#eef2ff", to: "#c7d2fe", angle: 135 },
  { name: "Sky", from: "#f0f9ff", to: "#bae6fd", angle: 135 },
  { name: "Mint", from: "#f0fdf4", to: "#bbf7d0", angle: 135 },
  { name: "Sunset", from: "#fff7ed", to: "#fed7aa", angle: 135 },
  { name: "Grape", from: "#faf5ff", to: "#e9d5ff", angle: 135 },
  { name: "Slate", from: "#f8fafc", to: "#cbd5e1", angle: 135 },
  { name: "Bold", from: "#4f46e5", to: "#9333ea", angle: 135 },
  { name: "Warm", from: "#f59e0b", to: "#ef4444", angle: 135 },
];

/* Nested get/set so color triggers can address e.g. "roles.h1.color". */
window.getPath = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
window.setPath = (o, p, v) => { const ks = p.split("."); const last = ks.pop(); let t = o; ks.forEach((k) => (t = t[k])); t[last] = v; };

/**
 * Live-patches color edits without rebuilding control DOM (so an open picker
 * keeps its anchor): updates any swatch trigger / chip / bound sample for the
 * path, then re-renders previews via the page-provided window.__paint().
 */
window.livePaintColor = function livePaintColor(path, hex) {
  document.querySelectorAll(`[data-color-path="${path}"] .dot, .color-chip[data-color-path="${path}"]`).forEach((el) => (el.style.background = hex));
  document.querySelectorAll(`[data-color-path="${path}"][data-paint-self]`).forEach((el) => (el.style.background = hex));
  document.querySelectorAll(`[data-color-path="${path}"] .hex`).forEach((el) => (el.textContent = hex.toUpperCase()));
  document.querySelectorAll(`[data-color-bind="${path}"]`).forEach((el) => { el.style[el.dataset.colorBindProp || "color"] = hex; });
  if (typeof window.__paint === "function") window.__paint();
};

/** Wires every [data-color-path] trigger inside `root` to the compact picker. */
window.wireColorTriggers = function wireColorTriggers(root, cfg) {
  root.querySelectorAll("[data-color-path]").forEach((el) => {
    if (el.__wired) return; el.__wired = true;
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const path = el.dataset.colorPath;
      window.openColorPicker(el, window.getPath(cfg, path), window.themeSwatches(cfg), (hex) => {
        window.setPath(cfg, path, hex);
        window.livePaintColor(path, hex);
      });
    });
  });
};

/** Faithful mini-slide preview (SVG string). */
window.renderSlidePreview = function renderSlidePreview(kind, theme, opts = {}) {
  const ratio = opts.ratio ?? 16 / 9;
  const W = opts.width ?? 320, H = Math.round(W / ratio);
  const c = theme.colors, head = theme.headingFontFamily + ", sans-serif", body = theme.fontFamily + ", sans-serif";
  const bar = (x, y, w, h, r = 2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${c.accent}"/>`;
  const text = (x, y, s, sz, fill, font, wt = 400, an = "start") => `<text x="${x}" y="${y}" font-family="${font}" font-size="${sz}" font-weight="${wt}" fill="${fill}" text-anchor="${an}">${s}</text>`;
  const surf = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${c.surface}"/>`;
  let inner = "";
  if (kind === "title") {
    inner += text(W / 2, H * 0.45, "Title", H * 0.13, c.onBg, head, 700, "middle");
    inner += bar(W / 2 - 22, H * 0.5, 44, 3, 2);
    inner += text(W / 2, H * 0.63, "Subtitle goes here", H * 0.058, c.muted, body, 400, "middle");
    inner += text(W / 2, H * 0.92, "Footer", H * 0.04, c.muted, body, 400, "middle");
  } else if (kind === "content") {
    inner += text(W * 0.06, H * 0.18, "Title", H * 0.1, c.onBg, head, 700);
    inner += bar(W * 0.06, H * 0.22, 40, 3);
    for (let i = 0; i < 4; i++) { const y = H * 0.36 + i * H * 0.13;
      inner += `<circle cx="${W * 0.09}" cy="${y - H * 0.015}" r="${H * 0.012}" fill="${c.accent}"/>`;
      inner += `<rect x="${W * 0.12}" y="${y - H * 0.03}" width="${W * 0.3}" height="${H * 0.035}" rx="2" fill="${c.muted}" opacity="0.45"/>`; }
    inner += surf(W * 0.56, H * 0.32, W * 0.38, H * 0.5);
    inner += `<path d="M${W * 0.66} ${H * 0.66} l${W * 0.05} -${H * 0.08} l${W * 0.04} ${H * 0.05} l${W * 0.05} -${H * 0.07} l${W * 0.06} ${H * 0.1}" fill="none" stroke="${c.accent}" stroke-width="2"/>`;
  } else if (kind === "visual") {
    inner += surf(W * 0.05, H * 0.08, W * 0.9, H * 0.66);
    inner += `<circle cx="${W * 0.32}" cy="${H * 0.3}" r="${H * 0.05}" fill="${c.accent}" opacity="0.7"/>`;
    inner += `<path d="M${W * 0.2} ${H * 0.62} l${W * 0.13} -${H * 0.16} l${W * 0.1} ${H * 0.08} l${W * 0.12} -${H * 0.12} l${W * 0.18} ${H * 0.2}" fill="none" stroke="${c.accent}" stroke-width="2.5"/>`;
    inner += text(W / 2, H * 0.88, "Caption", H * 0.05, c.muted, body, 400, "middle");
  } else if (kind === "two-column") {
    inner += text(W * 0.06, H * 0.18, "Title", H * 0.1, c.onBg, head, 700);
    inner += bar(W * 0.06, H * 0.22, 40, 3);
    [0.06, 0.52].forEach((cx) => { for (let i = 0; i < 3; i++) { const y = H * 0.38 + i * H * 0.14;
      inner += `<rect x="${W * cx}" y="${y}" width="${W * 0.42}" height="${H * 0.04}" rx="2" fill="${c.muted}" opacity="0.45"/>`; } });
  } else {
    inner += `<rect x="${W * 0.5 - 14}" y="${H * 0.5 - 1.5}" width="28" height="3" rx="1.5" fill="${c.muted}" opacity="0.5"/>`;
    inner += `<rect x="${W * 0.5 - 1.5}" y="${H * 0.5 - 14}" width="3" height="28" rx="1.5" fill="${c.muted}" opacity="0.5"/>`;
  }
  // Background: solid slideBg by default; a gradient BackgroundTreatment paints
  // a linear gradient. Presets (no `background`) fall back to the solid fill.
  const bg = theme.background;
  let bgFill = c.slideBg, defs = "";
  if (bg && bg.type === "gradient") {
    const gid = "g" + Math.random().toString(36).slice(2, 9);
    defs = `<defs><linearGradient id="${gid}" gradientTransform="rotate(${bg.angle ?? 135} 0.5 0.5)"><stop offset="0%" stop-color="${bg.from}"/><stop offset="100%" stop-color="${bg.to}"/></linearGradient></defs>`;
    bgFill = `url(#${gid})`;
  } else if (bg && bg.type === "solid" && bg.color) {
    bgFill = bg.color;
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${kind} preview">
    ${defs}<rect width="${W}" height="${H}" rx="8" fill="${bgFill}"/>
    <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="8" fill="none" stroke="${c.muted}" stroke-opacity="0.25"/>${inner}</svg>`;
};

/** Native-looking top toolbar with the active Theme button. */
window.toolbarHTML = function toolbarHTML(active) {
  const b = (id, label, icon, opt = {}) => {
    const cls = ["tb-btn"]; if (opt.primary) cls.push("primary"); if (id === active) cls.push("active");
    return `<button class="${cls.join(" ")}" data-tb="${id}"${id === active ? ' aria-expanded="true"' : ""}><span class="ico">${icon}</span>${label ? `<span>${label}</span>` : ""}</button>`;
  };
  return `${b("add", "Add", "＋", { primary: true })}${b("insert", "Insert", "▤")}${b("from-doc", "From document", "▦")}
    <span class="tb-divider"></span>${b("format", "16:9", "▭")}${b("bg", "", "◐")}${b("theme", "Theme", "🅰")}
    <span class="tb-spacer"></span><span class="tb-meta">Slide 1 of 6</span>${b("undo", "", "↺")}${b("redo", "", "↻")}`;
};
