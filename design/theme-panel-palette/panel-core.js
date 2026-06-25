/**
 * Reusable two-view theme-panel core (preset ⇄ customize) with the
 * preset / custom / saved state model. The *colors* area is delegated to a
 * page-provided `window.PalettePlugin`, so each solution only differs in how
 * the deck color palette is integrated — everything else stays identical.
 *
 * PalettePlugin = {
 *   name,                           // label (for the demo header)
 *   renderBody(cfg, api) -> html,   // full customize body HTML
 *   wireBody?(root, cfg, api),      // optional extra wiring (schemes/tabs/sheet)
 * }
 *
 * api helpers given to the plugin:
 *   api.previewHTML()      live mini-slide block (must include #livePreview)
 *   api.matrixHTML()       typography matrix block (id="matrix")
 *   api.colorTrigger(path,label,opts)  a swatch-trigger button
 *   api.applyColors(colors)            merge a scheme into cfg.colors + repaint
 *   api.rerender()         re-render the customize body
 *   api.paint()            repaint previews + status
 *   api.PALETTE            window.PALETTE_TOKENS
 */
(function () {
  const STYLE_KEYS = ["colors", "headingFontFamily", "bodyFontFamily", "roles", "bullet", "image", "connector", "background"];
  const sig = (c) => JSON.stringify(STYLE_KEYS.map((k) => c[k]));
  const clone = (c) => JSON.parse(JSON.stringify(c));

  let customPresets = [];
  let cfg, pristineSig, savingMode = false;

  function adoptPreset(themeId) {
    const t = THEMES.find((x) => x.id === themeId);
    cfg = makeConfig(themeId);
    cfg.sourceKind = "preset"; cfg.sourceId = t.id; cfg.sourceName = t.name;
    pristineSig = sig(cfg);
  }
  function adoptCustom(p) {
    cfg = clone(p.cfg);
    cfg.sourceKind = "custom"; cfg.sourceId = p.id; cfg.sourceName = p.name;
    pristineSig = sig(cfg);
  }
  const isDirty = () => sig(cfg) !== pristineSig;

  // ── previews + status ──────────────────────────────────────────────────
  function paintPreviews() {
    document.getElementById("stage").innerHTML = renderSlidePreview("content", configAsTheme(cfg), { ratio: 16/9, width: 620 });
    const lp = document.getElementById("livePreview");
    if (lp) lp.innerHTML = renderSlidePreview("title", configAsTheme(cfg), { ratio: 16/9, width: 248 });
    refreshStatus();
  }
  window.__paint = paintPreviews;

  function statusHTML() {
    const accent = cfg.colors.accent;
    if (isDirty())
      return `<span class="swatch" style="background:${accent}"></span><span class="who">Custom <small>· based on ${cfg.sourceName}</small></span><span style="margin-left:auto" class="pill unsaved">Unsaved</span>`;
    if (cfg.sourceKind === "custom")
      return `<span class="swatch" style="background:${accent}"></span><span class="who">${cfg.sourceName} <small>· your preset</small></span><span style="margin-left:auto" class="pill saved">Saved</span>`;
    return `<span class="swatch" style="background:${accent}"></span><span class="who">${cfg.sourceName} <small>· built-in preset</small></span><span style="margin-left:auto" class="pill preset">Preset</span>`;
  }
  function refreshStatus() {
    const ps = document.getElementById("presetStatus"); if (ps) ps.innerHTML = statusHTML();
    const cs = document.getElementById("custStatus"); if (cs) cs.innerHTML = statusHTML();
    renderFoot();
  }

  // ── preset view ────────────────────────────────────────────────────────
  function presetCard(t, opts = {}) {
    const active = !opts.customId && cfg.sourceKind === "preset" && cfg.sourceId === t.id;
    const activeCustom = opts.customId && cfg.sourceKind === "custom" && cfg.sourceId === opts.customId;
    const isActive = active || activeCustom;
    const modified = isActive && isDirty();
    const theme = opts.theme || t;
    return `<button class="preset" data-pick="${opts.customId ? "custom" : "preset"}" data-id="${opts.customId || t.id}" aria-pressed="${isActive}" data-modified="${modified}">
      <div class="mod">Modified</div><div class="tick">✓</div>
      <div class="thumb">${renderSlidePreview("title", theme, { ratio:16/9 })}</div>
      <div class="cap"><b>${opts.name || t.name}</b>${opts.customId ? '<span class="tagc">Custom</span>' : `<span class="palette">${["accent","onBg","muted"].map(k=>`<span style="background:${t.colors[k]}"></span>`).join("")}</span>`}</div>
    </button>`;
  }
  function renderPresets() {
    const body = document.getElementById("presetBody");
    const currentCard = isDirty()
      ? `<div class="group-label">Current</div><div class="preset-grid"><button class="preset" data-pick="current" aria-pressed="true" data-modified="true" style="grid-column:1 / -1">
           <div class="mod">Unsaved</div><div class="tick">✓</div>
           <div class="thumb">${renderSlidePreview("title", configAsTheme(cfg), { ratio:16/9, width: 480 })}</div>
           <div class="cap"><b>Custom · from ${cfg.sourceName}</b><span class="tagc">Applied · not saved</span></div></button></div>`
      : "";
    const customGroup = customPresets.length
      ? `<div class="group-label">Your presets</div><div class="preset-grid">${customPresets.map((p) => presetCard(null, { customId: p.id, name: p.name, theme: configAsTheme(p.cfg) })).join("")}</div>`
      : "";
    body.innerHTML = `${currentCard}<div class="group-label">Built-in presets</div><div class="preset-grid">${THEMES.map((t) => presetCard(t)).join("")}</div>${customGroup}`;
    body.querySelectorAll("[data-pick]").forEach((b) => b.onclick = () => {
      if (b.dataset.pick === "current") { showView("customize"); return; }
      if (b.dataset.pick === "preset") adoptPreset(b.dataset.id);
      else adoptCustom(customPresets.find((p) => p.id === b.dataset.id));
      renderPresets(); paintPreviews();
    });
  }

  // ── customize view (palette delegated to the plugin) ───────────────────
  function matrixRow(r) {
    const rc = cfg.roles[r.role];
    return `<div class="mrow">
      <span class="smp" data-color-bind="roles.${r.role}.color" style="font-family:'${rc.fontFamily}',sans-serif;font-weight:${rc.weight};color:${rc.color}">${r.label.replace("Heading ","H")}</span>
      <select data-role="${r.role}">${FONT_OPTIONS.map(f=>`<option ${rc.fontFamily===f?"selected":""}>${f}</option>`).join("")}</select>
      <input type="text" value="${rc.size}" data-size="${r.role}">
      <button class="swatch-trigger chip-only" data-color-path="roles.${r.role}.color"><span class="dot" style="background:${rc.color}"></span></button>
    </div>`;
  }
  const api = {
    get cfg() { return cfg; },
    PALETTE: window.PALETTE_TOKENS,
    SCHEMES: window.PALETTE_SCHEMES,
    previewHTML: () => `<div class="cust-preview"><div class="preview-frame" id="livePreview"></div></div>`,
    matrixHTML: () => `<div><div class="section-title" style="margin-bottom:6px">Typography</div><div class="matrix" id="matrix">${TEXT_ROLES.map(matrixRow).join("")}</div></div>`,
    colorTrigger: (path, label, opts = {}) => {
      const hex = getPath(cfg, path);
      const showHex = opts.hex !== false;
      return `<button class="swatch-trigger${opts.cls ? " " + opts.cls : ""}" data-color-path="${path}"><span class="dot" style="background:${hex}"></span>${label || ""}${showHex ? `<span class="hex">${hex.toUpperCase()}</span>` : ""}</button>`;
    },
    /** Contiguous swatch band (the brand-palette strip) for every color token. */
    paletteBand: () => `<div class="palette-band">${window.PALETTE_TOKENS.map((p) => `<button class="seg" title="${p.label} — ${p.role}" data-color-path="colors.${p.token}" data-paint-self style="background:${cfg.colors[p.token]}"></button>`).join("")}</div><div class="palette-band-labels">${window.PALETTE_TOKENS.map((p) => `<span>${p.label}</span>`).join("")}</div>`,
    /** Named swatch grid: tile + label + hex per token. `opts.exclude` omits tokens. */
    paletteGrid: (opts = {}) => {
      const ex = opts.exclude || [];
      return `<div class="palette-grid">${window.PALETTE_TOKENS.filter((p) => !ex.includes(p.token)).map((p) => `<button class="pal-tile" data-color-path="colors.${p.token}"><span class="sw dot" style="background:${cfg.colors[p.token]}"></span><span class="meta"><b>${p.label}</b><span class="hx hex">${cfg.colors[p.token].toUpperCase()}</span></span></button>`).join("")}</div>`;
    },
    applyColors: (colors) => { Object.assign(cfg.colors, colors); renderCustomize(); paintPreviews(); },
    rerender: () => renderCustomize(),
    paint: () => paintPreviews(),
  };

  function renderCustomize() {
    const host = document.getElementById("custBody");
    host.innerHTML = window.PalettePlugin.renderBody(cfg, api);
    const root = document.getElementById("view-customize");
    root.querySelectorAll("select[data-role]").forEach((s) => s.onchange = () => { cfg.roles[s.dataset.role].fontFamily = s.value; if (s.dataset.role === "h1") cfg.headingFontFamily = s.value; renderCustomize(); paintPreviews(); });
    root.querySelectorAll("input[data-size]").forEach((i) => i.onchange = () => { cfg.roles[i.dataset.size].size = +i.value || cfg.roles[i.dataset.size].size; paintPreviews(); });
    wireColorTriggers(root, cfg);
    if (window.PalettePlugin.wireBody) window.PalettePlugin.wireBody(root, cfg, api);
    paintPreviews();
  }

  // ── footer ─────────────────────────────────────────────────────────────
  function renderFoot() {
    const foot = document.getElementById("foot"); if (!foot) return;
    if (savingMode) {
      foot.innerHTML = `<div class="save-row"><input type="text" id="presetName" placeholder="Preset name" value="${cfg.sourceName} custom"><button class="btn sm" id="cancelSave">Cancel</button><button class="btn primary sm" id="confirmSave">Save</button></div>`;
      foot.querySelector("#cancelSave").onclick = () => { savingMode = false; renderFoot(); };
      foot.querySelector("#confirmSave").onclick = () => {
        const name = (foot.querySelector("#presetName").value || "Custom").trim();
        const id = "custom-" + Date.now();
        customPresets.push({ id, name, cfg: clone(cfg) });
        cfg.sourceKind = "custom"; cfg.sourceId = id; cfg.sourceName = name; pristineSig = sig(cfg);
        savingMode = false; refreshStatus();
      };
      setTimeout(() => { const n = foot.querySelector("#presetName"); if (n) n.focus(); }, 0);
      return;
    }
    const dirty = isDirty();
    foot.innerHTML = `<div style="flex:1;min-width:0"><div class="helper">${dirty ? "Changes are applied to this deck. Save to reuse them elsewhere." : "This deck is using the selected preset."}</div></div>
      <button class="btn ghost sm" id="saveBtn" ${dirty ? "" : "disabled style='opacity:.5;cursor:not-allowed'"}>Save preset</button>
      <button class="btn primary sm" id="done">Done</button>`;
    foot.querySelector("#done").onclick = () => showView("preset");
    const sb = foot.querySelector("#saveBtn");
    if (sb && dirty) sb.onclick = () => { savingMode = true; renderFoot(); };
  }

  // ── view switching + init ──────────────────────────────────────────────
  function showView(name) {
    document.getElementById("view-preset").classList.toggle("on", name === "preset");
    document.getElementById("view-customize").classList.toggle("on", name === "customize");
    if (name === "customize") renderCustomize(); else renderPresets();
    refreshStatus();
  }
  window.__showView = showView;

  window.initThemePanel = function initThemePanel(opts = {}) {
    adoptPreset(opts.theme || "indigo");
    document.getElementById("toolbar").innerHTML = toolbarHTML("theme");
    document.getElementById("goCustomize").onclick = () => showView("customize");
    document.getElementById("back").onclick = () => showView("preset");
    document.getElementById("reset").onclick = () => {
      if (cfg.sourceKind === "custom") adoptCustom(customPresets.find((p) => p.id === cfg.sourceId));
      else adoptPreset(cfg.sourceId);
      renderCustomize(); paintPreviews();
    };
    renderPresets(); paintPreviews();
    setupPopover();
  };
})();
