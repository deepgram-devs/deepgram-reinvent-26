"use client";

import { createContext, useContext, type ReactNode } from "react";

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

type Copy = {
  /** The landing toggle's label */
  label: string;
  kicker: string;
  title: string;
  intro: string;
  trySaying: string[];
  /** Tap-to-ask prompts before anything is on screen */
  prompts: string[];
  caption: string;
  viewOnly: string;
};

// The example questions are real: they match the sample claims in kb-data/claims.
// Claim CLM-2026-847291 belongs to Daniel Mitchell.
export const COPY: Record<Persona, Copy> = {
  policyholder: {
    label: "Policyholder",
    kicker: "No claim loaded",
    title: "Ask for a claim, out loud.",
    intro: "Say your claim number and last name. We’ll pull it up and read back what you need.",
    trySaying: ["“Pull up claim CLM-2026-847291.”", "“The last name is Mitchell.”"],
    prompts: ["Pull up claim CLM-2026-847291", "The last name is Mitchell"],
    caption: "Say your claim number to begin.",
    viewOnly:
      "View only. You can look up and hear claims by voice, but not change them. Your adjuster handles updates.",
  },
  employee: {
    label: "Tri-County staff",
    kicker: "Claims desk",
    title: "Search every claim, out loud.",
    intro: "Ask about any claim on file. We’ll search them all and show the ones that match.",
    trySaying: ["“Which claims are waiting on a title?”", "“Which claims is Luis Ortega adjusting?”"],
    prompts: [
      "Which claims are waiting on a title?",
      "Which claims is Luis Ortega adjusting?",
      "Are there any theft claims?",
      "Which claims are under investigation?",
    ],
    caption: "Ask about any claim to begin.",
    viewOnly:
      "Staff view. Search and hear any claim, but not change it. Contact details, full VINs, and plates stay hidden.",
  },
};

const PersonaContext = createContext<Persona>("policyholder");

export function PersonaProvider({ persona, children }: { persona: Persona; children: ReactNode }) {
  return <PersonaContext.Provider value={persona}>{children}</PersonaContext.Provider>;
}

export function usePersona(): Persona {
  return useContext(PersonaContext);
}

export function usePersonaCopy(): Copy {
  return COPY[usePersona()];
}
