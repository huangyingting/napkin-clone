/**
 * Compact, beautiful color picker — a small floating panel with a
 * saturation/value square, a hue slider, a hex field, and quick swatches.
 *
 * API: openColorPicker(anchorEl, hex, swatches[], onChange(hex))
 * A single panel instance is reused and anchored near the trigger.
 */
(function () {
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  function hexToRgb(hex) {
    hex = (hex || "#000000").replace("#", "");
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    const n = parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const rgbToHex = (r, g, b) =>
    "#" + [r, g, b].map((x) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, "0")).join("");
  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return { h, s: max ? d / max : 0, v: max };
  }
  function hsvToRgb(h, s, v) {
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
  }
  const isHex = (v) => /^#?[0-9a-fA-F]{6}$/.test(v);

  let panel, sv, svThumb, hue, hueThumb, hexInput, preview, swatchWrap;
  let state = { h: 0, s: 0, v: 0 };
  let onChange = null;

  function build() {
    panel = document.createElement("div");
    panel.className = "cp-panel";
    panel.innerHTML = `
      <div class="cp-sv"><div class="cp-sv-thumb"></div></div>
      <div class="cp-hue"><div class="cp-hue-thumb"></div></div>
      <div class="cp-foot"><span class="cp-preview"></span><input class="cp-hex" type="text" maxlength="7" spellcheck="false"></div>
      <div class="cp-swatches"></div>`;
    document.body.appendChild(panel);
    sv = panel.querySelector(".cp-sv");
    svThumb = panel.querySelector(".cp-sv-thumb");
    hue = panel.querySelector(".cp-hue");
    hueThumb = panel.querySelector(".cp-hue-thumb");
    hexInput = panel.querySelector(".cp-hex");
    preview = panel.querySelector(".cp-preview");
    swatchWrap = panel.querySelector(".cp-swatches");

    bindDrag(sv, (e) => {
      const r = sv.getBoundingClientRect();
      state.s = clamp((e.clientX - r.left) / r.width, 0, 1);
      state.v = clamp(1 - (e.clientY - r.top) / r.height, 0, 1);
      emit();
    });
    bindDrag(hue, (e) => {
      const r = hue.getBoundingClientRect();
      state.h = clamp((e.clientX - r.left) / r.width, 0, 1) * 360;
      emit();
    });
    hexInput.addEventListener("input", () => {
      if (isHex(hexInput.value)) {
        const { r, g, b } = hexToRgb(hexInput.value);
        state = rgbToHsv(r, g, b);
        paint(); fire();
      }
    });
    panel.addEventListener("click", (e) => e.stopPropagation());
  }

  function bindDrag(el, handler) {
    const down = (e) => {
      e.preventDefault();
      handler(e);
      const move = (ev) => handler(ev);
      const up = () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
    };
    el.addEventListener("pointerdown", down);
  }

  function currentHex() {
    const { r, g, b } = hsvToRgb(state.h, state.s, state.v);
    return rgbToHex(r, g, b);
  }

  function paint() {
    const hueColor = `hsl(${state.h}, 100%, 50%)`;
    sv.style.background = `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0)), ${hueColor}`;
    svThumb.style.left = state.s * 100 + "%";
    svThumb.style.top = (1 - state.v) * 100 + "%";
    svThumb.style.background = currentHex();
    hueThumb.style.left = (state.h / 360) * 100 + "%";
    hueThumb.style.background = hueColor;
    const hex = currentHex();
    preview.style.background = hex;
    if (document.activeElement !== hexInput) hexInput.value = hex.toUpperCase();
  }
  function fire() { if (onChange) onChange(currentHex()); }
  function emit() { paint(); fire(); }

  function renderSwatches(swatches) {
    swatchWrap.innerHTML = "";
    (swatches || []).slice(0, 8).forEach((hex) => {
      const b = document.createElement("button");
      b.type = "button"; b.style.background = hex; b.title = hex;
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const { r, g, b: bl } = hexToRgb(hex);
        state = rgbToHsv(r, g, bl); paint(); fire();
      });
      swatchWrap.appendChild(b);
    });
  }

  function place(anchor) {
    const r = anchor.getBoundingClientRect();
    const pw = panel.offsetWidth || 196, ph = panel.offsetHeight || 220;
    let left = r.left, top = r.bottom + 6;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    if (top + ph > window.innerHeight - 8) top = r.top - ph - 6;
    panel.style.left = Math.max(8, left) + "px";
    panel.style.top = Math.max(8, top) + "px";
  }

  window.openColorPicker = function (anchor, hex, swatches, cb) {
    if (!panel) build();
    onChange = cb;
    const { r, g, b } = hexToRgb(isHex(hex) ? hex : "#888888");
    state = rgbToHsv(r, g, b);
    renderSwatches(swatches);
    panel.classList.add("on");
    paint();
    place(anchor);
  };
  window.closeColorPicker = function () { if (panel) panel.classList.remove("on"); onChange = null; };

  document.addEventListener("click", (e) => {
    if (panel && panel.classList.contains("on") && !panel.contains(e.target)) {
      // closing handled here only when clicking outside both panel and a trigger;
      // triggers stopPropagation so re-opening works.
      window.closeColorPicker();
    }
  });
  window.addEventListener("resize", () => window.closeColorPicker && window.closeColorPicker());
})();
