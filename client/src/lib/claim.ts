// The claim as the agent sends it after verification: claims.to_client_view
// in the Python app. The agent has already masked it, so everything here is
// safe to show.

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

export function sectionLabel(section: Section, claim: ClaimView | null): string {
  switch (section) {
    case "overview":
      return "Claim opened";
    case "progress":
      return "Claim progress";
    case "coverage":
      return "Coverage";
    case "policyholder":
      return "Policyholder";
    case "vehicle":
      return "Insured vehicle";
    case "incident":
      return "Incident";
    case "location":
      return "When and where";
    case "other_party":
      return "Other driver";
    case "damage":
      return "Vehicle condition";
    case "photos": {
      const count = claim?.damage.photo_count ?? 0;
      return `${count} photo${count === 1 ? "" : "s"}`;
    }
    case "estimate":
      return claim?.valuation ? "Total loss valuation" : "Repair estimate";
    case "payments":
      return "Payments";
    case "adjuster":
      return "Adjuster";
    case "notes":
      return "Adjuster notes";
  }
}

// ---------- formatting ----------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-10" as "Nov 10, 2026"; anything else as written. */
export function formatDate(iso: string, withYear = true): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match;
  const text = `${MONTHS[Number(month) - 1]} ${Number(day)}`;
  return withYear ? `${text}, ${year}` : text;
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
export function rentalPerDay(claim: ClaimView): string {
  const value = coverageValue(claim, "Rental reimbursement");
  const match = /(\$[\d,]+) per day/.exec(value);
  return match ? `${match[1]} / day` : value || "Not carried";
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
export function deriveProgress(claim: ClaimView): { steps: Step[]; current: number } {
  const status = claim.status;
  const s = status.toLowerCase();
  const review = claim.valuation ? "Total loss valuation" : "Damage estimate";
  const nextReview = claim.adjuster.next_review
    ? ` · next review ${formatDate(claim.adjuster.next_review, false)}`
    : "";

  const steps: Step[] = [
    { title: "Filed", detail: formatDate(claim.date_reported), state: "done" },
    {
      title: "Adjuster assigned",
      detail: claim.adjuster.name,
      state: "done",
    },
    { title: review, detail: claim.adjuster.status + nextReview, state: "active" },
    { title: "Settlement", detail: "Pending", state: "pending" },
  ];

  if (s.startsWith("closed")) {
    steps[2] = { ...steps[2], detail: "Complete", state: "done" };
    steps[3] = { title: "Closed", detail: "Claim complete", state: "done" };
  } else if (s.startsWith("denied")) {
    steps[2] = { ...steps[2], detail: "Reviewed", state: "done" };
    steps[3] = { title: "Denied", detail: claim.adjuster.status, state: "stopped" };
  } else if (s.startsWith("approved") || s.startsWith("settlement")) {
    steps[2] = { ...steps[2], detail: "Complete", state: "done" };
    steps[3] = {
      title: s.startsWith("approved") ? "Approved" : "Settlement offered",
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
