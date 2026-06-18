import assert from "node:assert/strict";
import test from "node:test";

import {
  isEditableTagName,
  isHelpShortcut,
  isNewDocumentShortcut,
  isTogglePreviewShortcut,
  type KeyEventLike,
} from "./match";

function key(
  k: string,
  mods: Partial<Omit<KeyEventLike, "key">> = {},
): KeyEventLike {
  return {
    key: k,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...mods,
  };
}

test("isEditableTagName matches text-entry elements and contentEditable", () => {
  assert.equal(isEditableTagName("INPUT", false), true);
  assert.equal(isEditableTagName("textarea", false), true);
  assert.equal(isEditableTagName("SELECT", false), true);
  assert.equal(isEditableTagName("div", true), true);
  assert.equal(isEditableTagName("DIV", false), false);
  assert.equal(isEditableTagName("BUTTON", false), false);
  assert.equal(isEditableTagName(null, false), false);
  assert.equal(isEditableTagName(undefined, false), false);
});

test("isHelpShortcut matches a bare ? but not with a command modifier", () => {
  assert.equal(isHelpShortcut(key("?")), true);
  assert.equal(isHelpShortcut(key("?", { shiftKey: true })), true);
  assert.equal(isHelpShortcut(key("?", { ctrlKey: true })), false);
  assert.equal(isHelpShortcut(key("?", { metaKey: true })), false);
  assert.equal(isHelpShortcut(key("/")), false);
});

test("isNewDocumentShortcut matches a bare n only", () => {
  assert.equal(isNewDocumentShortcut(key("n")), true);
  assert.equal(isNewDocumentShortcut(key("N")), true);
  assert.equal(isNewDocumentShortcut(key("n", { metaKey: true })), false);
  assert.equal(isNewDocumentShortcut(key("n", { ctrlKey: true })), false);
  assert.equal(isNewDocumentShortcut(key("n", { shiftKey: true })), false);
  assert.equal(isNewDocumentShortcut(key("m")), false);
});

test("isTogglePreviewShortcut requires Ctrl or Cmd + E", () => {
  assert.equal(isTogglePreviewShortcut(key("e", { ctrlKey: true })), true);
  assert.equal(isTogglePreviewShortcut(key("E", { metaKey: true })), true);
  assert.equal(isTogglePreviewShortcut(key("e")), false);
  assert.equal(
    isTogglePreviewShortcut(key("e", { ctrlKey: true, altKey: true })),
    false,
  );
  assert.equal(
    isTogglePreviewShortcut(key("e", { ctrlKey: true, shiftKey: true })),
    false,
  );
});
