"use client";

/**
 * Present button rendered in the document editor toolbar.
 *
 * Fetches the freshest saved DeckV7 and renders it through PresentModeVNext.
 * Invalid or missing deck JSON falls back to a native blank DeckV7.
 *
 * The present mode is read-only; it never mutates Lexical/Yjs state.
 */

import { MonitorPlay } from "lucide-react";
import { useCallback, useState } from "react";

import { PresentModeVNext } from "@/components/presentation-vnext/present-mode-vnext";
import { EditorToolbarButton } from "@/components/editor/toolbar-button";
import type { DeckFetchPort } from "@/lib/action-ports";
import {
  createBlankDeckV7,
  openDeckFromJson,
  resolveThemePackageForDeck,
  type DeckV7,
  type ThemePackageV1,
} from "@/lib/presentation-vnext";

interface PresentButtonProps {
  documentId: string;
  deckPort: DeckFetchPort;
  initialDeckJson: unknown;
  documentTitle?: string;
  iconOnly?: boolean;
}

type PresentData = {
  deck: DeckV7;
  themePackage: ThemePackageV1;
};

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
      fetchedRaw = (await deckPort.fetchDeckJson(documentId)).deckJson;
    } catch {
      // Network/auth error: fall back to page-load deckJson, then blank v7.
    } finally {
      setIsLoading(false);
    }

    const candidate = fetchedRaw ?? initialDeckJson;
    const opened = openDeckFromJson(candidate);
    const deck = opened.ok
      ? opened.deck
      : createBlankDeckV7({ documentId, title: documentTitle });
    const themeResolution = resolveThemePackageForDeck(deck);
    setPresentData({
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

      {presentData ? (
        <PresentModeVNext
          deck={presentData.deck}
          themePackage={presentData.themePackage}
          onClose={handleClose}
        />
      ) : null}
    </>
  );
}
