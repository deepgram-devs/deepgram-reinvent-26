import type { ReactNode } from "react";

import type { RecordView } from "../data/RecordView";
import type { Stat } from "../data/records";
import type { ResultCardProps } from "../data/results";
import type { Turn } from "../voice/types";

/**
 * Everything that changes from one voice agent app to the next, as data. The reference screens in
 * stories/screens/templates.tsx take one of these, so a new domain is a new DemoExample, not new
 * screens. Copy an example from src/fixtures/examples/ and rewrite it for your domain.
 */
export type DemoExample = {
  /** A short key: "support", "banking" */
  id: string;
  /** What kind of app it is, for menus: "Customer support" */
  domain: string;

  /** The fictional company. Never a real one, never Deepgram. */
  brand: {
    name: string;
    /** Under the name on the record's top bar: "Internet · Support" */
    tagline: string;
    /** After the name on the staff stage: "Support desk" */
    deskTagline?: string;
    /** A 32×32 mark: see the mark recipe in the fictional-brand skill */
    mark: ReactNode;
  };

  /** The landing photo. Leave it out and the landing shows the kit's landing texture. */
  hero?: { src: string; alt: string; position?: string };

  /** Who can call. One or two; the landing toggle shows when there are two. */
  personas: Persona[];

  /** The record the agent finds and talks about */
  record: RecordView;
  /** Prompts while the record is open: questions the agent answers from it */
  recordPrompts: string[];
  /** The phone's found card, before the record opens */
  found: { kicker: string; action: string; stats?: Stat[] };

  /** Staff search: the question and the matching records */
  search?: {
    query: string;
    /** "2 cases" */
    count: string;
    results: Omit<ResultCardProps, "onOpen">[];
  };

  /** Sample conversations for each screen */
  conversation: {
    /** Finding the record: ends with the caller mid-sentence */
    lookup: Turn[];
    /** With the record open: a function call, an answer with focus chips, a live question */
    record: Turn[];
    search?: Turn[];
  };

  /** Short names for function rows: { lookup_case: "case.lookup" } */
  shortNames: Record<string, string>;
  /** The panel's meta line: speech model, language, latency */
  meta: string;
  /** The caller's avatar text on the record screen */
  you: string;

  /** The Settings drawer's About section */
  about: { what: string; viewOnly: string; builtWith: string; repo: string };
};

export type Persona = {
  /** "customer", "staff" */
  id: string;
  /** The landing toggle's label: "Customer", "Brightwave staff" */
  label: string;
  /** "lookup" finds one record; "search" asks across all of them (staff) */
  mode: "lookup" | "search";
  /** Letter-spaced above the title: "Let’s sort it out" */
  kicker: string;
  /** Six words or fewer, with a period: "Fix your internet by voice." */
  title: string;
  /** What to say, then what happens */
  intro: string;
  /** The stage caption before anyone speaks: "Say your account number to begin." */
  caption: string;
  /** Under the panel: what this caller can and can't do */
  note: string;
  /** Prompts before a record is open */
  prompts: string[];
};
