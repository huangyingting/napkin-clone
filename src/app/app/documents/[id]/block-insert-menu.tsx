"use client";

import { INSERT_HORIZONTAL_RULE_COMMAND } from "@lexical/react/LexicalHorizontalRuleNode";
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from "@lexical/list";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createHeadingNode,
  $createQuoteNode,
  type HeadingTagType,
} from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { mergeRegister } from "@lexical/utils";
import {
  $createParagraphNode,
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  SELECTION_CHANGE_COMMAND,
  COMMAND_PRIORITY_LOW,
} from "lexical";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ItemKey = "h2" | "h3" | "bullet" | "number" | "quote" | "divider";

type InsertItem = {
  key: ItemKey;
  title: string;
  hint: string;
  keywords: string[];
};

const ITEMS: InsertItem[] = [
  {
    key: "h2",
    title: "Heading 2",
    hint: "Section heading",
    keywords: ["heading", "h2", "title", "subtitle"],
  },
  {
    key: "h3",
    title: "Heading 3",
    hint: "Sub-section heading",
    keywords: ["heading", "h3", "subtitle"],
  },
  {
    key: "bullet",
    title: "Bullet list",
    hint: "Unordered list",
    keywords: ["bullet", "unordered", "list", "ul"],
  },
  {
    key: "number",
    title: "Numbered list",
    hint: "Ordered list",
    keywords: ["numbered", "ordered", "list", "ol"],
  },
  {
    key: "quote",
    title: "Quote",
    hint: "Block quote",
    keywords: ["quote", "blockquote", "citation"],
  },
  {
    key: "divider",
    title: "Divider",
    hint: "Horizontal rule",
    keywords: ["divider", "hr", "horizontal", "rule", "separator"],
  },
];

function filterItems(query: string): InsertItem[] {
  const q = query.trim().toLowerCase();
  if (q === "") {
    return ITEMS;
  }
  return ITEMS.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.keywords.some((keyword) => keyword.includes(q)),
  );
}

type BlockInfo = {
  key: string;
  top: number;
  left: number;
  bottom: number;
  height: number;
};

type MenuState = {
  mode: "plus" | "slash";
  top: number;
  left: number;
};

// Gap (px) between the anchored block and the menu / gutter button.
const MENU_GAP = 6;

/**
 * Ghost-style block insertion affordances for the Lexical editor:
 *  - A "+" button in the gutter of an empty paragraph that opens an insert menu.
 *  - Typing "/" at the start of an empty paragraph opens the same menu, filtered
 *    by the typed text.
 *
 * The menu lists the core block types (Heading 2/3, Bullet list, Numbered list,
 * Quote, Divider). Choosing an item transforms the current block and returns
 * focus to the editor. The menu is keyboard-navigable (arrow keys + Enter) and
 * closes on Escape. The "/" flow keeps editor focus (so typing keeps filtering)
 * and is driven by Lexical key commands; the "+" flow focuses the menu and is
 * driven by a local key handler.
 */
