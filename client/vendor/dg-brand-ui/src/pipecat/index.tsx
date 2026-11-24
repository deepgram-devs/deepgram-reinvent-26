"use client";

/**
 * Pipecat adapters: connect the kit's presentational components to a live Pipecat call.
 * Import from "@deepgram-devs/dg-brand-ui/pipecat". Needs @pipecat-ai/client-js and
 * @pipecat-ai/client-react, and a PipecatClientProvider (or voice-ui-kit's PipecatAppBase) above.
 *
 *   const { turns, caption, sendText } = usePipecatTurns();
 *   const { micOn, setMic } = useMicToggle();
 *   <VoiceSessionPanel turns={turns} live micOn={micOn} onToggleMic={setMic} onPrompt={sendText} ... />
 *   <ConnectedVoiceRing />
 */

import { RTVIEvent } from "@pipecat-ai/client-js";
import {
  type ConversationMessage,
  type ConversationMessagePart,
  type FunctionCallData,
  usePipecatClient,
  usePipecatClientMediaTrack,
  usePipecatClientMicControl,
  usePipecatConversation,
  useRTVIClientEvent,
} from "@pipecat-ai/client-react";
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Caption, FunctionCall, Turn, TurnChip, TurnState } from "../voice/types";
import { VoiceRing, type VoiceRingProps } from "../voice/Stage";

/** Whose turn it is, from Pipecat's speaking events: drives the VoiceRing and status line */
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

// The voice hero's display curve: ordinary speech sits low on a raw RMS meter, so RMS × 4 is
// stretched from this floor to this ceiling across 0..1
const FLOOR = 0.015;
const CEILING = 0.3;
const normalize = (rms: number) => Math.max(0, Math.min(1, (rms * 4 - FLOOR) / (CEILING - FLOOR)));

/**
 * The louder of caller and agent, 0 to 1, measured from both audio tracks every frame into a
 * ref, so the ring samples it without re-rendering React. Reads 0 while `silenced`.
 * (Measured here because SmallWebRTC never emits the bot's audio level events.)
 */
export function useVoiceLevelRef(silenced = false): RefObject<number> {
  const level = useRef(0);
  const mic = usePipecatClientMediaTrack("audio", "local");
  const bot = usePipecatClientMediaTrack("audio", "bot");

  useEffect(() => {
    level.current = 0;
    const tracks = [mic, bot].filter((track): track is MediaStreamTrack => track !== null);
    if (silenced || !tracks.length) return;
    const context = new AudioContext();
    const meters = tracks.map((track) => {
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(new MediaStream([track])).connect(analyser);
      return { track, analyser, samples: new Float32Array(analyser.fftSize) };
    });
    context.resume().catch(() => {});
    let frame = 0;
    const sample = () => {
      let loudest = 0;
      for (const { track, analyser, samples } of meters) {
        // A muted mic is disabled, not removed; it mustn't move the ring
        if (!track.enabled || track.readyState !== "live") continue;
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const s of samples) sum += s * s;
        loudest = Math.max(loudest, Math.sqrt(sum / samples.length));
      }
      level.current = normalize(loudest);
      frame = requestAnimationFrame(sample);
    };
    frame = requestAnimationFrame(sample);
    return () => {
      cancelAnimationFrame(frame);
      level.current = 0;
      context.close().catch(() => {});
    };
  }, [mic, bot, silenced]);

  return level;
}

/** The VoiceRing, driven by the call: turn state and live audio level. */
export function ConnectedVoiceRing({ paused = false, busy = false, className }: Pick<VoiceRingProps, "paused" | "className"> & { busy?: boolean }) {
  const turn = useTurnState();
  const level = useVoiceLevelRef(paused);
  return <VoiceRing state={busy ? "thinking" : turn} level={level} paused={paused} className={className} />;
}

/** The mic's state, and a setter that works before and during a call */
export function useMicToggle(): { micOn: boolean; setMic: (on: boolean) => void } {
  const { isMicEnabled } = usePipecatClientMicControl();
  const client = usePipecatClient();
  const setMic = useCallback((on: boolean) => client?.enableMic(on), [client]);
  return { micOn: isMicEnabled, setMic };
}

/**
 * Call `handler` for every server message the bot sends (RTVIServerMessageFrame in Python).
 * This is how the agent drives the screen: { type: "record-loaded" }, { type: "focus", ids }, ...
 */
export function useServerMessage<T = unknown>(handler: (message: T) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useRTVIClientEvent(
    RTVIEvent.ServerMessage,
    useCallback((data: unknown) => ref.current(data as T), []),
  );
}

/** When the agent pointed at parts of the screen: chips go on the answer it was giving then */
export type ChipEvent = { at: string; chips: TurnChip[] };

