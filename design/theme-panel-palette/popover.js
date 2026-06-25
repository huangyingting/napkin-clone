/**
 * Opens/anchors the compact theme popover under the toolbar "Theme" button,
 * like the real Popover primitive. Starts open so reviewers see the panel.
 */
window.setupPopover = function setupPopover(opts = {}) {
  const frame = document.querySelector(".editor-frame");
  const pop = document.getElementById(opts.popId || "pop");
  const toolbar = document.getElementById("toolbar");
  if (!frame || !pop || !toolbar) return;
  const themeBtn = toolbar.querySelector('[data-tb="theme"]');

  function place() {
    const fr = frame.getBoundingClientRect();
    const br = themeBtn.getBoundingClientRect();
    const popW = pop.offsetWidth || 268;
    let left = br.left - fr.left;
    const maxLeft = frame.clientWidth - popW - 12;
    if (left > maxLeft) left = Math.max(12, maxLeft);
    pop.style.top = br.bottom - fr.top + 6 + "px";
    pop.style.left = left + "px";
  }
  function open() { pop.style.display = "block"; themeBtn.setAttribute("aria-expanded", "true"); themeBtn.classList.add("active"); place(); }
  function close() { pop.style.display = "none"; themeBtn.setAttribute("aria-expanded", "false"); if (window.closeColorPicker) window.closeColorPicker(); }
  window.__closeThemePopover = close;

  themeBtn.addEventListener("click", (e) => { e.stopPropagation(); pop.style.display === "none" ? open() : close(); });
  toolbar.querySelectorAll('.tb-btn:not([data-tb="theme"])').forEach((b) => b.addEventListener("click", close));
  document.addEventListener("click", (e) => {
    const cp = document.querySelector(".cp-panel");
    const inPicker = cp && cp.contains(e.target);
    if (pop.style.display !== "none" && !pop.contains(e.target) && e.target !== themeBtn && !themeBtn.contains(e.target) && !inPicker) close();
  });
  window.addEventListener("resize", () => { if (pop.style.display !== "none") place(); });
  open();
};
