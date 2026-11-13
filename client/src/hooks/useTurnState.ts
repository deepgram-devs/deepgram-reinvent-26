"use client";

import { RTVIEvent } from "@pipecat-ai/client-js";
import { useRTVIClientEvent } from "@pipecat-ai/client-react";
import { useCallback, useState } from "react";

import type { TurnState } from "@/vendor/voice-hero/lib/protocol";

/**
 * Whose turn it is, for the voice ring: listening while the caller talks or the floor is open,
 * thinking from the end of the caller's turn until the agent answers, speaking while the agent talks.
 */
export function useTurnState(): TurnState {
  const [turn, setTurn] = useState<TurnState>("listening");
  const listening = useCallback(() => setTurn("listening"), []);
  const thinking = useCallback(() => setTurn("thinking"), []);
  const speaking = useCallback(() => setTurn("speaking"), []);
  useRTVIClientEvent(RTVIEvent.UserStartedSpeaking, listening);
  useRTVIClientEvent(RTVIEvent.UserStoppedSpeaking, thinking);
  useRTVIClientEvent(RTVIEvent.BotStartedSpeaking, speaking);
  useRTVIClientEvent(RTVIEvent.BotStoppedSpeaking, listening);
  return turn;
}
