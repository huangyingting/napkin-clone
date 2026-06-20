import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the PDF parser and its pdfjs-dist dependency out of the bundle so
  // pdfjs can resolve its worker (`pdf.worker.mjs`) from node_modules at
  // runtime instead of a rewritten bundle path that does not exist.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  // When running in a git worktree the node_modules directory is a symlink
  // pointing to the main workspace. Setting turbopack.root to the parent
  // directory lets Turbopack follow that symlink without treating it as
  // "outside the filesystem root".
  turbopack: {
    root: "/home/ythuang/workspace",
  },
};

export default nextConfig;
