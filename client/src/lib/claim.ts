// The claim as the agent sends it after verification: claims.to_client_view
// in the Python app. The agent has already masked it, so everything here is
// safe to show.

import type { Locale, Messages } from "@/i18n";

export type Pair = { label: string; value: string };

export type ClaimView = {
  v: 1;
  claim_id: string;
  policyholder: { name: string };
  policy_number: string;
  claim_type: string;
  date_reported: string;
  status: string;
  coverage: { name: string; value: string }[];
  vehicle: {
    year: string;
    make: string;
    model: string;
    body_style: string;
    color: string;
    vin_last4: string;
    plate_last4: string;
    lienholder: string;
  };
  incident: {
    type: string;
    detail: string;
    date: string;
    time: string;
    weather: string;
    police_report: string;
    injuries: string;
    fault: string;
  };
  location: { address: string; description: string };
  other_party: { driver: string; insurer: string; vehicle: string } | null;
  damage: {
    condition: string;
    exterior_areas: string[];
    interior_areas: string[];
    areas_note: string;
    description: string;
    photo_count: number;
    photos: string[];
  };
  description: string;
  estimate: { items: Pair[]; total: string } | null;
  valuation: (Pair & { sub: boolean })[] | null;
  financials: Pair[];
  adjuster: {
    name: string;
    department: string;
    reference: string;
    status: string;
    next_review: string;
  };
  notes: { date: string; text: string }[];
};

// The parts of a claim the agent can point at: search_knowledge_base's
// `sections` argument, echoed in each claim-focus message.
export type Section =
  | "overview"
  | "progress"
  | "coverage"
  | "policyholder"
  | "vehicle"
  | "incident"
  | "location"
  | "other_party"
  | "damage"
  | "photos"
  | "estimate"
  | "payments"
  | "adjuster"
  | "notes";

// Which card on the review page shows each section
export const SECTION_CARD: Record<Section, string> = {
  overview: "claim-header",
  progress: "claim-progress",
  coverage: "claim-coverage",
  policyholder: "claim-summary",
  vehicle: "claim-summary",
  incident: "claim-incident",
  location: "claim-location",
  other_party: "claim-incident",
  damage: "claim-condition",
  photos: "claim-condition",
  estimate: "claim-estimate",
  payments: "claim-payments",
  adjuster: "claim-adjuster",
  notes: "claim-adjuster",
};

export function sectionLabel(section: Section, claim: ClaimView | null, t: Messages): string {
  switch (section) {
    case "overview":
      return t.claim.claimOpened;
    case "progress":
      return t.claim.progress;
    case "coverage":
      return t.claim.coverage;
    case "policyholder":
      return t.claim.policyholder;
    case "vehicle":
      return t.claim.insuredVehicle;
    case "incident":
      return t.claim.incident;
    case "location":
      return t.claim.whenWhere;
    case "other_party":
      return t.claim.otherDriver;
    case "damage":
      return t.claim.vehicleCondition;
    case "photos":
      return t.claim.photos(claim?.damage.photo_count ?? 0);
    case "estimate":
      return claim?.valuation ? t.claim.totalLoss : t.claim.repairEstimate;
    case "payments":
      return t.claim.payments;
    case "adjuster":
      return t.claim.adjuster;
    case "notes":
      return t.claim.adjusterNotes;
  }
}

// ---------- formatting ----------

/**
 * "2026-11-10" as "Nov 10, 2026" in English, "10 nov 2026" in Spanish, and
 * so on; anything else as written. Records hold calendar dates, not moments,
 * so they're read and written in UTC and never shift a day with the time zone.
 */
export function formatDate(iso: string, locale: Locale, withYear = true): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match.map(Number);
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: withYear ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** "5:42 PM" as "5:42 pm"; ranges and words keep their wording. */
export function formatTime(time: string): string {
  return time.replace(/\b(AM|PM)\b/g, (m) => m.toLowerCase());
}

/** The first clause: "Pending; the driver behind…" becomes "Pending". */
export function firstClause(text: string): string {
  return text.split(/[;,]/)[0].trim();
}

