"use client";

import { createContext, useContext, type ReactNode } from "react";

import { useT, type Messages } from "@/i18n";

/**
 * Who is on the call. It's picked on the landing screen and sent to the bot
 * with the WebRTC offer, so it's fixed for the whole call (see agent.py,
 * persona_from_body).
 */
export type Persona = "policyholder" | "employee";

export const PERSONAS: Persona[] = ["policyholder", "employee"];

export function isPersona(value: unknown): value is Persona {
  return value === "policyholder" || value === "employee";
}

/** The persona's own copy: the landing screen, prompts, and view-only note */
export type Copy = Messages["persona"][Persona];

const PersonaContext = createContext<Persona>("policyholder");

export function PersonaProvider({ persona, children }: { persona: Persona; children: ReactNode }) {
  return <PersonaContext.Provider value={persona}>{children}</PersonaContext.Provider>;
}

export function usePersona(): Persona {
  return useContext(PersonaContext);
}

/** The persona's copy in the UI's language. The example questions match the sample claims in kb-data/claims. */
export function usePersonaCopy(): Copy {
  return useT().persona[usePersona()];
}
