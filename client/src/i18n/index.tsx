"use client";

import { useEffect } from "react";

import { usePreferences } from "@/lib/preferences";

import de from "./de";
import en, { type Messages } from "./en";
import es from "./es";
import fr from "./fr";
import hi from "./hi";
import it from "./it";
import nl from "./nl";
import pt from "./pt";
import ru from "./ru";

export type { Messages };

// One dictionary per voice language in voices.py
const MESSAGES = { en, es, fr, de, hi, ru, pt, it, nl } satisfies Record<string, Messages>;

export type Locale = keyof typeof MESSAGES;

function isLocale(code: string): code is Locale {
  return Object.hasOwn(MESSAGES, code);
}

/**
 * The UI's language: the language of the voice in use. During a call that's
 * the voice the agent speaks in, including one it switched to on request;
 * between calls it's the voice the next call starts in.
 */
export function useLocale(): Locale {
  const { voice } = usePreferences();
  return isLocale(voice.lang) ? voice.lang : "en";
}

export function useT(): Messages {
  return MESSAGES[useLocale()];
}

/** A label the agent sent with a claim, translated when it's a known one */
export function fieldLabel(t: Messages, label: string): string {
  return Object.hasOwn(t.fieldLabels, label) ? t.fieldLabels[label as keyof Messages["fieldLabels"]] : label;
}

/** A voice's catalog description, translated when it's a known one */
export function blurb(t: Messages, text: string): string {
  return Object.hasOwn(t.blurbs, text) ? t.blurbs[text as keyof Messages["blurbs"]] : text;
}

/** A language's name in that language, "español" as "Español", for the picker */
export function nativeLanguageName(code: string, fallback: string): string {
  try {
    const name = new Intl.DisplayNames([code], { type: "language" }).of(code);
    return name ? name.charAt(0).toLocaleUpperCase(code) + name.slice(1) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Keeps <html lang> on the UI's language, for screen readers and for
 * hyphenation. The server renders it as "en" (layout.tsx); the browser
 * corrects it once the stored voice is known.
 */
export function DocumentLanguage() {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