export function vehicleName(claim: ClaimView): string {
  const { year, make, model } = claim.vehicle;
  return [year, make, model].filter(Boolean).join(" ");
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function coverageValue(claim: ClaimView, name: string): string {
  return claim.coverage.find((c) => c.name === name)?.value ?? "";
}

export function financial(claim: ClaimView, label: string): string {
  return claim.financials.find((f) => f.label === label)?.value ?? "";
}

/** "$40 per day, up to 30 days" as "$40 / day". */
export function rentalPerDay(claim: ClaimView, t: Messages): string {
  const value = coverageValue(claim, "Rental reimbursement");
  const match = /(\$[\d,]+) per day/.exec(value);
  return match ? t.review.perDay(match[1]) : value || t.review.notCarried;
}

export type Tone = "review" | "good" | "bad" | "done";

export function statusTone(status: string): Tone {
  const s = status.toLowerCase();
  if (s.startsWith("denied")) return "bad";
  if (s.startsWith("closed")) return "done";
  if (s.startsWith("approved") || s.startsWith("settlement")) return "good";
  return "review";
}

export type ConditionTone = "ok" | "warn" | "bad";

export function conditionTone(condition: string): ConditionTone {
  const c = condition.toLowerCase();
  if (c.startsWith("not drivable") || c.startsWith("stolen")) return "bad";
  if (c.startsWith("damaged")) return "warn";
  return "ok";
}

// ---------- progress ----------

export type StepState = "done" | "active" | "pending" | "stopped";
export type Step = { title: string; detail: string; state: StepState };

/**
 * The claim's progress as the four steps on the review page. The records
 * carry a free-text status, so this maps each one onto the steps.
 */
export function deriveProgress(claim: ClaimView, t: Messages, locale: Locale): { steps: Step[]; current: number } {
  const status = claim.status;
  const s = status.toLowerCase();
  const p = t.progress;
  const review = claim.valuation ? t.claim.totalLoss : p.damageEstimate;
  // The adjuster's status is a record value, so it stays in English
  const nextReview = claim.adjuster.next_review
    ? ` · ${p.nextReview(formatDate(claim.adjuster.next_review, locale, false))}`
    : "";

  const steps: Step[] = [
    { title: p.filed, detail: formatDate(claim.date_reported, locale), state: "done" },
    {
      title: p.adjusterAssigned,
      detail: claim.adjuster.name,
      state: "done",
    },
    { title: review, detail: claim.adjuster.status + nextReview, state: "active" },
    { title: p.settlement, detail: p.pending, state: "pending" },
  ];

  if (s.startsWith("closed")) {
    steps[2] = { ...steps[2], detail: p.complete, state: "done" };
    steps[3] = { title: p.closed, detail: p.claimComplete, state: "done" };
  } else if (s.startsWith("denied")) {
    steps[2] = { ...steps[2], detail: p.reviewed, state: "done" };
    steps[3] = { title: p.denied, detail: claim.adjuster.status, state: "stopped" };
  } else if (s.startsWith("approved") || s.startsWith("settlement")) {
    steps[2] = { ...steps[2], detail: p.complete, state: "done" };
    steps[3] = {
      title: s.startsWith("approved") ? p.approved : p.settlementOffered,
      detail: claim.adjuster.status + nextReview,
      state: "active",
    };
  }

  const current = steps.findIndex((step) => step.state !== "done");
  return { steps, current: current === -1 ? steps.length : current + 1 };
}

// ---------- location ----------

const ROAD = /(?:Interstate \d+|(?:[A-Z][\w'-]*\s)+(?:Road|Highway|Parkway|Lane|Drive|Street|Avenue|Loop|Boulevard|Pike|Way))\b/g;

/** The roads named in a location, for the map: up to two. */
export function roadsIn(address: string): string[] {
  const place = address.split(",").slice(0, -2).join(",") || address;
  const roads = [...place.matchAll(ROAD)].map((m) =>
    m[0].replace(/^(?:Eastbound|Westbound|Northbound|Southbound|Intersection of|Parked on the street in front of)\s+/, ""),
  );
  return [...new Set(roads)].slice(0, 2);
}

/** "…, Louisville, KY 40205" as "Louisville, KY". */
export function cityOf(address: string): string {
  const parts = address.split(",").map((p) => p.trim());
  if (parts.length < 2) return "";
  const state = parts[parts.length - 1].split(" ")[0];
  return `${parts[parts.length - 2]}, ${state}`;
}
