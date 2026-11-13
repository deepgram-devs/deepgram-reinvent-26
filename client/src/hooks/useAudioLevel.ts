"use client";

import { RTVIEvent } from "@pipecat-ai/client-js";
import { useRTVIClientEvent } from "@pipecat-ai/client-react";
import { useCallback, useState } from "react";

/** The caller's or the agent's audio level, 0 to 1, smoothed. */
export function useAudioLevel(who: "local" | "remote"): number {
  const [level, setLevel] = useState(0);
  const update = useCallback(
    (value: number) => setLevel((prev) => prev * 0.6 + Math.min(1, value * 4) * 0.4),
    [],
  );
  useRTVIClientEvent(
    who === "local" ? RTVIEvent.LocalAudioLevel : RTVIEvent.RemoteAudioLevel,
    update,
  );
  return level;
}
