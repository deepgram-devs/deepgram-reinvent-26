import type { Metadata, Viewport } from "next";
import { Geist, IBM_Plex_Mono, Noto_Sans_Devanagari } from "next/font/google";

import "./globals.css";

const geist = Geist({ subsets: ["latin", "cyrillic"], variable: "--font-geist" });
const plexMono = IBM_Plex_Mono({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});
// After a switch to Hindi, transcripts arrive in Devanagari
const devanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "500", "600"],
  variable: "--font-devanagari",
});

export const metadata: Metadata = {
  title: "Tri-County Claims",
  description: "Look up an auto claim by voice. Built with Deepgram, AWS, and Pipecat.",
};

export const viewport: Viewport = {
  themeColor: "#1c1b1a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${plexMono.variable} ${devanagari.variable}`}>
      <body>{children}</body>
    </html>
  );
}
