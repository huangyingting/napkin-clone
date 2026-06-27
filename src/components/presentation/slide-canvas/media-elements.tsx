import type { JSX } from "react";
import type * as React from "react";

import type { ImageElement } from "@/lib/presentation/deck";
import type { ImageDefaultsToken } from "@/lib/presentation/deck-theme-tokens";
import { isEmptyImageSrc } from "@/lib/presentation/image-element";

import { boxStyle } from "./primitives";
import { imageContent, imageDesign } from "./v6-model";

function hasImageCrop(
  crop: ImageElement["crop"] | undefined,
): crop is NonNullable<ImageElement["crop"]> {
  return Boolean(
    crop &&
    (crop.top > 0 || crop.right > 0 || crop.bottom > 0 || crop.left > 0),
  );
}

function imageObjectPosition(crop: ImageElement["crop"] | undefined): string {
  if (!crop) return "50% 50%";
  const remainingX = Math.max(0, 1 - crop.left - crop.right);
  const remainingY = Math.max(0, 1 - crop.top - crop.bottom);
  const x = Math.max(0, Math.min(1, crop.left + remainingX / 2));
  const y = Math.max(0, Math.min(1, crop.top + remainingY / 2));
  return `${x * 100}% ${y * 100}%`;
}

function imageCropClipPath(
  crop: ImageElement["crop"] | undefined,
): string | undefined {
  if (!hasImageCrop(crop)) return undefined;
  return `inset(${crop.top * 100}% ${crop.right * 100}% ${crop.bottom * 100}% ${crop.left * 100}%)`;
}

function imageMaskStyle(
  mask: Pick<ImageElement, "maskShape" | "radius">,
): React.CSSProperties {
  const radius =
    mask.radius !== undefined && mask.radius > 0 ? mask.radius : undefined;
  switch (mask.maskShape) {
    case "circle":
      return { clipPath: "circle(50% at 50% 50%)" };
    case "diamond":
      return {
        clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
      };
    case "rounded":
      return { borderRadius: `${radius ?? 12}%` };
    default:
      return radius ? { borderRadius: `${radius}%` } : {};
  }
}

export function ImageElementView({
  element,
  editable = false,
  defaults,
}: {
  element: ImageElement;
  /**
   * True only on the editing stage. Controls how an empty-source image renders:
   * editor shows an "Add image" dropzone affordance; present / public / preview
   * surfaces render a neutral box so they never show a broken image (#226).
   */
  editable?: boolean;
  /** Deck-template image defaults applied when the element omits a field (#607). */
  defaults?: ImageDefaultsToken;
}): JSX.Element {
  const content = imageContent(element);
  const design = imageDesign(element);
  const cropClipPath = imageCropClipPath(content.crop);
  // Effective image styling: element value wins, else the deck-template default
  // (#607), else the renderer's built-in default. Built-in themes set no image
  // token, so existing decks are unaffected.
  const effFitMode = design.fitMode ?? defaults?.fitMode;
  const effMask: Pick<ImageElement, "maskShape" | "radius"> = {
    maskShape: design.maskShape ?? defaults?.maskShape,
    radius: design.radius ?? defaults?.radiusPct,
  };
  const outerStyle: React.CSSProperties = {
    ...boxStyle(element),
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...imageMaskStyle(effMask),
  };
  const innerStyle: React.CSSProperties = {
    height: "100%",
    width: "100%",
    overflow: "hidden",
    ...(cropClipPath ? { clipPath: cropClipPath } : {}),
  };

  // Never emit `<img src="">` — it shows a broken-image box and can re-request
  // the current page. Branch on the empty-source predicate instead.
  if (isEmptyImageSrc(content.src)) {
    return (
      <div style={outerStyle}>
        <div
          style={{
            ...innerStyle,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5em",
            ...(editable
              ? {
                  color: "rgba(113, 113, 122, 0.9)",
                  border: "1px dashed rgba(113, 113, 122, 0.5)",
                  borderRadius: "0.5em",
                  backgroundColor: "rgba(113, 113, 122, 0.06)",
                  fontSize: "3.5cqh",
                }
              : {}),
          }}
        >
          {editable ? (
            <>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ height: "8cqh", width: "8cqh" }}
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </svg>
              <span>Add image</span>
            </>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <div style={outerStyle}>
      <div style={innerStyle}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={content.src}
          alt={content.alt ?? ""}
          style={{
            display: "block",
            height: "100%",
            width: "100%",
            objectFit: effFitMode ?? "contain",
            objectPosition: imageObjectPosition(content.crop),
          }}
        />
      </div>
    </div>
  );
}
