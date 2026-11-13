"use client";

import {
  usePipecatConversation,
  type ConversationMessage,
  type ConversationMessagePart,
  type FunctionCallData,
} from "@pipecat-ai/client-react";
import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { Section } from "./claim";
import { useSession, type CallInfo, type FocusEvent } from "./session";

export type Turn = {
  id: string;
  /** "tool" is a function call, shown as a row in the chat log */
  role: "user" | "assistant" | "tool";
  /** For the agent: what it has said so far, then what it's about to say */
  spoken: string;
  unspoken: string;
  final: boolean;
  at: string;
  /** Parts of the claim the agent pointed at while giving this answer */
  focus: Section[];
  /** For a function call: what was called, and how long it took */
  call?: FunctionCallData;
  ms?: number;
};

export type ConversationValue = {
  turns: Turn[];
  /** The agent's latest tool call, for the tool call card */
  toolCall: FunctionCallData | null;
  /** What the caller is saying right now, or said last */
  caption: { text: string; live: boolean } | null;
  /** Ask the agent in text, as if spoken. Not available in fixtures. */
  sendText?: (text: string) => void;
};

const ConversationContext = createContext<ConversationValue | null>(null);

export function useConversationTurns(): ConversationValue {
  const value = useContext(ConversationContext);
  if (!value) throw new Error("useConversationTurns must be used inside a conversation provider");
  return value;
}

function partText(text: unknown): { spoken: string; unspoken: string } {
  if (typeof text === "string") return { spoken: text, unspoken: "" };
  if (text && typeof text === "object" && "spoken" in text) {
    const { spoken, unspoken } = text as { spoken: string; unspoken: string };
    return { spoken, unspoken };
  }
  return { spoken: "", unspoken: "" };
}

/** Turn Pipecat's conversation messages into the bubbles the panel shows. */
export function toConversation(
  messages: ConversationMessage[],
  focus: FocusEvent[],
  calls: Record<string, CallInfo> = {},
): Omit<ConversationValue, "sendText"> {
  let toolCall: FunctionCallData | null = null;

  // The hook ends an agent turn only when the caller starts speaking, so
  // replies to typed questions arrive merged into one message. Every part
  // has its own time, so lay the agent's parts and the caller's turns out
  // in time order and group the agent's runs of parts into replies.
  type Item = {
    role: Turn["role"];
    at: string;
    part?: ConversationMessagePart;
    call?: FunctionCallData;
    final: boolean;
    key: string;
  };
  const items: Item[] = [];
  messages.forEach((message, index) => {
    if (message.role === "function_call") {
      const call = message.functionCall;
      if (!call?.function_name) return;
      toolCall = call;
      // A row in the log, where the call happened
      items.push({
        role: "tool",
        at: (call.tool_call_id && calls[call.tool_call_id]?.at) || message.createdAt,
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
  // When each turn's latest part arrived
  const ends = new Map<Turn, string>();
  for (const item of items) {
    if (item.call) {
      const ms = item.call.tool_call_id ? calls[item.call.tool_call_id]?.ms : undefined;
      turns.push({
        id: item.key,
        role: "tool",
        spoken: "",
        unspoken: "",
        final: item.final,
        at: item.at,
        focus: [],
        call: item.call,
        ms,
      });
      continue;
    }
    const prev = turns.at(-1);
    const sameTurn =
      prev && prev.role === item.role && (item.role === "assistant" || prev.id === item.key);
    const turn: Turn = sameTurn
      ? prev
      : { id: item.key, role: item.role, spoken: "", unspoken: "", final: item.final, at: item.at, focus: [] };
    if (!sameTurn) turns.push(turn);
    const text = partText(item.part?.text);
    const gap = (item.part?.needsSeparator || item.role === "user") && (turn.spoken || turn.unspoken) ? " " : "";
    if (text.unspoken || turn.unspoken) {
      turn.unspoken += gap + text.spoken + text.unspoken;
    } else {
      turn.spoken += gap + text.spoken;
    }
    turn.final = item.final;
    ends.set(turn, item.at);
  }
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role !== "tool" && !(turns[i].spoken + turns[i].unspoken).trim()) turns.splice(i, 1);
  }

  // Each focus is sent just before the answer it belongs to, so it goes on
  // the first answer still going after it. That answer can start earlier:
  // the filler phrase spoken during the lookup is part of the same turn.
  for (const event of focus) {
    const answer = turns.find((t) => t.role === "assistant" && (ends.get(t) ?? t.at) >= event.at);
    if (answer) answer.focus = [...new Set([...answer.focus, ...event.sections])];
  }

  const lastUser = [...turns].reverse().find((t) => t.role === "user");
  const caption = lastUser ? { text: lastUser.spoken, live: !lastUser.final } : null;
  return { turns, toolCall, caption };
}

/** The focus events for the claim on screen; others point at cards it doesn't have. */
function useClaimFocus(): FocusEvent[] {
  const { focus, claim } = useSession();
  return useMemo(() => focus.filter((event) => event.claim_id === claim?.claim_id), [focus, claim]);
}

/** The live conversation, from the Pipecat client. */
export function LiveConversation({ children }: { children: ReactNode }) {
  const { messages, sendText } = usePipecatConversation();
  const focus = useClaimFocus();
  const { calls } = useSession();
  const value = useMemo(
    () => ({
      ...toConversation(messages, focus, calls),
      sendText: (text: string) => void sendText(text),
    }),
    [messages, focus, calls, sendText],
  );
  return <ConversationContext.Provider value={value}>{children}</ConversationContext.Provider>;
}

/** A fixed conversation, for building screens without a call. */
export function FixtureConversation({
  messages,
  children,
}: {
  messages: ConversationMessage[];
  children: ReactNode;
}) {
  const focus = useClaimFocus();
  const { calls } = useSession();
  const value = useMemo(() => toConversation(messages, focus, calls), [messages, focus, calls]);
  return <ConversationContext.Provider value={value}>{children}</ConversationContext.Provider>;
}
