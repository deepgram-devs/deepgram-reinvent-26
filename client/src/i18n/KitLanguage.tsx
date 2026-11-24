"use client";

import { KitStringsProvider, type KitStrings } from "@deepgram-devs/dg-brand-ui";
import { useMemo, type ReactNode } from "react";

import { useT } from "./index";

/**
 * The UI kit's own words (its labels, button names, and screen reader text), in the app's
 * language. They follow the agent's voice like the rest of the app. The kit's English stands in
 * for anything the app doesn't translate.
 */
export function KitLanguage({ children }: { children: ReactNode }) {
  const t = useT();
  const strings = useMemo<Partial<KitStrings>>(
    () => ({
      settings: t.chrome.settings,
      viewOnly: t.chrome.viewOnly,
      you: t.session.you,
      close: t.session.close,
      open: t.desk.open,
      results: t.review.results,
      breadcrumb: t.review.breadcrumbLabel,
      lastUpdated: t.review.lastUpdated,
      live: t.call.live,
      ended: t.call.ended,
      listening: t.call.listening,
      searching: t.call.searching,
      paused: t.call.paused,
      connecting: t.landing.connecting,
      startConversation: t.landing.start,
      micNote: t.landing.micNote,
      sessionTitle: t.session.title,
      assistant: t.session.assistant,
      speaking: t.session.speaking,
      functionCall: t.session.functionCall,
      running: t.session.running,
      done: t.session.done,
      cancelled: t.session.cancelled,
      callLabel: t.session.callLabel,
      tryAsking: t.session.tryAsking,
      mute: t.session.mute,
      unmute: t.session.unmute,
      endConversation: t.session.end,
      liveNote: t.session.liveNote,
      pausedNote: t.session.pausedNote,
      endedNote: t.session.endedNote,
      transcript: t.review.transcript,
      conversation: t.review.conversation,
      openConversation: t.review.openConversation,
      dockLive: t.review.dockLive,
      appearance: t.settings.appearance,
      themeDark: t.settings.themeDark,
      themeLight: t.settings.themeLight,
      themeSystem: t.settings.themeSystem,
      themeNote: t.settings.themeNote,
      themeNoteSystemDark: t.settings.themeNoteSystemDark,
      themeNoteSystemLight: t.settings.themeNoteSystemLight,
      scanToOpen: t.settings.scanToOpen,
      openInNewTab: t.settings.newTab,
    }),
    [t],
  );
  return <KitStringsProvider strings={strings}>{children}</KitStringsProvider>;
}
