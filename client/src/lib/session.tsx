"use client";

import { RTVIEvent } from "@pipecat-ai/client-js";
import { useRTVIClientEvent } from "@pipecat-ai/client-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";

import type { ClaimView, Section } from "./claim";

// Messages the agent sends with RTVIServerMessageFrame (see agent.py)
export type ServerMessage =
  | { type: "claim-loaded"; claim: ClaimView }
  | { type: "claim-focus"; claim_id: string; sections: Section[] }
  | { type: "verification"; status: Exclude<Verification, "idle"> }
  | { type: "voice"; voice: string; language: string; language_name: string; stt_model: string }
  | { type: "search-results"; query: string; claims: ClaimView[] }
  | { type: "function-timing"; tool_call_id: string; ms: number };

export type Verification = "idle" | "checking" | "verified" | "failed" | "locked" | "error";

export type VoiceInfo = Omit<Extract<ServerMessage, { type: "voice" }>, "type">;

export type FocusEvent = { id: number; at: string; claim_id: string; sections: Section[] };

/** An employee's latest search: the question, and the claims the answer names */
export type SearchResults = Omit<Extract<ServerMessage, { type: "search-results" }>, "type">;

/** The cards to light up; the nonce changes each time, so a repeat glows again */
export type Highlight = { claim_id: string; sections: Section[]; nonce: number };

export type SessionState = {
  claim: ClaimView | null;
  verification: Verification;
  voice: VoiceInfo | null;
  /** Each time the agent pointed at part of the claim, oldest first */
  focus: FocusEvent[];
  /** Time from the caller going quiet to the agent starting to speak */
  latencyMs: number | null;
  /** The cards the agent or the caller pointed at last */
  highlight: Highlight | null;
  /** A focus for a claim that isn't on screen yet, applied when it loads */
  pendingHighlight: Highlight | null;
  /** Employees only: the latest search */
  results: SearchResults | null;
  /** Function calls by tool_call_id: when the browser heard of each, and how long the bot took */
  calls: Record<string, CallInfo>;
};

/**
 * Pipecat backdates a function call's createdAt so it sorts before the reply
 * in progress, which can put it above words said before the call. `at` is
 * when the call really came in; `ms` is the bot's own timing.
 */
export type CallInfo = { at?: string; ms?: number };

type Action =
  | { type: "message"; message: ServerMessage; at: string }
  | { type: "latency"; ms: number }
  | { type: "point"; sections: Section[] }
  | { type: "call"; tool_call_id: string; at: string }
  | { type: "reset" };

export const EMPTY_SESSION: SessionState = {
  claim: null,
  verification: "idle",
  voice: null,
  focus: [],
  latencyMs: null,
  highlight: null,
  pendingHighlight: null,
  results: null,
  calls: {},
};

function lightUp(state: SessionState, claim_id: string, sections: Section[]): Highlight {
  return { claim_id, sections, nonce: (state.highlight?.nonce ?? 0) + 1 };
}

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case "reset":
      return EMPTY_SESSION;
    case "latency":
      return { ...state, latencyMs: action.ms };
    case "call":
      // The first time the call is heard of is when it started
      return state.calls[action.tool_call_id]?.at
        ? state
        : {
            ...state,
            calls: { ...state.calls, [action.tool_call_id]: { ...state.calls[action.tool_call_id], at: action.at } },
          };
    case "point":
      return state.claim
        ? { ...state, highlight: lightUp(state, state.claim.claim_id, action.sections) }
        : state;
    case "message": {
      const message = action.message;
      switch (message.type) {
        case "claim-loaded": {
          // The focus for a newly verified claim arrives before the claim
          const pending = state.pendingHighlight;
          const applies = pending?.claim_id === message.claim.claim_id;
          return {
            ...state,
            claim: message.claim,
            verification: "verified",
            highlight: applies
              ? lightUp(state, pending.claim_id, pending.sections)
              : state.highlight?.claim_id === message.claim.claim_id
                ? state.highlight
                : null,
            pendingHighlight: applies ? null : pending,
          };
        }
        case "claim-focus": {
          const focus = [
            ...state.focus,
            { id: state.focus.length, at: action.at, claim_id: message.claim_id, sections: message.sections },
          ];
          const target = { claim_id: message.claim_id, sections: message.sections, nonce: 0 };
          return state.claim?.claim_id === message.claim_id
            ? { ...state, focus, highlight: lightUp(state, message.claim_id, message.sections), pendingHighlight: null }
            : { ...state, focus, pendingHighlight: target };
        }
        case "verification":
          return { ...state, verification: message.status };
        case "function-timing":
          return {
            ...state,
            calls: { ...state.calls, [message.tool_call_id]: { ...state.calls[message.tool_call_id], ms: message.ms } },
          };
        case "search-results":
          return { ...state, results: { query: message.query, claims: message.claims } };
        case "voice":
          return {
            ...state,
            voice: {
              voice: message.voice,
              language: message.language,
              language_name: message.language_name,
              stt_model: message.stt_model,
            },
          };
        default:
          return state;
      }
    }
  }
}

type SessionContextValue = SessionState & {
  reset: () => void;
  /** Scroll a card into view and make it glow */
  pointAt: (sections: Section[]) => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside <SessionProvider>");
  return value;
}

function isServerMessage(data: unknown): data is ServerMessage {
  return typeof data === "object" && data !== null && "type" in data;
}

/**
 * Holds what the agent has told the UI about the call. Live, it listens to
 * the Pipecat client; with `initial`, it starts from a fixture instead.
 */
export function SessionProvider({
  initial,
  children,
}: {
  initial?: SessionState;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, initial ?? EMPTY_SESSION);
  const quietAt = useRef<number | null>(null);

  useRTVIClientEvent(
    RTVIEvent.ServerMessage,
    useCallback((data: unknown) => {
      if (!isServerMessage(data)) return;
      dispatch({ type: "message", message: data, at: new Date().toISOString() });
    }, []),
  );

  useRTVIClientEvent(
    RTVIEvent.LLMFunctionCallInProgress,
    useCallback((data: { tool_call_id?: string }) => {
      if (data.tool_call_id) dispatch({ type: "call", tool_call_id: data.tool_call_id, at: new Date().toISOString() });
    }, []),
  );

  useRTVIClientEvent(
    RTVIEvent.UserStoppedSpeaking,
    useCallback(() => {
      quietAt.current = performance.now();
    }, []),
  );

  useRTVIClientEvent(
    RTVIEvent.BotStartedSpeaking,
    useCallback(() => {
      if (quietAt.current === null) return;
      dispatch({ type: "latency", ms: Math.round(performance.now() - quietAt.current) });
      quietAt.current = null;
    }, []),
  );

  useRTVIClientEvent(
    RTVIEvent.UserStartedSpeaking,
    useCallback(() => {
      quietAt.current = null;
    }, []),
  );

  const reset = useCallback(() => dispatch({ type: "reset" }), []);
  const pointAt = useCallback((sections: Section[]) => dispatch({ type: "point", sections }), []);

  const value = useMemo(() => ({ ...state, reset, pointAt }), [state, reset, pointAt]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
