import type { Metadata, Viewport } from "next";
import { Fraunces, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Cursor } from "@/components/Cursor";
import { MotionInit } from "@/components/motion/MotionInit";
import { CleanUrl } from "@/components/CleanUrl";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  style: ["normal", "italic"],
  display: "swap",
});
const sans = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
  display: "swap",
});

const siteOrigin = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://vurqel.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: "Vurqel — Temporal supply-chain exposure proof",
  description:
    "Vurqel proves which historical builds actually resolved a compromised package during its live window, down to the commit, the frozen-lockfile CI job, and the production-labelled service build. One receipt, backed by a graph path.",
  applicationName: "Vurqel",
  authors: [{ name: "MystiqueMide" }],
  keywords: ["supply-chain", "security", "provenance", "HydraDB", "graph"],
  openGraph: {
    title: "Vurqel — Temporal supply-chain exposure proof",
    description:
      "Prove which build actually resolved a compromised package while it was live. EXPOSED, NOT_EXPOSED, or UNPROVEN — never a guess.",
    url: siteOrigin,
    siteName: "Vurqel",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vurqel — Temporal supply-chain exposure proof",
    description:
      "Prove which build actually resolved a compromised package while it was live. EXPOSED, NOT_EXPOSED, or UNPROVEN — never a guess.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0E0E0C",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="font-sans">
        <MotionInit />
        <CleanUrl />
        <Cursor />
        {children}
      </body>
    </html>
  );
}
