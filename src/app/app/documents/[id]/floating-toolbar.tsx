"use client";

import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListNode,
  REMOVE_LIST_COMMAND,
} from "@lexical/list";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
  type HeadingTagType,
} from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { $getNearestNodeOfType, mergeRegister } from "@lexical/utils";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
} from "lexical";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type BlockType = "paragraph" | "h2" | "h3" | "quote" | "bullet" | "number";

type ToolbarState = {
  bold: boolean;
  italic: boolean;
  link: boolean;
  block: BlockType;
};

const INITIAL_STATE: ToolbarState = {
  bold: false,
  italic: false,
  link: false,
  block: "paragraph",
};

// Gap (px) between the text selection and the floating toolbar.
const TOOLBAR_GAP = 10;

function getSelectedBlockType(): BlockType {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return "paragraph";
  }
  const anchorNode = selection.anchor.getNode();
  const element =
    anchorNode.getKey() === "root"
      ? anchorNode
      : (anchorNode.getTopLevelElement() ?? anchorNode);

  const listNode = $getNearestNodeOfType(anchorNode, ListNode);
  if (listNode && $isListNode(listNode)) {
    return listNode.getListType() === "number" ? "number" : "bullet";
  }
  if ($isHeadingNode(element)) {
    const tag = element.getTag();
    if (tag === "h2") return "h2";
    if (tag === "h3") return "h3";
  }
  if ($isQuoteNode(element)) {
    return "quote";
  }
  return "paragraph";
}

/**
 * Floating selection toolbar. Appears above a non-collapsed text selection and
 * exposes inline (bold/italic/link) and block (H2/H3/quote/bullet/number)
 * formatting. Controls reflect the active state of the current selection and
 * hide when the selection collapses or focus leaves the editor.
 */
export function FloatingToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({
    top: -1000,
    left: -1000,
  });
  const [state, setState] = useState<ToolbarState>(INITIAL_STATE);

  const computeVisibility = useCallback(() => {
    const selection = $getSelection();
    const nativeSelection = window.getSelection();
    const rootElement = editor.getRootElement();

    if (
      selection === null ||
      !$isRangeSelection(selection) ||
      selection.isCollapsed() ||
      nativeSelection === null ||
      nativeSelection.rangeCount === 0 ||
      rootElement === null ||
      !rootElement.contains(nativeSelection.anchorNode) ||
      selection.getTextContent() === ""
    ) {
      setVisible(false);
      return;
    }

    const nodes = selection.getNodes();
    const isLink = nodes.some((node) => {
      const parent = node.getParent();
      return $isLinkNode(node) || (parent !== null && $isLinkNode(parent));
    });

    setState({
      bold: selection.hasFormat("bold"),
      italic: selection.hasFormat("italic"),
      link: isLink,
      block: getSelectedBlockType(),
    });
    setVisible(true);
  }, [editor]);

  const updatePosition = useCallback(() => {
    const toolbar = toolbarRef.current;
    const nativeSelection = window.getSelection();
    if (
      toolbar === null ||
      nativeSelection === null ||
      nativeSelection.rangeCount === 0
    ) {
      return;
    }
    const rect = nativeSelection.getRangeAt(0).getBoundingClientRect();
    const { offsetWidth, offsetHeight } = toolbar;
    let top = rect.top - offsetHeight - TOOLBAR_GAP;
    if (top < 8) {
      // Not enough room above the selection — flip below it.
      top = rect.bottom + TOOLBAR_GAP;
    }
    let left = rect.left + rect.width / 2 - offsetWidth / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - offsetWidth - 8));
    setCoords({ top, left });
  }, []);

  useEffect(() => {
    const onSelectionChange = () => {
      editor.getEditorState().read(() => {
        computeVisibility();
      });
    };

    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [editor, computeVisibility]);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          computeVisibility();
        });
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          computeVisibility();
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor, computeVisibility]);

  // Reposition on selection/visibility change and when the viewport moves.
  useLayoutEffect(() => {
    if (!visible) {
      return;
    }
    updatePosition();
    const onMove = () => updatePosition();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [visible, state, updatePosition]);

  const toggleBlock = useCallback(
    (target: "h2" | "h3" | "quote") => {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return;
        }
        const current = getSelectedBlockType();
        if (current === target) {
          $setBlocksType(selection, () => $createParagraphNode());
          return;
        }
        if (target === "quote") {
          $setBlocksType(selection, () => $createQuoteNode());
          return;
        }
        const tag: HeadingTagType = target;
        $setBlocksType(selection, () => $createHeadingNode(tag));
      });
    },
    [editor],
  );

  const toggleList = useCallback(
    (target: "bullet" | "number") => {
      const current = state.block;
      if (current === target) {
        editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
        return;
      }
      editor.dispatchCommand(
        target === "bullet"
          ? INSERT_UNORDERED_LIST_COMMAND
          : INSERT_ORDERED_LIST_COMMAND,
        undefined,
      );
    },
    [editor, state.block],
  );

  const toggleLink = useCallback(() => {
    if (state.link) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
      return;
    }
    const url = window.prompt("Enter a URL");
    if (url === null) {
      return;
    }
    const trimmed = url.trim();
    editor.dispatchCommand(
      TOGGLE_LINK_COMMAND,
      trimmed === "" ? null : trimmed,
    );
  }, [editor, state.link]);

  if (!visible || typeof document === "undefined") {
    return null;
  }

  // Keep the text selection while clicking toolbar controls.
  const keepSelection = (event: React.MouseEvent) => {
    event.preventDefault();
  };

  return createPortal(
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Text formatting"
      onMouseDown={keepSelection}
      style={{ top: coords.top, left: coords.left }}
      className="fixed z-50 flex items-center gap-0.5 rounded-xl border border-black/[.08] bg-white p-1 shadow-lg dark:border-white/[.12] dark:bg-zinc-900"
    >
      <ToolbarButton
        label="Bold"
        active={state.bold}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
      >
        <span className="font-bold">B</span>
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={state.italic}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
      >
        <span className="italic">I</span>
      </ToolbarButton>
      <ToolbarButton label="Link" active={state.link} onClick={toggleLink}>
        <span className="underline">Link</span>
      </ToolbarButton>
      <Divider />
      <ToolbarButton
        label="Heading 2"
        active={state.block === "h2"}
        onClick={() => toggleBlock("h2")}
      >
        H2
      </ToolbarButton>
      <ToolbarButton
        label="Heading 3"
        active={state.block === "h3"}
        onClick={() => toggleBlock("h3")}
      >
        H3
      </ToolbarButton>
      <ToolbarButton
        label="Quote"
        active={state.block === "quote"}
        onClick={() => toggleBlock("quote")}
      >
        &ldquo;
      </ToolbarButton>
      <Divider />
      <ToolbarButton
        label="Bullet list"
        active={state.block === "bullet"}
        onClick={() => toggleList("bullet")}
      >
        &bull;
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={state.block === "number"}
        onClick={() => toggleList("number")}
      >
        1.
      </ToolbarButton>
    </div>,
    document.body,
  );
}

function Divider() {
  return (
    <span
      aria-hidden="true"
      className="mx-0.5 h-5 w-px bg-black/[.1] dark:bg-white/[.15]"
    />
  );
}

function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      // preventDefault on pointer down keeps the editor selection intact.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm transition-colors ${
        active
          ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
          : "text-zinc-700 hover:bg-black/[.05] dark:text-zinc-200 dark:hover:bg-white/[.08]"
      }`}
    >
      {children}
    </button>
  );
}
