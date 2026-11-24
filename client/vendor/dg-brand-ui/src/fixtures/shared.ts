import type { Turn } from "../voice/types";

/** Where the kit's assets are served from, after `npx vdui-assets public/vdui` */
export const ASSET_BASE = "/vdui";

/** The partner line every fixture example uses */
export const BUILT_WITH = "Built with Deepgram speech-to-text and text-to-speech, Pipecat, Amazon Bedrock, and AWS Strands.";

/** The panel meta line for an English call */
export const EN_META = "flux-general-en · en · 412 ms";

/** An ISO time on the fixtures' call, at 11:12:ss */
export const at = (seconds: number) => `2026-11-11T11:12:${String(seconds).padStart(2, "0")}-05:00`;

/** Small builders, so example conversations read like a script */
export const agent = (id: string, text: string, seconds: number, chips?: Turn["chips"]): Turn => ({
  id,
  role: "assistant",
  text,
  at: at(seconds),
  chips,
});
export const caller = (id: string, text: string, seconds?: number): Turn =>
  seconds === undefined ? { id, role: "user", text, final: false } : { id, role: "user", text, at: at(seconds), final: true };
export const tool = (id: string, name: string, args: Record<string, unknown>, seconds: number, ms?: number): Turn => ({
  id,
  role: "tool",
  text: "",
  at: at(seconds),
  call: { name, args, status: ms === undefined ? "running" : "completed", ms },
});

const LANGUAGES = [
  ["en", "English", "svg"],
  ["es", "Español", "png"],
  ["fr", "Français", "svg"],
  ["de", "Deutsch", "svg"],
  ["hi", "हिन्दी", "svg"],
  ["ru", "Русский", "png"],
  ["pt", "Português", "png"],
  ["it", "Italiano", "svg"],
  ["nl", "Nederlands", "png"],
] as const;

/** The nine Deepgram Flux languages, by native name, with round flags, for ImageSelect */
export function languageOptions(base = ASSET_BASE) {
  return LANGUAGES.map(([code, name, ext]) => ({ value: code, label: name, lang: code, image: `${base}/flags/${code}.${ext}` }));
}