export function BlockInsertMenuPlugin() {
  const [editor] = useLexicalComposerContext();

  const [block, setBlock] = useState<BlockInfo | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const menuRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(
    () => (menu?.mode === "slash" ? filterItems(query) : ITEMS),
    [menu?.mode, query],
  );
  const safeActive =
    filtered.length === 0 ? 0 : Math.min(activeIndex, filtered.length - 1);

  // Refs kept in sync for the Lexical key-command handlers (which capture stale
  // closures otherwise). Assigning in an effect keeps `react-hooks/refs` happy.
  const slashOpenRef = useRef(false);
  const filteredRef = useRef(filtered);
  const activeIndexRef = useRef(safeActive);
  useEffect(() => {
    slashOpenRef.current = menu?.mode === "slash";
    filteredRef.current = filtered;
    activeIndexRef.current = safeActive;
  });

  const closeMenu = useCallback(() => {
    setMenu(null);
    setQuery("");
    setActiveIndex(0);
  }, []);

  const applyBlock = useCallback(
    (itemKey: ItemKey, blockKey?: string) => {
      editor.update(() => {
        let top: ReturnType<typeof $getNodeByKey> = null;
        if (blockKey) {
          const node = $getNodeByKey(blockKey);
          top = node
            ? $isElementNode(node)
              ? node
              : node.getTopLevelElement()
            : null;
        } else {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            top = selection.anchor.getNode().getTopLevelElement();
          }
        }
        if (top === null || !$isElementNode(top)) {
          return;
        }
        // Replace the current block with a fresh empty paragraph. This both
        // clears any "/filter" trigger text and gives the block transforms a
        // clean range selection to operate on.
        const paragraph = $createParagraphNode();
        top.replace(paragraph);
        paragraph.select();

        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return;
        }
        if (itemKey === "h2" || itemKey === "h3") {
          const tag: HeadingTagType = itemKey;
          $setBlocksType(selection, () => $createHeadingNode(tag));
        } else if (itemKey === "quote") {
          $setBlocksType(selection, () => $createQuoteNode());
        }
      });

      if (itemKey === "bullet") {
        editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
      } else if (itemKey === "number") {
        editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
      } else if (itemKey === "divider") {
        editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined);
      }

      closeMenu();
      editor.focus();
    },
    [editor, closeMenu],
  );

  // Recompute the active block (for the "+" gutter button) and detect the "/"
  // slash trigger on every editor update / selection change.
  useEffect(() => {
    const recompute = () => {
      const info = editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return null;
        }
        const anchor = selection.anchor.getNode();
        if (anchor.getKey() === "root") {
          return null;
        }
        const topLevel = anchor.getTopLevelElement();
        if (topLevel === null) {
          return null;
        }
        return {
          key: topLevel.getKey(),
          text: topLevel.getTextContent(),
          type: topLevel.getType(),
        };
      });

      if (info === null) {
        setBlock(null);
        if (slashOpenRef.current) {
          closeMenu();
        }
        return;
      }

      const element = editor.getElementByKey(info.key);
      const rect = element?.getBoundingClientRect() ?? null;

      const isEmpty = info.text.trim() === "";
      const slashMatch = /^\/(\S*)$/.exec(info.text);

      // The "+" gutter button only shows on an empty paragraph; the "/" menu can
      // be triggered from any empty single-block (paragraph, heading, quote, …).
      if (rect !== null) {
        setBlock(
          isEmpty && info.type === "paragraph"
            ? {
                key: info.key,
                top: rect.top,
                left: rect.left,
                bottom: rect.bottom,
                height: rect.height,
              }
            : null,
        );
      } else {
        setBlock(null);
      }

      if (slashMatch && rect !== null) {
        const nextQuery = slashMatch[1];
        if (filterItems(nextQuery).length === 0) {
          // No matching block — behave like normal text.
          if (slashOpenRef.current) {
            closeMenu();
          }
          return;
        }
        setQuery(nextQuery);
        setActiveIndex(0);
        setMenu({
          mode: "slash",
          top: rect.bottom + MENU_GAP,
          left: rect.left,
        });
      } else if (slashOpenRef.current) {
        closeMenu();
      }
    };

    return mergeRegister(
      editor.registerUpdateListener(() => recompute()),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          recompute();
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor, closeMenu]);

  // Keyboard navigation for the "/" slash menu (editor keeps focus).
  useEffect(() => {
    const move = (delta: number) => {
      const len = filteredRef.current.length;
      if (len === 0) {
        return;
      }
      setActiveIndex((index) => (index + delta + len) % len);
    };

    return mergeRegister(
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        (event) => {
          if (!slashOpenRef.current) {
            return false;
          }
          event?.preventDefault();
          move(1);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        (event) => {
          if (!slashOpenRef.current) {
            return false;
          }
          event?.preventDefault();
          move(-1);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (!slashOpenRef.current) {
            return false;
          }
          const item = filteredRef.current[activeIndexRef.current];
          if (item === undefined) {
            return false;
          }
          event?.preventDefault();
          applyBlock(item.key);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          if (!slashOpenRef.current) {
            return false;
          }
          closeMenu();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [editor, applyBlock, closeMenu]);

  // Focus the menu when opened via the "+" button so it can be keyboard-driven;
  // the "/" flow deliberately keeps focus in the editor.
  useEffect(() => {
    if (menu?.mode === "plus") {
      menuRef.current?.focus();
    }
  }, [menu?.mode]);

  // Close the "+" menu on an outside click. (The "/" menu closes via the editor
  // selection listener instead.)
  useEffect(() => {
    if (menu?.mode !== "plus") {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        closeMenu();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [menu?.mode, closeMenu]);

  const openPlusMenu = useCallback(() => {
    if (block === null) {
      return;
    }
    setQuery("");
    setActiveIndex(0);
    setMenu({
      mode: "plus",
      top: block.bottom + MENU_GAP,
      left: block.left,
    });
  }, [block]);

  const onMenuKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (menu?.mode !== "plus") {
        return;
      }
      const len = filtered.length;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (len > 0) {
          setActiveIndex((index) => (index + 1) % len);
        }
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (len > 0) {
          setActiveIndex((index) => (index - 1 + len) % len);
        }
      } else if (event.key === "Enter") {
        event.preventDefault();
        const item = filtered[safeActive];
        if (item) {
          applyBlock(item.key, block?.key);
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        editor.focus();
      }
    },
    [
      menu?.mode,
      filtered,
      safeActive,
      applyBlock,
      block?.key,
      closeMenu,
      editor,
    ],
  );

  if (typeof document === "undefined") {
    return null;
  }

  return (
    <>
      {block !== null && menu === null
        ? createPortal(
            <button
              type="button"
              aria-label="Insert block"
              onMouseDown={(event) => event.preventDefault()}
              onClick={openPlusMenu}
              style={{
                top: block.top + block.height / 2 - 14,
                left: block.left - 34,
              }}
              className="fixed z-40 flex h-7 w-7 items-center justify-center rounded-lg border border-black/[.08] bg-white text-zinc-500 shadow-sm transition-colors hover:bg-black/[.04] hover:text-zinc-900 dark:border-white/[.12] dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[.08] dark:hover:text-zinc-100"
            >
              <svg
                viewBox="0 0 16 16"
                aria-hidden="true"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              >
                <path d="M8 3v10M3 8h10" />
              </svg>
            </button>,
            document.body,
          )
        : null}

      {menu !== null
        ? createPortal(
            <div
              ref={menuRef}
              role="listbox"
              aria-label="Insert block"
              tabIndex={-1}
              onKeyDown={onMenuKeyDown}
              onMouseDown={(event) => event.preventDefault()}
              style={{ top: menu.top, left: menu.left }}
              className="fixed z-50 max-h-72 w-64 overflow-auto rounded-xl border border-black/[.08] bg-white p-1 shadow-lg outline-none dark:border-white/[.12] dark:bg-zinc-900"
            >
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">
                  No matching blocks
                </div>
              ) : (
                filtered.map((item, index) => (
                  <button
                    key={item.key}
                    type="button"
                    role="option"
                    aria-selected={index === safeActive}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() =>
                      applyBlock(
                        item.key,
                        menu.mode === "plus" ? block?.key : undefined,
                      )
                    }
                    className={`flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left transition-colors ${
                      index === safeActive
                        ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                        : "text-zinc-700 hover:bg-black/[.05] dark:text-zinc-200 dark:hover:bg-white/[.08]"
                    }`}
                  >
                    <span className="text-sm font-medium">{item.title}</span>
                    <span
                      className={`text-xs ${
                        index === safeActive
                          ? "text-white/70 dark:text-zinc-900/70"
                          : "text-zinc-500 dark:text-zinc-400"
                      }`}
                    >
                      {item.hint}
                    </span>
                  </button>
                ))
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
