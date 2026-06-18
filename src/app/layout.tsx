import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { HeaderGate } from "@/components/header-gate";
import { SiteHeader } from "@/components/site-header";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Napkin Clone — Text to Visuals",
  description:
    "Turn plain text into AI-generated, editable visuals: flowcharts, mind maps, infographics, charts, and concept diagrams.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full scroll-smooth antialiased`}
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
