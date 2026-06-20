import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the PDF parser and its pdfjs-dist dependency out of the bundle so
  // pdfjs can resolve its worker (`pdf.worker.mjs`) from node_modules at
  // runtime instead of a rewritten bundle path that does not exist.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
