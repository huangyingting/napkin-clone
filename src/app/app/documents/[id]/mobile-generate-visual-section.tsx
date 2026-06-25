"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { AnimatePresence, motion } from "framer-motion";
import { $getNodeByKey, $isElementNode } from "lexical";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo } from "react";

import {
  GeneratingIndicator,
  VisualSkeleton,
} from "@/components/motion/generation-status";
import { Button, cx } from "@/components/ui";
import { FOCUS_RING } from "@/components/ui/tokens";
import { VisualRenderer } from "@/components/visual/visual-renderer";
import { useEditorContext } from "@/lib/lexical/editor-context";
import { generateTargetForContext } from "@/lib/visual/generate";
import type { Visual } from "@/lib/visual/schema";

import { $createVisualNode } from "@/lib/lexical/visual-node";
import { useVisualGeneration } from "./use-visual-generation";

export function GenerateVisualSection() {
  const [editor] = useLexicalComposerContext();
  const ctx = useEditorContext();
  const target = useMemo(() => generateTargetForContext(ctx), [ctx]);
  const {
    status,
    error,
    creditError,
    generatedVisualsBySection,
    generate,
    setGeneratedVisualsBySection,
    stampGeneratedVisual,
  } = useVisualGeneration();
  const candidates = generatedVisualsBySection.ai ?? [];

  const runGenerate = useCallback(async () => {
    if (!target) return;
    await generate(target, { append: false });
  }, [generate, target]);

  const insertVisual = useCallback(
    (visual: Visual) => {
      if (!target) return;
      const toInsert = stampGeneratedVisual(visual);
      editor.update(() => {
        const top = $getNodeByKey(target.blockKey);
        if (top === null || !$isElementNode(top)) {
          return;
        }
        top.insertAfter($createVisualNode(toInsert));
      });
      setGeneratedVisualsBySection({});
      editor.focus();
    },
    [editor, target, setGeneratedVisualsBySection, stampGeneratedVisual],
  );

  if (!target) return null;

  return (
    <div className="border-b border-[var(--ds-border-subtle,rgba(0,0,0,0.08))] p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted,#6f7d83)]">
        Turn text into a visual
      </p>

      <Button
        size="sm"
        variant="solid"
        leadingIcon={<Sparkles aria-hidden="true" className="h-3.5 w-3.5" />}
        onClick={() => void runGenerate()}
        disabled={status === "loading"}
        className="w-full"
      >
        {status === "loading"
          ? "Generating…"
          : candidates.length > 0
            ? "Regenerate"
            : "Generate visual"}
      </Button>

      <div className="mt-2">
        <AnimatePresence mode="wait">
          {status === "loading" ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="space-y-2"
            >
              <ul className="grid grid-cols-2 gap-2">
                {[0, 1].map((i) => (
                  <li key={i}>
                    <VisualSkeleton />
                  </li>
                ))}
              </ul>
              <GeneratingIndicator
                isLoading
                className="px-1 py-1 text-sm text-[var(--ds-text-muted,#71717a)]"
              />
            </motion.div>
          ) : error !== null ? (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              role="alert"
              className="flex flex-col items-start gap-2 px-1 py-2 text-sm text-[var(--ds-danger,#dc2626)]"
            >
              <span>{error}</span>
              {creditError ? (
                <Link
                  href="/app/settings/billing"
                  className="inline-flex items-center rounded-[var(--ds-radius-sm,6px)] bg-[var(--ds-accent,#6366f1)] px-3 py-1.5 text-sm font-medium text-[var(--ds-text-on-accent,#fff)] transition hover:opacity-90"
                >
                  Upgrade
                </Link>
              ) : (
                <Button
                  size="sm"
                  variant="subtle"
                  onClick={() => void runGenerate()}
                >
                  Try again
                </Button>
              )}
            </motion.div>
          ) : candidates.length > 0 ? (
            <motion.ul
              key="candidates"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-2 gap-2"
            >
              {candidates.map((candidate, index) => (
                <li key={index}>
                  <button
                    type="button"
                    aria-label={`Insert variation ${index + 1} of ${candidates.length}`}
                    onClick={() => insertVisual(candidate)}
                    className={cx(
                      "group flex w-full flex-col overflow-hidden rounded-[var(--ds-radius-md,10px)] border border-[var(--ds-border-subtle,rgba(0,0,0,0.08))] bg-[var(--ds-surface-base,#ffffff)] p-1.5 text-left transition-colors hover:border-[var(--ds-border-strong,rgba(0,0,0,0.2))]",
                      FOCUS_RING,
                    )}
                  >
                    <VisualRenderer
                      visual={candidate}
                      className="h-auto w-full"
                    />
                  </button>
                </li>
              ))}
            </motion.ul>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
