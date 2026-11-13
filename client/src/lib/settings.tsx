"use client";

import { usePipecatClient } from "@pipecat-ai/client-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { useSetMic } from "@/lib/session";

type SettingsValue = {
  open: boolean;
  /** Settings are open during a call, so the microphone is off */
  paused: boolean;
  show: () => void;
  hide: () => void;
};

const SettingsContext = createContext<SettingsValue>({
  open: false,
  paused: false,
  show: () => {},
  hide: () => {},
});

export function useSettings(): SettingsValue {
  return useContext(SettingsContext);
}

/**
 * The settings panel, and the call's pause while it's open: the microphone
 * goes off so nothing said while reading is sent, and comes back on close
 * only if it was on before. The agent's idle timer pauses with it, so time
 * spent reading Settings never counts as the caller going quiet.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const client = usePipecatClient();
  const setMic = useSetMic();
  const [open, setOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const resumeMic = useRef(false);

  const show = useCallback(() => {
    const live = !!client?.connected;
    resumeMic.current = live && !!client?.isMicEnabled;
    if (resumeMic.current) setMic(false);
    setPaused(live);
    setOpen(true);
  }, [client, setMic]);

  const hide = useCallback(() => {
    if (resumeMic.current && client?.connected) setMic(true);
    resumeMic.current = false;
    setPaused(false);
    setOpen(false);
  }, [client, setMic]);

  const value = useMemo(() => ({ open, paused, show, hide }), [open, paused, show, hide]);
  return (
    <SettingsContext.Provider value={value}>
      {children}
      {open && <SettingsPanel onClose={hide} />}
    </SettingsContext.Provider>
  );
}
