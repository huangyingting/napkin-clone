"use client";

import { useEffect, useState } from "react";

import { toggleDocumentSharing } from "./actions";

type ShareState = {
  isShared: boolean;
  shareId: string | null;
  shareUrl: string | null;
};

export function ShareButton({
  id,
  initialIsShared,
  initialShareId,
}: {
  id: string;
  initialIsShared: boolean;
  initialShareId: string | null;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [shareState, setShareState] = useState<ShareState>({
    isShared: initialIsShared,
    shareId: initialShareId,
    shareUrl:
      initialIsShared && initialShareId
        ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/${initialShareId}`
        : null,
  });
  const [copying, setCopying] = useState(false);

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

  // Close menu when clicking outside.
  useEffect(() => {
    if (!showMenu) {
      return;
    }
    const close = () => setShowMenu(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [showMenu]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShowMenu(!showMenu);
        }}
        className="rounded-full border border-black/[.06] px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-white/[.08] dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        Share
      </button>

      {showMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-full z-10 mt-2 w-80 rounded-lg border border-black/[.06] bg-white p-4 shadow-lg dark:border-white/[.08] dark:bg-zinc-900"
        >
          <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Share this document
          </h3>

          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              {shareState.isShared ? "Public link enabled" : "Private"}
            </span>
            <button
              type="button"
              onClick={() => handleToggle(!shareState.isShared)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                shareState.isShared
                  ? "bg-zinc-900 dark:bg-zinc-50"
                  : "bg-zinc-200 dark:bg-zinc-700"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition dark:bg-zinc-900 ${
                  shareState.isShared ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {shareState.isShared && shareState.shareUrl && (
            <div>
              <div className="mb-2 flex items-center gap-2 rounded-md border border-black/[.06] bg-zinc-50 px-3 py-2 dark:border-white/[.08] dark:bg-zinc-800">
                <input
                  readOnly
                  value={shareState.shareUrl}
                  className="flex-1 bg-transparent text-xs text-zinc-600 outline-none dark:text-zinc-400"
                />
                <button
                  type="button"
                  onClick={copyLink}
                  className="shrink-0 rounded px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  {copying ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Anyone with this link can view your document (read-only).
              </p>
            </div>
          )}

          {!shareState.isShared && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Enable sharing to create a public read-only link.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
