"use client";

import { Share2 } from "lucide-react";
import { useState } from "react";

import { EditorToolbarButton } from "@/components/editor/toolbar-button";
import { Popover } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { buildShareSegment } from "@/lib/slug";
import { SocialShareMenu } from "@/components/share/social-share-menu";

import {
  regenerateShareLink,
  toggleDocumentSharing,
  updateSharePolicy,
} from "./actions";
import type { ShareSettings } from "@/lib/document/persistence-types";

type ShareState = {
  isShared: boolean;
  shareId: string | null;
  slug: string | null;
  shareUrl: string | null;
  expiresAt: string | null;
  embedEnabled: boolean;
  presentEnabled: boolean;
};

/** Builds the displayed share URL from the current origin + shareId/slug. */
function shareUrlFor(
  shareId: string | null,
  slug: string | null,
): string | null {
  if (!shareId) {
    return null;
  }
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/share/${buildShareSegment(slug, shareId)}`;
}

/** Maps the server {@link ShareSettings} into the client-rendered state. */
function toShareState(settings: ShareSettings): ShareState {
  return {
    isShared: settings.isShared,
    shareId: settings.shareId,
    slug: settings.slug,
    shareUrl: shareUrlFor(settings.shareId, settings.slug),
    expiresAt: settings.expiresAt,
    embedEnabled: settings.embedEnabled,
    presentEnabled: settings.presentEnabled,
  };
}

/**
 * Converts an ISO-8601 instant to the `YYYY-MM-DDTHH:mm` value a
 * `datetime-local` input expects (in the visitor's local time zone).
 */
function isoToLocalInput(iso: string | null): string {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function ShareButton({
  id,
  initialIsShared,
  initialShareId,
  initialSlug = null,
  initialExpiresAt = null,
  initialEmbedEnabled = true,
  initialPresentEnabled = true,
  documentTitle = "Untitled",
  iconOnly = false,
}: {
  id: string;
  initialIsShared: boolean;
  initialShareId: string | null;
  initialSlug?: string | null;
  initialExpiresAt?: string | null;
  initialEmbedEnabled?: boolean;
  initialPresentEnabled?: boolean;
  documentTitle?: string;
  iconOnly?: boolean;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [shareState, setShareState] = useState<ShareState>({
    isShared: initialIsShared,
    shareId: initialShareId,
    slug: initialSlug,
    shareUrl: initialIsShared ? shareUrlFor(initialShareId, initialSlug) : null,
    expiresAt: initialExpiresAt,
    embedEnabled: initialEmbedEnabled,
    presentEnabled: initialPresentEnabled,
  });
  const [copying, setCopying] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);
  const [presentCopied, setPresentCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The embed URL points at the chrome-free /embed/[shareId] route. Derive it
  // from shareUrl so it shares the same origin as the displayed share link.
  const embedUrl = shareState.shareUrl
    ? shareState.shareUrl.replace("/share/", "/embed/")
    : null;
  const embedSnippet = embedUrl
    ? `<iframe src="${embedUrl}" width="800" height="600" style="border:0" title="TextIQ embed" loading="lazy"></iframe>`
    : null;

  // The presentation URL points at the /present/[shareId] route.
  const presentUrl = shareState.shareUrl
    ? shareState.shareUrl.replace("/share/", "/present/")
    : null;

  const handleToggle = async (enable: boolean) => {
    const result = await toggleDocumentSharing(id, enable);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setShareState(toShareState(result.data));
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const result = await regenerateShareLink(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setShareState(toShareState(result.data));
    } finally {
      setRegenerating(false);
    }
  };

  const handleExpiryChange = async (value: string) => {
    // datetime-local gives a local wall-clock string; convert to an ISO instant
    // (or null when cleared) for the server policy.
    const expiresAt = value ? new Date(value).toISOString() : null;
    const result = await updateSharePolicy(id, { expiresAt });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setShareState(toShareState(result.data));
  };

  const handleEmbedEnabledChange = async (enabled: boolean) => {
    const result = await updateSharePolicy(id, { embedEnabled: enabled });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setShareState(toShareState(result.data));
  };

  const handlePresentEnabledChange = async (enabled: boolean) => {
    const result = await updateSharePolicy(id, { presentEnabled: enabled });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setShareState(toShareState(result.data));
  };

  const copyLink = async () => {
    if (!shareState.shareUrl) {
      return;
    }
    setCopying(true);
    await navigator.clipboard.writeText(shareState.shareUrl);
    setTimeout(() => setCopying(false), 2000);
  };

  const copyEmbed = async () => {
    if (!embedSnippet) {
      return;
    }
    await navigator.clipboard.writeText(embedSnippet);
    setEmbedCopied(true);
    setTimeout(() => setEmbedCopied(false), 2000);
  };

  const copyPresentLink = async () => {
    if (!presentUrl) {
      return;
    }
    await navigator.clipboard.writeText(presentUrl);
    setPresentCopied(true);
    setTimeout(() => setPresentCopied(false), 2000);
  };

  return (
    <Popover
      open={showMenu}
      onClose={() => setShowMenu(false)}
      aria-label="Share this document"
      trigger={
        <EditorToolbarButton
          label="Share"
          tooltip="Share document"
          icon={<Share2 aria-hidden="true" className="h-3.5 w-3.5" />}
          iconOnly={iconOnly}
          onClick={() => setShowMenu(!showMenu)}
          aria-label="Share"
        />
      }
    >
      <h3 className="mb-3 text-sm font-semibold text-ds-text-primary">
        Share this document
      </h3>

      <div className="mb-3 flex items-center justify-between">
        <span
          className="text-sm text-ds-text-secondary"
          id="share-toggle-label"
        >
          {shareState.isShared ? "Public link enabled" : "Private"}
        </span>
        <Switch
          checked={shareState.isShared}
          onCheckedChange={handleToggle}
          aria-labelledby="share-toggle-label"
        />
      </div>

      {error && (
        <p role="alert" className="mb-3 text-xs text-ds-danger">
          {error}
        </p>
      )}

      {shareState.isShared && shareState.shareUrl && (
        <div>
          <div className="mb-2 flex items-center gap-2 rounded-md border border-ds-border-subtle bg-ds-surface-sunken px-3 py-2">
            <input
              readOnly
              value={shareState.shareUrl}
              className="flex-1 bg-transparent text-xs text-ds-text-secondary outline-none"
            />
            <button
              type="button"
              onClick={copyLink}
              className="shrink-0 rounded px-2 py-1 text-xs font-medium text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
            >
              {copying ? "Copied!" : "Copy"}
            </button>
          </div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs text-ds-text-muted">
              Anyone with this link can view your document (read-only).
            </p>
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={regenerating}
              className="shrink-0 rounded px-2 py-1 text-xs font-medium text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary disabled:opacity-50"
            >
              {regenerating ? "Regenerating…" : "Regenerate link"}
            </button>
          </div>
          <p className="text-xs text-ds-text-muted">
            Regenerating creates a new link and immediately disables the old
            one.
          </p>
        </div>
      )}

      {shareState.isShared && (
        <div className="mt-4 border-t border-ds-border-subtle pt-3">
          <h4 className="mb-2 text-xs font-semibold text-ds-text-primary">
            Link expiry
          </h4>
          <div className="flex items-center gap-2">
            <input
              type="datetime-local"
              aria-label="Link expiry date and time"
              value={isoToLocalInput(shareState.expiresAt)}
              onChange={(event) => handleExpiryChange(event.target.value)}
              className="flex-1 rounded-md border border-ds-border-subtle bg-ds-surface-sunken px-2 py-1 text-xs text-ds-text-secondary outline-none"
            />
            {shareState.expiresAt && (
              <button
                type="button"
                onClick={() => handleExpiryChange("")}
                className="shrink-0 rounded px-2 py-1 text-xs font-medium text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
              >
                Clear
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-ds-text-muted">
            {shareState.expiresAt
              ? "After this time the link stops working everywhere."
              : "No expiry — the link works until disabled or regenerated."}
          </p>
        </div>
      )}

      {shareState.isShared && (
        <div className="mt-4 border-t border-ds-border-subtle pt-3">
          <h4 className="mb-2 text-xs font-semibold text-ds-text-primary">
            Access
          </h4>
          <div className="mb-2 flex items-center justify-between">
            <span
              className="text-xs text-ds-text-secondary"
              id="share-embed-allow-label"
            >
              Allow embedding
            </span>
            <Switch
              checked={shareState.embedEnabled}
              onCheckedChange={handleEmbedEnabledChange}
              aria-labelledby="share-embed-allow-label"
            />
          </div>
          <div className="flex items-center justify-between">
            <span
              className="text-xs text-ds-text-secondary"
              id="share-present-allow-label"
            >
              Allow presentation
            </span>
            <Switch
              checked={shareState.presentEnabled}
              onCheckedChange={handlePresentEnabledChange}
              aria-labelledby="share-present-allow-label"
            />
          </div>
        </div>
      )}

      {shareState.isShared && shareState.embedEnabled && embedSnippet && (
        <div className="mt-4 border-t border-ds-border-subtle pt-3">
          <h4 className="mb-2 text-xs font-semibold text-ds-text-primary">
            Embed
          </h4>
          <div className="mb-2 flex items-start gap-2 rounded-md border border-ds-border-subtle bg-ds-surface-sunken px-3 py-2">
            <textarea
              readOnly
              rows={3}
              value={embedSnippet}
              aria-label="Embed code"
              className="flex-1 resize-none bg-transparent font-mono text-xs text-ds-text-secondary outline-none"
            />
            <button
              type="button"
              onClick={copyEmbed}
              className="shrink-0 rounded px-2 py-1 text-xs font-medium text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
            >
              {embedCopied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p
            role="status"
            aria-live="polite"
            className="text-xs text-ds-text-muted"
          >
            {embedCopied
              ? "Embed code copied to clipboard."
              : "Paste this snippet into any webpage to embed the read-only visual."}
          </p>
        </div>
      )}

      {shareState.isShared && shareState.presentEnabled && presentUrl && (
        <div className="mt-4 border-t border-ds-border-subtle pt-3">
          <h4 className="mb-2 text-xs font-semibold text-ds-text-primary">
            Presentation link
          </h4>
          <div className="mb-2 flex items-center gap-2 rounded-md border border-ds-border-subtle bg-ds-surface-sunken px-3 py-2">
            <input
              readOnly
              value={presentUrl}
              aria-label="Presentation link"
              className="flex-1 bg-transparent text-xs text-ds-text-secondary outline-none"
            />
            <button
              type="button"
              onClick={copyPresentLink}
              className="shrink-0 rounded px-2 py-1 text-xs font-medium text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
            >
              {presentCopied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p
            role="status"
            aria-live="polite"
            className="text-xs text-ds-text-muted"
          >
            {presentCopied
              ? "Presentation link copied."
              : "Share a full-screen slideshow of this document."}
          </p>
        </div>
      )}

      {!shareState.isShared && (
        <p className="text-xs text-ds-text-muted">
          Enable sharing to create a public read-only link.
        </p>
      )}

      {/* Social share — always visible; link-based options gated on isShared */}
      <div className="mt-4 border-t border-ds-border-subtle pt-3">
        <h4 className="mb-2 text-xs font-semibold text-ds-text-primary">
          Share to social
        </h4>
        <SocialShareMenu
          inline
          shareUrl={shareState.shareUrl}
          title={documentTitle}
        />
      </div>
    </Popover>
  );
}
