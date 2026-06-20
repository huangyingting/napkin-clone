"use client";

import { useEffect, useRef, useState } from "react";

import { buildShareSegment } from "@/lib/slug";
import { SocialShareMenu } from "@/components/share/social-share-menu";

import { toggleDocumentSharing } from "./actions";

type ShareState = {
  isShared: boolean;
  shareId: string | null;
  slug: string | null;
  shareUrl: string | null;
};

export function ShareButton({
  id,
  initialIsShared,
  initialShareId,
  initialSlug = null,
  documentTitle = "Untitled",
}: {
  id: string;
  initialIsShared: boolean;
  initialShareId: string | null;
  initialSlug?: string | null;
  documentTitle?: string;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [shareState, setShareState] = useState<ShareState>({
    isShared: initialIsShared,
    shareId: initialShareId,
    slug: initialSlug,
    shareUrl:
      initialIsShared && initialShareId
        ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/${buildShareSegment(initialSlug, initialShareId)}`
        : null,
  });
  const [copying, setCopying] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);
  const [presentCopied, setPresentCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
    setShareState(result);
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

  // Close the menu only when clicking outside of it. A containment check is used
  // instead of relying on stopPropagation because the App Router delegates React
  // events to `document`, where the same-target manual listener still fires — so
  // clicks on in-menu controls (toggle, copy buttons) must not close the menu.
  useEffect(() => {
    if (!showMenu) {
      return;
    }
    const onDocClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [showMenu]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShowMenu(!showMenu);
        }}
        className="rounded-full border border-ds-border-subtle px-4 py-2 text-sm font-medium text-ds-text-secondary transition hover:bg-ds-state-hover hover:text-ds-text-primary"
      >
        Share
      </button>

      {showMenu && (
        <div
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-full z-dropdown mt-2 w-80 rounded-lg border border-ds-border-subtle bg-ds-surface-overlay p-4 shadow-ds-popover"
        >
          <h3 className="mb-3 text-sm font-semibold text-ds-text-primary">
            Share this document
          </h3>

          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-ds-text-secondary">
              {shareState.isShared ? "Public link enabled" : "Private"}
            </span>
            <button
              type="button"
              onClick={() => handleToggle(!shareState.isShared)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                shareState.isShared ? "bg-ds-control" : "bg-ds-state-active"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-ds-control-text transition ${
                  shareState.isShared ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

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
              <p className="text-xs text-ds-text-muted">
                Anyone with this link can view your document (read-only).
              </p>
            </div>
          )}

          {shareState.isShared && embedSnippet && (
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

          {shareState.isShared && presentUrl && (
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
        </div>
      )}
    </div>
  );
}