/** What the browser knows about each function call, by tool_call_id */
export type CallTiming = { /** When the call really came in (Pipecat backdates createdAt) */ at?: string; ms?: number };

function partText(text: unknown): { spoken: string; unspoken: string } {
  if (typeof text === "string") return { spoken: text, unspoken: "" };
  if (text && typeof text === "object" && "spoken" in text) {
    const { spoken, unspoken } = text as { spoken: string; unspoken: string };
    return { spoken, unspoken };
  }
  return { spoken: "", unspoken: "" };
}

function toCall(data: FunctionCallData, ms?: number): FunctionCall {
  return {
    name: data.function_name ?? "",
    args: data.args,
    status: data.status === "completed" ? "completed" : "running",
    cancelled: data.cancelled,
    ms,
  };
}

/**
 * Pipecat's conversation messages as the kit's turns, in time order. The agent's parts are
 * grouped into replies; function calls become rows where they happened; chip events attach to
 * the first answer still going after them.
 */
export function toTurns(
  messages: ConversationMessage[],
  { chips = [], timings = {} }: { chips?: ChipEvent[]; timings?: Record<string, CallTiming> } = {},
): { turns: Turn[]; caption: Caption | null; lastCall: FunctionCall | null } {
  type Item = { role: Turn["role"]; at: string; part?: ConversationMessagePart; call?: FunctionCallData; final: boolean; key: string };
  const items: Item[] = [];
  let lastCall: FunctionCall | null = null;

  messages.forEach((message, index) => {
    if (message.role === "function_call") {
      const call = message.functionCall;
      if (!call?.function_name) return;
      const timing = call.tool_call_id ? timings[call.tool_call_id] : undefined;
      lastCall = toCall(call, timing?.ms);
      items.push({
        role: "tool",
        at: timing?.at || message.createdAt,
        call,
        final: call.status === "completed",
        key: call.tool_call_id ?? `${message.createdAt}-${index}-call`,
      });
      return;
    }
    if (message.role !== "user" && message.role !== "assistant") return;
    message.parts.forEach((part, p) => {
      items.push({
        role: message.role as Turn["role"],
        // A caller's turn stays whole, at the time it started
        at: message.role === "user" ? message.createdAt : part.createdAt || message.createdAt,
        part,
        final: message.final !== false,
        key: `${message.createdAt}-${index}-${message.role === "user" ? 0 : p}`,
      });
    });
  });
  items.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  const turns: Turn[] = [];
  const ends = new Map<Turn, string>();
  for (const item of items) {
    if (item.call) {
      const timing = item.call.tool_call_id ? timings[item.call.tool_call_id] : undefined;
      turns.push({ id: item.key, role: "tool", text: "", final: item.final, at: item.at, call: toCall(item.call, timing?.ms) });
      continue;
    }
    const prev = turns.at(-1);
    const same = prev && prev.role === item.role && (item.role === "assistant" || prev.id === item.key);
    const turn: Turn = same ? prev : { id: item.key, role: item.role, text: "", pending: "", final: item.final, at: item.at };
    if (!same) turns.push(turn);
    const text = partText(item.part?.text);
    const gap = (item.part?.needsSeparator || item.role === "user") && (turn.text || turn.pending) ? " " : "";
    if (text.unspoken || turn.pending) turn.pending = (turn.pending ?? "") + gap + text.spoken + text.unspoken;
    else turn.text += gap + text.spoken;
    turn.final = item.final;
    ends.set(turn, item.at);
  }
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role !== "tool" && !(turns[i].text + (turns[i].pending ?? "")).trim()) turns.splice(i, 1);
  }

  for (const event of chips) {
    const answer = turns.find((t) => t.role === "assistant" && (ends.get(t) ?? t.at ?? "") >= event.at);
    if (!answer) continue;
    const seen = new Set(answer.chips?.map((c) => c.id));
    answer.chips = [...(answer.chips ?? []), ...event.chips.filter((c) => !seen.has(c.id))];
  }

  const lastUser = [...turns].reverse().find((t) => t.role === "user");
  const caption = lastUser ? { text: lastUser.text, live: lastUser.final === false } : null;
  return { turns, caption, lastCall };
}

/**
 * The live conversation as the kit's turns, the caller's latest words, the latest function call,
 * and sendText to ask in text as if spoken (for PromptRail).
 */
export function usePipecatTurns(options: { chips?: ChipEvent[]; timings?: Record<string, CallTiming> } = {}) {
  const { messages, sendText } = usePipecatConversation();
  const { chips, timings } = options;
  return useMemo(
    () => ({
      ...toTurns(messages, { chips, timings }),
      sendText: (text: string) => void sendText(text),
    }),
    [messages, chips, timings, sendText],
  );
}
