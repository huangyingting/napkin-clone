/**
 * Visual export utilities for PNG, SVG, PDF, and PPTX.
 *
 * These functions take a rendered SVG element and export it in various formats:
 * - SVG: serialize the DOM element directly
 * - PNG: convert to canvas → rasterize at given scale
 * - PDF: embed the visual as an image on a properly sized page
 * - PPTX: embed the visual as an image on a single slide
 */

import { jsPDF } from "jspdf";
import PptxGenJS from "pptxgenjs";

/**
 * Serialize an SVG element to a downloadable SVG file.
 * Returns a Blob with proper MIME type.
 */
export function exportSVG(svgElement: SVGSVGElement): Blob {
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgElement);

  // Add XML declaration for proper standalone SVG
  const svgData = `<?xml version="1.0" encoding="UTF-8"?>\n${svgString}`;

  return new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
}

/**
 * Convert an SVG element to PNG at the given scale.
 * Returns a Promise that resolves to a Blob, or null on error.
 *
 * @param svgElement - The SVG to rasterize
 * @param scale - Scaling factor (1 = actual size, 2 = 2x, etc.)
 */
export async function exportPNG(
  svgElement: SVGSVGElement,
  scale: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      // Get the SVG's viewBox to determine dimensions
      const viewBox = svgElement.viewBox.baseVal;
      const width = viewBox.width;
      const height = viewBox.height;

      if (width === 0 || height === 0) {
        resolve(null);
        return;
      }

      // Create a canvas at the scaled size
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }

      // Serialize the SVG to a data URL
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svgElement);
      const svgBlob = new Blob([svgString], {
        type: "image/svg+xml;charset=utf-8",
      });
      const url = URL.createObjectURL(svgBlob);

      // Load into an image and draw to canvas
      const img = new Image();
      img.onload = () => {
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);

        canvas.toBlob((blob) => {
          resolve(blob);
        }, "image/png");
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };

      img.src = url;
    } catch {
      resolve(null);
    }
  });
}

/**
 * Trigger a browser download of a Blob with the given filename.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Convert an SVG element to PDF.
 * Returns a Promise that resolves to a Blob, or null on error.
 *
 * The PDF page is sized to fit the visual exactly (no margins/letterboxing).
 *
 * @param svgElement - The SVG to embed in the PDF
 */
export async function exportPDF(
  svgElement: SVGSVGElement,
): Promise<Blob | null> {
  try {
    // Get the SVG's viewBox to determine dimensions
    const viewBox = svgElement.viewBox.baseVal;
    const width = viewBox.width;
    const height = viewBox.height;

    if (width === 0 || height === 0) {
      return null;
    }

    // First convert SVG to PNG at 2x scale for good quality
    const pngBlob = await exportPNG(svgElement, 2);
    if (!pngBlob) {
      return null;
    }

    // Convert the PNG blob to a data URL
    const pngDataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(pngBlob);
    });

    // Create a PDF with dimensions matching the visual (in mm)
    // jsPDF uses mm by default; we'll size the page to fit the visual at 96 DPI
    // (1 inch = 25.4mm, 96 DPI means 96 pixels per inch)
    const widthMM = (width * 25.4) / 96;
    const heightMM = (height * 25.4) / 96;

    const pdf = new jsPDF({
      orientation: width > height ? "landscape" : "portrait",
      unit: "mm",
      format: [widthMM, heightMM],
    });

    // Add the image to fill the entire page (no margins)
    pdf.addImage(pngDataUrl, "PNG", 0, 0, widthMM, heightMM);

    // Get the PDF as a blob
    return pdf.output("blob");
  } catch {
    return null;
  }
}

/**
 * Convert an SVG element to PPTX with the visual on one slide.
 * Returns a Promise that resolves to a Blob, or null on error.
 *
 * @param svgElement - The SVG to embed in the PPTX
 */
export async function exportPPTX(
  svgElement: SVGSVGElement,
): Promise<Blob | null> {
  try {
    // Get the SVG's viewBox to determine dimensions
    const viewBox = svgElement.viewBox.baseVal;
    const width = viewBox.width;
    const height = viewBox.height;

    if (width === 0 || height === 0) {
      return null;
    }

    // Convert SVG to PNG at 2x scale for good quality
    const pngBlob = await exportPNG(svgElement, 2);
    if (!pngBlob) {
      return null;
    }

    // Convert the PNG blob to a data URL
    const pngDataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(pngBlob);
    });

    // Create a new presentation
    const pptx = new PptxGenJS();

    // Standard slide size is 10" x 7.5" (landscape) or 7.5" x 10" (portrait)
    // We'll use standard landscape and center the image
    const slideWidth = 10; // inches
    const slideHeight = 7.5; // inches

    // Calculate scaling to fit the visual on the slide while preserving aspect ratio
    const visualAspect = width / height;
    const slideAspect = slideWidth / slideHeight;

    let imageWidth: number;
    let imageHeight: number;

    if (visualAspect > slideAspect) {
      // Visual is wider relative to slide → fit to width
      imageWidth = slideWidth * 0.9; // 90% of slide width for padding
      imageHeight = imageWidth / visualAspect;
    } else {
      // Visual is taller relative to slide → fit to height
      imageHeight = slideHeight * 0.9; // 90% of slide height for padding
      imageWidth = imageHeight * visualAspect;
    }

    // Center the image on the slide
    const x = (slideWidth - imageWidth) / 2;
    const y = (slideHeight - imageHeight) / 2;

    // Add a slide and the image
    const slide = pptx.addSlide();
    slide.addImage({
      data: pngDataUrl,
      x,
      y,
      w: imageWidth,
      h: imageHeight,
    });

    // Generate the PPTX file as a blob
    const arrayBuffer = (await pptx.write({
      outputType: "arraybuffer",
    })) as ArrayBuffer;
    return new Blob([arrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
  } catch {
    return null;
  }
}
