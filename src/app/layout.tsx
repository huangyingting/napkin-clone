import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { HeaderGate } from "@/components/header-gate";
import { SiteHeader } from "@/components/site-header";
import { Providers } from "./providers";

// Ghost theme font system: self-host Inter and wire it to --font-sans.
// Serif (Georgia) and mono (Menlo) come from system stacks, so only Inter downloads.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Napkin Clone — Text to Visuals",
  description:
    "Turn plain text into AI-generated, editable visuals: flowcharts, mind maps, infographics, charts, and concept diagrams.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full scroll-smooth antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          <HeaderGate>
            <SiteHeader />
          </HeaderGate>
          {children}
        </Providers>
      </body>
    </html>
  );
}
