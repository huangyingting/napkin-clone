import { ImageResponse } from "next/og";

import { excerpt } from "@/lib/document-stats";
import { prisma } from "@/lib/prisma";
import { shareIdFromParam } from "@/lib/slug";
import {
  evaluateShareAccessDecision,
  SHARE_ACCESS_SELECT,
  toShareAccessInput,
} from "@/lib/share-access";

// Prisma access requires the Node.js runtime (not the default edge runtime).
export const runtime = "nodejs";

const SITE_NAME = "TextIQ";

export const alt = "Shared document preview";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#4f46e5";
const BG = "#0b0d12";
const TEXT = "#f5f6f6";
const SECONDARY = "#a1a1aa";

/**
 * Auto-generated 1200x630 Open Graph preview card for a shared document
 * (US-030). It renders text + branding only (the document title, an excerpt,
 * and the site name) — no live SVG visual. Share-gated: a non-shared/unknown
 * document yields a safe, generic branded card so private documents never leak
 * their contents.
 */
export default async function Image({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const resolvedShareId = shareIdFromParam(shareId);

  const row = await prisma.document.findFirst({
    where: { shareId: resolvedShareId },
    select: { title: true, content: true, ...SHARE_ACCESS_SELECT },
  });

  // Share-gated: only an actively-valid link yields its content; an unknown,
  // disabled, expired, regenerated, or deleted link falls back to a safe,
  // generic branded card so private documents never leak (issue #101 AC #4).
  const document =
    row &&
    evaluateShareAccessDecision(
      toShareAccessInput(row, resolvedShareId, "view"),
    ).allow
      ? row
      : null;

  const title = document?.title?.trim() || "Shared document";
  const description = document ? excerpt(document.content, 180) : "";

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: BG,
        padding: "80px",
        fontFamily: "sans-serif",
      }}
    >
      {/* Brand row */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: ACCENT,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
            fontSize: 34,
            fontWeight: 700,
          }}
        >
          N
        </div>
        <div
          style={{
            marginLeft: 24,
            color: TEXT,
            fontSize: 30,
            fontWeight: 600,
          }}
        >
          {SITE_NAME}
        </div>
      </div>

      {/* Title + excerpt */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            color: TEXT,
            fontSize: 72,
            fontWeight: 700,
            lineHeight: 1.1,
            // Clamp long titles to keep the card balanced.
            display: "flex",
          }}
        >
          {title.length > 90 ? `${title.slice(0, 90).trimEnd()}…` : title}
        </div>
        {description ? (
          <div
            style={{
              marginTop: 28,
              color: SECONDARY,
              fontSize: 34,
              lineHeight: 1.4,
              display: "flex",
            }}
          >
            {description}
          </div>
        ) : null}
      </div>

      {/* Footer accent */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <div
          style={{
            width: 120,
            height: 8,
            borderRadius: 4,
            background: ACCENT,
          }}
        />
        <div
          style={{
            marginLeft: 24,
            color: SECONDARY,
            fontSize: 26,
          }}
        >
          Read-only shared document
        </div>
      </div>
    </div>,
    { ...size },
  );
}
