import assert from "node:assert/strict";
import test from "node:test";

import {
  Card,
  EmptyState,
  FieldRow,
  FormField,
  IconActionCluster,
  Kbd,
  MenuItem,
  PopoverSection,
  StatusPill,
  ToolbarButton,
} from "./chrome";
import { GUTTER_BUTTON } from "./tokens";

test("ToolbarButton: composes shared toolbar chrome", () => {
  const element = ToolbarButton({
    "aria-label": "Bold",
    active: true,
    children: "B",
  });

  assert.match(element.props.className, /h-7/);
  assert.match(element.props.className, /bg-ds-accent-surface/);
  assert.match(element.props.className, /focus-visible:ring-ds-focus-ring/);
  assert.equal(element.props["aria-pressed"], true);
});

test("ToolbarButton: strips native title tooltips", () => {
  const element = ToolbarButton({
    "aria-label": "Bold",
    title: "Bold",
    children: "B",
  });

  assert.equal(element.props.title, undefined);
});

test("PopoverSection: renders a labelled section shell", () => {
  const element = PopoverSection({
    title: "Text",
    children: "items",
  });
  const [heading, children] = element.props.children;

  assert.match(element.props.className, /py-0\.5/);
  assert.equal(heading.props.children, "Text");
  assert.equal(children, "items");
});

test("FieldRow: uses label semantics when htmlFor is provided", () => {
  const element = FieldRow({
    label: "Background",
    htmlFor: "bg",
    hint: "Optional",
    children: "control",
  });
  const [label, control, hint] = element.props.children;

  assert.equal(label.type, "label");
  assert.equal(label.props.htmlFor, "bg");
  assert.equal(control, "control");
  assert.equal(hint.props.children, "Optional");
});

test("IconActionCluster: applies bordered cluster chrome by default", () => {
  const element = IconActionCluster({ children: "buttons" });

  assert.match(element.props.className, /rounded-ds-sm/);
  assert.match(element.props.className, /border-ds-border-subtle/);
});

test("StatusPill: maps semantic tones to ds status tokens", () => {
  const element = StatusPill({ tone: "danger", children: "Error" });

  assert.match(element.props.className, /bg-ds-danger-surface/);
  assert.match(element.props.className, /text-ds-danger-text/);
});

test("GUTTER_BUTTON: lives in the owned UI token module", () => {
  assert.match(GUTTER_BUTTON, /h-9 w-9/);
  assert.match(GUTTER_BUTTON, /shadow-ds-raised/);
  assert.match(GUTTER_BUTTON, /focus-visible:ring-ds-focus-ring/);
});

test("Card and EmptyState use DS chrome tokens", () => {
  const card = Card({ children: "body" });
  const empty = EmptyState({
    title: "No documents",
    description: "Create one",
  });

  assert.match(card.props.className, /bg-ds-surface-raised/);
  assert.match(card.props.className, /rounded-\[var\(--ds-radius-lg/);
  assert.match(empty.props.className, /border-dashed/);
});

test("Kbd and MenuItem expose keyboard/menu chrome", () => {
  const kbd = Kbd({ children: "⌘K" });
  const item = MenuItem({ children: "Rename" });

  assert.equal(kbd.type, "kbd");
  assert.match(kbd.props.className, /bg-ds-surface-sunken/);
  assert.match(item.props.className, /text-ds-text-secondary/);
});

test("FormField renders label, hint, and error semantics", () => {
  const element = FormField({
    label: "Name",
    htmlFor: "name",
    hint: "Shown to collaborators",
    error: "Required",
    children: "control",
  });
  const [label, control, hint, error] = element.props.children;

  assert.equal(label.type, "label");
  assert.equal(label.props.htmlFor, "name");
  assert.equal(control, "control");
  assert.equal(hint.props.children, "Shown to collaborators");
  assert.equal(error.props.role, "alert");
});
