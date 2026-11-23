/**
 * The conversation as the kit shows it. Build these from whatever the transport gives you:
 * `usePipecatTurns()` in "@deepgram-devs/dg-brand-ui/pipecat" does it for Pipecat, and
 * the fixtures export sample conversations for building screens without a call.
 */

/** Whose turn it is. Drives the voice ring and the status line. */
export type TurnState = "listening" | "thinking" | "speaking";

/** A chip under an agent answer: a part of the screen the answer is about (a FocusTarget id). */
export type TurnChip = { id: string; label: string };

export type FunctionCall = {
  /** The function's real name: search_orders, lookup_account */
  name: string;
  args?: Record<string, unknown>;
  status: "running" | "completed";
  cancelled?: boolean;
  /** How long the call took, when the agent reports it */
  ms?: number;
};

export type Turn = {
  id: string;
  /** "tool" is a function call, shown as a collapsible code row in the log */
  role: "user" | "assistant" | "tool";
  /** What's been said. For the agent, what it has spoken so far. */
  text: string;
  /** The agent only: what it's about to say, shown faded as the speech catches up */
  pending?: string;
  /** False while the caller is still speaking: a dashed bubble with a caret */
  final?: boolean;
  /** ISO time the turn started, shown as a clock time */
  at?: string;
  chips?: TurnChip[];
  call?: FunctionCall;
};

/** The caller's latest words, for the big caption: live while they're still talking */
export type Caption = { text: string; live: boolean };
