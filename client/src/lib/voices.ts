// The agent's voice catalog, as voices.py defines it. scripts/export_voices.py
// writes voices.json from it, so the picker offers exactly the voices the
// agent can switch to.

import catalog from "./voices.json";

export type VoiceEntry = (typeof catalog.voices)[number];
export type LanguageEntry = (typeof catalog.languages)[number];

export const LANGUAGES: LanguageEntry[] = catalog.languages;
export const VOICES: VoiceEntry[] = catalog.voices;

const BY_NAME = new Map(VOICES.map((voice) => [voice.name, voice]));

export const DEFAULT_VOICE: VoiceEntry = BY_NAME.get(catalog.default) ?? VOICES[0];

/** A voice by its short name, or null if the catalog has no such voice */
export function findVoice(name: string | null | undefined): VoiceEntry | null {
  return (name && BY_NAME.get(name)) || null;
}

/** A language's voices, featured first, so the picker leads with the ones the agent suggests */
export function voicesFor(lang: string): VoiceEntry[] {
  const voices = VOICES.filter((voice) => voice.lang === lang);
  return [...voices.filter((voice) => voice.featured), ...voices.filter((voice) => !voice.featured)];
}

/** "carmen" as "Carmen" */
export function voiceTitle(voice: VoiceEntry): string {
  return voice.name.charAt(0).toUpperCase() + voice.name.slice(1);
}
