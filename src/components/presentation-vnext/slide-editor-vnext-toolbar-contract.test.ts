import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { MIN_DECK_SLIDES_MESSAGE } from "@/lib/presentation-vnext";
import { buildDeckV7, buildMinimalDeckV7 } from "@/test/builders/deck-v7";
import { deleteActiveSlideFromToolbar } from "./slide-editor-vnext";

const source = readFileSync(
  new URL("./slide-editor-vnext.tsx", import.meta.url),
  "utf8",
);

describe("SlideEditorVNext toolbar command ownership", () => {
  test("exposes the top command row as a named editing toolbar landmark", () => {
    assert.match(
      source,
      /<header[\s\S]*role="toolbar"[\s\S]*aria-label="Slide editing tools"/,
    );
  });

  test("renders deck chrome in the top toolbar as a keyboard-focusable dialog command", () => {
    assert.match(
      source,
      /aria-haspopup="dialog"[\s\S]*aria-label="Deck chrome"[\s\S]*setDeckChromeToolbarOpen\(\(open\) => !open\)/,
    );
    assert.equal(source.includes('aria-label="Deck chrome controls"'), true);
  });

  test("routes toolbar deck chrome updates through existing deck and slide patch handlers", () => {
    assert.match(
      source,
      /<DeckChromePanel[\s\S]*onUpdateChrome={handleUpdateDeckChrome}[\s\S]*onUpdateSlideProps={handleUpdateProps}/,
    );
  });

  test("compacts secondary toolbar commands behind a More menu on narrow viewports", () => {
    assert.equal(
      source.includes("const isCompactToolbar = !isDesktopInspectorViewport;"),
      true,
    );
    assert.equal(
      source.includes('aria-label="Open additional toolbar commands"'),
      true,
    );
    assert.equal(source.includes('aria-label="More toolbar commands"'), true);
  });

  test("keeps compact toolbar menu keyboard navigable", () => {
    assert.equal(
      source.includes(
        "focusFirstMenuCommand(compactToolbarMenuPanelRef.current)",
      ),
      true,
    );
    assert.equal(
      source.includes("onKeyDown={handleCompactToolbarMenuKeyDown}"),
      true,
    );
    assert.equal(
      source.includes("closeCompactToolbarMenuAndRestoreFocus();"),
      true,
    );
  });

  test("preserves compact access to theme, ratio, diagnostics, and export actions", () => {
    assert.match(
      source,
      /aria-label="More toolbar commands"[\s\S]*Theme[\s\S]*Ratio[\s\S]*Diagnostics[\s\S]*Export PPTX/,
    );
    assert.match(
      source,
      /aria-label="Document source"[\s\S]*aria-label="Save slide deck"[\s\S]*aria-label="Close slide editor"/,
    );
  });

  test("exposes a pressed-state snap toggle in the top toolbar", () => {
    assert.equal(source.includes('aria-label="Toggle snap to guides"'), true);
    assert.equal(source.includes("aria-pressed={snapToGuides}"), true);
    assert.equal(source.includes("onClick={toggleSnapToGuides}"), true);
  });

  test("gates move and resize guide snapping behind snap state", () => {
    assert.equal(
      source.includes("snapToGuides: snapToGuides && !moveEvent.altKey"),
      true,
    );
    assert.match(
      source,
      /snapToGuides && !moveEvent\.altKey[\s\S]*snapFrameToStageGuides/,
    );
  });

  test("removes generic element insertion from the top toolbar", () => {
    assert.equal(source.includes('aria-label="Insert element"'), false);
  });

  test("passes insertion handlers to the current-object context toolbar", () => {
    assert.equal(source.includes("onInsertText={handleInsertText}"), true);
    assert.equal(source.includes("onInsertShape={handleInsertShape}"), true);
    assert.equal(source.includes("onInsertImage={handleInsertImage}"), true);
    assert.equal(
      source.includes("onInsertVisual={() => void handleInsertVisual()}"),
      true,
    );
    assert.equal(
      source.includes("onInsertConnector={handleInsertConnector}"),
      true,
    );
    assert.equal(source.includes("onInsertTable={handleInsertTable}"), true);
  });

  test("passes delete availability to the current-object context toolbar", () => {
    assert.equal(
      source.includes("canDeleteSlide={deck.slides.length > 1}"),
      true,
    );
  });

  test("wires keyboard shortcut help button to the shared dialog surface", () => {
    assert.equal(
      source.includes("onClick={() => setShortcutHelpOpen(true)}"),
      true,
    );
    assert.equal(source.includes('aria-label="Keyboard shortcuts"'), true);
    assert.equal(
      source.includes(
        "<KeyboardShortcutHelpDialog\n        open={shortcutHelpOpen}",
      ),
      true,
    );
  });

  test("gives zoom and status popovers menu trigger semantics", () => {
    assert.equal(
      source.includes("aria-label={`Set slide zoom (${stageZoomPercent}%)`}"),
      true,
    );
    assert.equal(
      source.includes("aria-controls={zoomMenuOpen ? zoomMenuId : undefined}"),
      true,
    );
    assert.equal(
      source.includes(
        "aria-label={`Footer status: ${saveStatusLabel}. ${diagnosticSummary}.`}",
      ),
      true,
    );
    assert.equal(
      source.includes("footerStatusMenuOpen ? footerStatusMenuId : undefined"),
      true,
    );
    assert.equal(source.includes('aria-haspopup="menu"'), true);
    assert.equal(source.includes('role="menu"'), true);
  });

  test("routes toolbar menu keyboard handling through menu command helpers", () => {
    assert.equal(
      source.includes("focusFirstMenuCommand(zoomMenuPanelRef.current)"),
      true,
    );
    assert.equal(
      source.includes(
        "focusFirstMenuCommand(footerStatusMenuPanelRef.current)",
      ),
      true,
    );
    assert.equal(source.includes("onKeyDown={handleZoomMenuKeyDown}"), true);
    assert.equal(
      source.includes("onKeyDown={handleFooterStatusMenuKeyDown}"),
      true,
    );
    assert.equal(source.includes("moveMenuCommandFocus({"), true);
    assert.equal(source.includes("closeZoomMenuAndRestoreFocus();"), true);
    assert.equal(
      source.includes("closeFooterStatusMenuAndRestoreFocus();"),
      true,
    );
  });

  test("marks zoom and status commands with menu item roles", () => {
    assert.equal(source.includes('role="menuitemradio"'), true);
    assert.equal(source.includes('role="menuitem"'), true);
  });

  test("exposes present/share roundtrip commands in the top toolbar", () => {
    assert.equal(source.includes('aria-label="Present slides"'), true);
    assert.equal(source.includes('aria-label="Share slides"'), true);
    assert.equal(
      source.includes("void handleRoundtripAction(") &&
        source.includes("onPresent") &&
        source.includes("onShare"),
      true,
    );
  });

  test("routes present/share actions through explicit save-first handling", () => {
    assert.equal(
      source.includes("async function handleRoundtripAction(") &&
        source.includes("if (onSave)") &&
        source.includes("const saveResult = await onSave(deck);") &&
        source.includes("if (!saveResult.ok)"),
      true,
    );
  });
});

describe("deleteActiveSlideFromToolbar", () => {
  test("returns invariant status for one-slide decks", () => {
    const deck = buildMinimalDeckV7();
    const result = deleteActiveSlideFromToolbar(deck, deck.slides[0]?.id);

    assert.equal(result.deleted, false);
    assert.equal(result.nextDeck, deck);
    assert.equal(result.nextIndex, 0);
    assert.equal(result.statusMessage, MIN_DECK_SLIDES_MESSAGE);
  });

  test("deletes active slide and advances to the next valid index", () => {
    const deck = buildDeckV7();
    const deletingSlideId = deck.slides[1]!.id;
    const result = deleteActiveSlideFromToolbar(deck, deletingSlideId);

    assert.equal(result.deleted, true);
    assert.equal(result.nextDeck.slides.length, deck.slides.length - 1);
    assert.equal(
      result.nextDeck.slides.some((slide) => slide.id === deletingSlideId),
      false,
    );
    assert.equal(result.nextIndex, 0);
    assert.equal(result.statusMessage, undefined);
  });
});
