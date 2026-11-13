// Wire contract between the hero component and the agent server.
//
// In the mockup the server is a scripted stand-in (lib/mockAgent.ts). It is
// deliberately shaped like the real thing so the same front end can later point
// at the production Flux voice-agent socket (wss://agent.deepgram.com/v1/agent)
// by swapping the connection — no UI rewrite. Docs Jake flagged:
// https://developers.deepgram.com/docs/voice-agent-outputs

/** Messages the client sends up to the agent. */
export type ClientMessage = { type: "hello" };

/** Whose turn it is, as far as the client can tell. Drives the orb cluster:
 *  listening → it blinks with the visitor's voice; thinking → it shrinks and
 *  expands; speaking → it swirls. */
export type TurnState = "listening" | "thinking" | "speaking";

/** Messages the agent sends down to the client. */
export type ServerMessage =
  | { type: "state"; state: TurnState }
  // Deepgram's per-turn LatencyReport, in milliseconds: how long the visitor waited.
  | { type: "latency"; totalMs?: number; sttMs?: number; tttMs?: number; ttsMs?: number }
  | { type: "prompt"; index: number; total: number; text: string }
  // MOCK-ONLY: the synthesized visitor answer, so the scripted "watch it" flow
  // can show both sides of the exchange. In production the visitor's real speech
  // arrives as live STT, not from the agent.
  | { type: "userTurn"; text: string }
  // The field's convergence signal: as facets accumulate turn by turn, the agent
  // leans toward a persona family with rising confidence (0..1). This is what
  // makes the aura visibly "center in" before the final reveal, so the lean and
  // the reveal MUST name the same persona.
  | { type: "lean"; personaId: string; confidence: number }
  | { type: "reveal"; personaId: string; line?: string };
