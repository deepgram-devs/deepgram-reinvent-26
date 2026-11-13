// Development only: a claim and a scripted conversation, so the screens can be
// built and checked at /?fixture=CLM-2026-847291 without a call, and the staff
// desk at /?persona=employee&fixture=search.
// claims.json comes from scripts/export_claim_fixtures.py.

import type { ConversationMessage } from "@pipecat-ai/client-react";

import { formatDate, sectionLabel, vehicleName, type ClaimView, type Section } from "@/lib/claim";
import { EMPTY_SESSION, type SessionState } from "@/lib/session";

import claims from "./claims.json";

export type FixtureScreen = "landing" | "listening" | "found" | "review";

export type Fixture = {
  screen: FixtureScreen;
  session: SessionState;
  messages: ConversationMessage[];
};

const ALL = claims as unknown as Record<string, ClaimView>;

export const FIXTURE_IDS = Object.keys(ALL);

function spelled(text: string): string {
  return text.toLowerCase();
}

const VOICE: SessionState["voice"] = {
  voice: "brooke",
  language: "en",
  language_name: "English",
  stt_model: "flux-general-en",
};

/** A clock and message makers for a scripted conversation */
function script() {
  const start = Date.parse("2026-11-12T16:12:00Z");
  let t = 0;
  const at = (seconds = 3) => new Date(start + (t += seconds) * 1000).toISOString();
  const user = (text: string, final = true): ConversationMessage => {
    const createdAt = at();
    return { role: "user", final, createdAt, parts: [{ text, final, createdAt }] };
  };
  const assistant = (text: string): ConversationMessage => {
    const createdAt = at(2);
    return {
      role: "assistant",
      final: true,
      createdAt,
      parts: [{ text: { spoken: text, unspoken: "" }, final: true, createdAt }],
    };
  };
  return { at, user, assistant };
}

export function buildFixture(id: string, screen: FixtureScreen): Fixture {
  const claim = ALL[id] ?? ALL["CLM-2026-847291"];
  const { at, user, assistant } = script();
  const focus: SessionState["focus"] = [];
  const point = (sections: Section[]) =>
    focus.push({ id: focus.length, at: at(1), claim_id: claim.claim_id, sections });

  const last = claim.policyholder.name.split(" ").at(-1) ?? "";
  const messages: ConversationMessage[] = [
    assistant("Thanks for calling Tri-County Insurance auto claims. What's your claim number?"),
    user(`Pull up claim ${claim.claim_id}.`),
    assistant("Sure. What's the policyholder's last name?"),
  ];

  if (screen === "listening") {
    messages.push(user(`It's ${last}`, false));
    return {
      screen,
      messages,
      session: { ...EMPTY_SESSION, focus, latencyMs: 412 },
    };
  }

  messages.push(user(`${last}.`));
  const createdAt = at(1);
  messages.push({
    role: "function_call",
    createdAt,
    parts: [],
    functionCall: {
      function_name: "search_knowledge_base",
      tool_call_id: "fixture-1",
      status: "completed",
      args: {
        claim_id: claim.claim_id,
        last_name: last,
        query: `claim ID ${claim.claim_id} status`,
        sections: ["overview", "progress"],
      },
    },
  });
  point(["overview", "progress"]);
  messages.push(
    assistant(
      `Found it. ${claim.policyholder.name}'s ${spelled(claim.claim_type)} claim for a ${vehicleName(claim)}, reported ${formatDate(claim.date_reported, false)}. It's ${spelled(claim.status)}.`,
    ),
  );
  messages.push(user("Where's the damage?"));
  point(["damage", "photos"]);
  const areas = claim.damage.exterior_areas.join(", ").toLowerCase() || "there's no damage on record";
  messages.push(
    assistant(
      `${areas[0].toUpperCase()}${areas.slice(1)}. It's marked ${spelled(claim.damage.condition)}, and there are ${sectionLabel("photos", claim)} on file.`,
    ),
  );
  messages.push(user(claim.other_party ? "Who was driving the other car?" : "What's the deductible?", false));

  return {
    screen,
    messages,
    session: {
      claim,
      verification: "verified",
      voice: VOICE,
      focus,
      latencyMs: 412,
      highlight: null,
      pendingHighlight: null,
      results: null,
      // Sample bot timings for the function call rows
      calls: { "fixture-1": { ms: 1640 } },
    },
  };
}

/** A staff member's search, as the employee desk shows it. Luis Ortega adjusts two sample claims. */
export function buildSearchFixture(screen: FixtureScreen): Fixture {
  const { at, user, assistant } = script();
  const question = "Which claims is Luis Ortega adjusting?";
  const matched = Object.values(ALL).filter((claim) => claim.adjuster.name === "Luis Ortega");
  const messages: ConversationMessage[] = [
    assistant("Tri-County claims desk. What would you like to look up?"),
  ];

  if (screen === "listening") {
    messages.push(user("Which claims is Luis", false));
    return { screen, messages, session: { ...EMPTY_SESSION, voice: VOICE, latencyMs: 640 } };
  }

  messages.push(user(question));
  const createdAt = at(1);
  messages.push({
    role: "function_call",
    createdAt,
    parts: [],
    functionCall: {
      function_name: "search_claims",
      tool_call_id: "fixture-search-1",
      status: "completed",
      args: { question },
    },
  });
  messages.push(
    assistant(
      `Luis Ortega is adjusting ${matched.length} claims: ${matched
        .map((claim) => `${claim.policyholder.name}'s, which is ${spelled(claim.status.split(",")[0])}`)
        .join(", and ")}.`,
    ),
  );
  messages.push(user("What's the deductible on the Kevin Brooks claim?", false));

  return {
    screen,
    messages,
    session: {
      ...EMPTY_SESSION,
      voice: VOICE,
      latencyMs: 640,
      results: { query: question, claims: matched },
      calls: { "fixture-search-1": { ms: 3870 } },
    },
  };
}
