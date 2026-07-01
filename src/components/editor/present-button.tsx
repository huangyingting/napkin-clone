"use client";

/**
 * Present button rendered in the document editor toolbar.
 *
 * Fetches the freshest saved DeckV7 and renders it through PresentModeVNext.
 * Missing deck JSON starts a native blank DeckV7; invalid non-empty deck JSON
 * renders recovery diagnostics instead of silently presenting a blank deck.
 *
 * The present mode is read-only; it never mutates Lexical/Yjs state.
 */

import { MonitorPlay } from "lucide-react";
import { useCallback, useState } from "react";

import { PresentModeVNext } from "@/components/presentation-vnext/present-mode-vnext";
import { EditorToolbarButton } from "@/components/editor/toolbar-button";
import type { DeckFetchPort } from "@/lib/action-ports";
import type { PresentationDiagnostic } from "@/lib/presentation-vnext/diagnostics";
import { createBlankDeckV7 } from "@/lib/presentation-vnext/empty-deck";
import { decideDeckOpen } from "@/lib/presentation-vnext/open-deck";
import type { DeckV7 } from "@/lib/presentation-vnext/schema";
import type { ThemePackageV1 } from "@/lib/presentation-vnext/theme-package-schema";
import { resolveThemePackageForDeck } from "@/lib/presentation-vnext/theme-package-registry";

interface PresentButtonProps {
  documentId: string;
  deckPort: DeckFetchPort;
  initialDeckJson: unknown;
  documentTitle?: string;
  iconOnly?: boolean;
}

type PresentData =
  | {
      mode: "deck";
      deck: DeckV7;
      themePackage: ThemePackageV1;
    }
  | PresentRecoveryData;

type PresentRecoveryData = {
  mode: "recovery";
  error: string;
  diagnostics: PresentationDiagnostic[];
  validationErrors?: string[];
};

function PresentOpenRecovery({
  recovery,
  onClose,
}: {
  recovery: PresentRecoveryData;
  onClose: () => void;
}) {
  const details = [
    ...recovery.diagnostics.map((diagnostic) => diagnostic.message),
    ...(recovery.validationErrors ?? []),
  ];
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="present-recovery-title"
      className="fixed inset-0 z-modal flex items-center justify-center bg-ds-backdrop p-6"
    >
      <section className="max-w-xl rounded-ds-lg border border-ds-border-subtle bg-ds-surface-overlay p-5 shadow-ds-overlay">
        <h2
          id="present-recovery-title"
          className="text-lg font-semibold text-ds-text-primary"
        >
          Presentation deck could not be opened
        </h2>
        <p className="mt-2 text-sm text-ds-text-secondary">{recovery.error}</p>
        {details.length > 0 ? (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-ds-text-secondary">
            {details.slice(0, 6).map((detail, index) => (
              <li key={`${detail}-${index}`}>{detail}</li>
            ))}
          </ul>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="mt-5 rounded-ds-sm bg-ds-accent px-3 py-2 text-sm font-medium text-ds-text-on-accent"
        >
          Close
        </button>
      </section>
    </div>
  );
}

/**
 * A toolbar button that opens the in-app Present mode for the current document.
 *
 * Placed in the editor header alongside Export and Share. On click it prefers
 * the saved DeckV7 before rendering {@link PresentModeVNext}.
 */
export function PresentButton({
  documentId,
  deckPort,
  initialDeckJson,
  documentTitle,
  iconOnly = false,
}: PresentButtonProps) {
  const [presentData, setPresentData] = useState<PresentData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handlePresent = useCallback(async () => {
    let fetchedRaw: unknown = null;
    setIsLoading(true);
    try {
      const fetched = await deckPort.fetchDeckJson(documentId);
      if (fetched.ok) {
        fetchedRaw = fetched.deckJson;
      }
    } catch {
      // Network/auth error: fall back to page-load deckJson, then blank v7.
    } finally {
      setIsLoading(false);
    }

    const candidate = fetchedRaw ?? initialDeckJson ?? null;
    const decision = decideDeckOpen(candidate);
    if (decision.mode === "recovery") {
      setPresentData({
        mode: "recovery",
        error: decision.error,
        diagnostics: decision.diagnostics,
        validationErrors: decision.errors,
      });
      return;
    }
    const deck =
      decision.mode === "open"
        ? decision.deck
        : createBlankDeckV7({ documentId, title: documentTitle });
    const themeResolution = resolveThemePackageForDeck(deck);
    setPresentData({
      mode: "deck",
      deck,
      themePackage: themeResolution.package,
    });
  }, [deckPort, documentId, documentTitle, initialDeckJson]);

  const handleClose = useCallback(() => {
    setPresentData(null);
  }, []);

  return (
    <>
      <EditorToolbarButton
        label="Present"
        tooltip="Present fullscreen"
        icon={<MonitorPlay size={15} aria-hidden="true" />}
        iconOnly={iconOnly}
        onClick={handlePresent}
        disabled={isLoading}
        aria-label={`Present ${documentTitle ?? "document"}`}
      />

      {presentData?.mode === "deck" ? (
        <PresentModeVNext
          deck={presentData.deck}
          themePackage={presentData.themePackage}
          onClose={handleClose}
        />
      ) : null}

      {presentData?.mode === "recovery" ? (
        <PresentOpenRecovery recovery={presentData} onClose={handleClose} />
      ) : null}
    </>
  );
}
