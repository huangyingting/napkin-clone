"use client";

import { Fragment, type ReactNode } from "react";

export type CoreEditorPlugin = {
  id: string;
  render(): ReactNode;
};

export function createEditorPlugin(
  id: string,
  render: () => ReactNode,
): CoreEditorPlugin {
  return { id, render };
}

export function EditorPluginHost({
  plugins,
}: {
  plugins: readonly CoreEditorPlugin[];
}) {
  return (
    <>
      {plugins.map((plugin) => (
        <Fragment key={plugin.id}>{plugin.render()}</Fragment>
      ))}
    </>
  );
}
