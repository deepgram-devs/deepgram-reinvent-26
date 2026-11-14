import type { Metadata, Viewport } from "next";
import type { CSSProperties } from "react";
import { Azeret_Mono, Noto_Sans, Noto_Sans_Devanagari, Noto_Sans_Mono, Work_Sans } from "next/font/google";

import "./globals.css";

// Deepgram's brand faces: Work Sans for everything, Azeret Mono for code (the function-call blocks)
const workSans = Work_Sans({ subsets: ["latin", "latin-ext"] });
const azeretMono = Azeret_Mono({ subsets: ["latin", "latin-ext"] });

// Neither brand face has Cyrillic or Devanagari, so Russian and Hindi fall back to Noto, glyph by glyph.
// Not preloaded: a browser only fetches a fallback when a page shows text in that script.
const notoSans = Noto_Sans({ subsets: ["cyrillic"], preload: false });
const notoSansMono = Noto_Sans_Mono({ subsets: ["cyrillic"], preload: false });
const devanagari = Noto_Sans_Devanagari({ subsets: ["devanagari"], preload: false });

type Font = { style: { fontFamily: string } };
/** The font's own family, without the size-matched Arial next/font lists after it */
const face = (font: Font) => font.style.fontFamily.split(",")[0].trim();
/** That size-matched Arial, which keeps Latin text from jumping while the brand face loads */
const sizedArial = (font: Font) => font.style.fontFamily.split(",").slice(1).join(",").trim();

// The script fallbacks must come before the sized Arial: Arial has Cyrillic, so in next/font's own order
// Russian would render in Arial. (adjustFontFallback: false would drop it, but Turbopack ignores that.)
const stack = (primary: Font, script: Font[], generic: string) =>
  [face(primary), ...script.map(face), sizedArial(primary), generic].filter(Boolean).join(", ");

const FONT_STACKS = {
  "--font-brand-sans": stack(workSans, [devanagari, notoSans], "ui-sans-serif, system-ui, sans-serif"),
  "--font-brand-mono": stack(azeretMono, [notoSansMono, devanagari], "ui-monospace, monospace"),
} as CSSProperties;

export const metadata: Metadata = {
  title: "Tri-County Claims",
  description: "Look up an auto claim by voice. Built with Deepgram, AWS, and Pipecat.",
};

export const viewport: Viewport = {
  themeColor: "#1c1b1a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={FONT_STACKS}>
      <body>{children}</body>
    </html>
  );
}
