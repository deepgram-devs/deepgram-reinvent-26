"use client";

import { usePipecatClient } from "@pipecat-ai/client-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { SettingsPanel } from "@/components/settings/SettingsPanel";

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
 * only if it was on before.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const client = usePipecatClient();
  const [open, setOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const resumeMic = useRef(false);

  const show = useCallback(() => {
    const live = !!client?.connected;
    resumeMic.current = live && !!client?.isMicEnabled;
    if (resumeMic.current) client?.enableMic(false);
    setPaused(live);
    setOpen(true);
  }, [client]);

  const hide = useCallback(() => {
    if (resumeMic.current && client?.connected) client.enableMic(true);
    resumeMic.current = false;
    setPaused(false);
    setOpen(false);
  }, [client]);

  const value = useMemo(() => ({ open, paused, show, hide }), [open, paused, show, hide]);
  return (
    <SettingsContext.Provider value={value}>
      {children}
      {open && <SettingsPanel onClose={hide} />}
    </SettingsContext.Provider>
  );
}
