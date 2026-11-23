import { UserIcon } from "../../icons";
import { CarIcon, WrecklessMark } from "../marks";
import { ASSET_BASE, BUILT_WITH, EN_META, agent, caller, tool } from "../shared";
import type { DemoExample } from "../types";

/**
 * The source app: Wreckless, a fictional auto insurer, and its claims agent (AWS re:Invent 2026).
 * The only example with a hero photo.
 */
export const insuranceExample: DemoExample = {
  id: "insurance",
  domain: "Auto insurance claims",
  brand: { name: "Wreckless", tagline: "Insurance · Claims", deskTagline: "Claims desk", mark: <WrecklessMark /> },
  hero: { src: `${ASSET_BASE}/examples/hero-coastal-highway.jpg`, alt: "A purple sedan on a coastal highway at sunset", position: "70% center" },
  personas: [
    {
      id: "policyholder",
      label: "Policyholder",
      mode: "lookup",
      kicker: "Let’s find your claim",
      title: "Check on your claim by voice.",
      intro: "Say your claim number and last name. We’ll pull it up and read back what you need.",
      caption: "Say your claim number to begin.",
      note: "View only. You can look up and hear claims by voice, but not change them. Your adjuster handles updates.",
      prompts: ["Pull up claim CLM-2026-847291", "The last name is Mitchell"],
    },
    {
      id: "staff",
      label: "Wreckless staff",
      mode: "search",
      kicker: "Claims desk search",
      title: "Search every claim on file by asking.",
      intro: "Ask about any claim on file. We’ll search them all and show the ones that match.",
      caption: "Ask about any claim to begin.",
      note: "Staff view. Search and hear any claim, but not change it. Contact details, full VINs, and plates stay hidden.",
      prompts: ["Which claims are waiting on a title?", "Which claims is Luis Ortega adjusting?", "Are there any theft claims?"],
    },
  ],
  record: {
    id: "CLM-2026-847291",
    noun: "Claim",
    breadcrumb: "Claims / Auto /",
    title: "Review this claim.",
    status: { label: "Under investigation", tone: "review" },
    readOnly: true,
    updated: "Last updated Nov 11, 2026",
    steps: [
      { title: "Filed", detail: "Nov 10, 2026", state: "done" },
      { title: "Adjuster assigned", detail: "Rebecca Thompson", state: "done" },
      { title: "Damage estimate", detail: "Awaiting vehicle inspection · next review Nov 16", state: "active" },
      { title: "Settlement", detail: "Pending", state: "pending" },
    ],
    tiles: [
      { label: "Policyholder", title: "Daniel Mitchell", lines: ["Policy WRK-AUTO-482977", "Reported Nov 10, 2026"], icon: <UserIcon /> },
      { label: "Insured vehicle", title: "2023 Toyota Camry SE", lines: ["VIN •••• 7291", "Plate •••• 4829"], icon: <CarIcon className="h-5 w-10" /> },
    ],
    stats: [
      { label: "Coverage", value: "Collision" },
      { label: "Deductible", value: "$500" },
      { label: "Rental", value: "$40 / day" },
      { label: "Fault", value: "Pending" },
    ],
    sections: [
      {
        type: "place",
        id: "location",
        title: "When & where",
        roads: ["Taylorsville Road", "Hikes Lane"],
        city: "Louisville, KY",
        fields: [
          { label: "Date", value: "Nov 10, 2026 · 5:42 PM" },
          { label: "Location", value: "Taylorsville Rd & Hikes Ln, Louisville, KY" },
        ],
      },
      {
        type: "fields",
        id: "incident",
        title: "Incident",
        fields: [
          { label: "Type", value: "Collision" },
          { label: "Detail", value: "Rear-ended at a stop light, then pushed into the car ahead." },
        ],
        more: [
          { label: "Other driver’s vehicle", value: "2018 Ford F-150" },
          { label: "Other driver", value: "Marcus Hale · Lakeside Mutual" },
          { label: "Police report", value: "LPD-2026-118204", numeric: true },
        ],
      },
      {
        type: "tags",
        id: "condition",
        title: "Vehicle condition",
        summary: "Damaged but safe to drive",
        level: "warn",
        tags: [{ label: "Front" }, { label: "Hood" }, { label: "Passenger Front" }, { label: "Rear" }],
      },
      {
        type: "amounts",
        id: "estimate",
        title: "Repair estimate",
        rows: [
          { label: "Front bumper replacement", value: "$1,250" },
          { label: "Hood repair and paint", value: "$880" },
          { label: "Headlight assembly", value: "$640" },
          { label: "Rear bumper cover", value: "$720" },
          { label: "Labor", value: "$1,140" },
        ],
        total: { label: "Total estimate", value: "$4,630" },
      },
      {
        type: "files",
        id: "photos",
        title: "Damage photos",
        summary: "5 photos on file",
        captions: ["Front bumper", "Hood crease", "Passenger headlight", "Rear bumper", "Trunk seam"],
      },
      {
        type: "amounts",
        id: "coverage",
        title: "Coverage",
        rows: [
          { label: "Collision", value: "$500 deductible" },
          { label: "Comprehensive", value: "$250 deductible" },
          { label: "Rental reimbursement", value: "$40 / day" },
          { label: "Roadside", value: "Included" },
        ],
      },
      {
        type: "text",
        id: "story",
        title: "What happened",
        text: "Daniel was stopped at the light on Taylorsville Road when a pickup hit him from behind and pushed him into the car ahead. No one was hurt. Police took a report at the scene.",
      },
    ],
    wideSections: [
      {
        type: "notes",
        id: "adjuster",
        title: "Adjuster & notes",
        fields: [
          { label: "Adjuster", value: "Rebecca Thompson" },
          { label: "Department", value: "Auto claims" },
          { label: "Status", value: "Active" },
          { label: "Next review", value: "Nov 16, 2026" },
        ],
        notes: [
          { date: "Nov 10", text: "Claim filed by phone. Photos received." },
          { date: "Nov 11", text: "Assigned to Rebecca Thompson. Rental authorized." },
          { date: "Nov 11", text: "Inspection booked at Hikes Lane Collision for Nov 14." },
        ],
      },
    ],
  },
  recordPrompts: ["What’s the deductible?", "When is the next review?", "Read the location notes", "Who was driving the other car?"],
  found: { kicker: "Found 1 claim", action: "View claim details" },
  search: {
    query: "Which claims is Luis Ortega adjusting?",
    count: "2 claims",
    results: [
      {
        recordId: "CLM-2026-159827",
        status: { label: "Settlement offered", tone: "good" },
        title: "Linda Park",
        subtitle: "2019 Honda Civic Sport · Theft",
        meta: { label: "Adjuster", value: "Luis Ortega" },
      },
      {
        recordId: "CLM-2026-215774",
        status: { label: "Pending police follow-up", tone: "review" },
        title: "Kevin Brooks",
        subtitle: "2020 Subaru Outback Premium · Uninsured motorist property damage",
        meta: { label: "Adjuster", value: "Luis Ortega" },
      },
    ],
  },
  conversation: {
    lookup: [
      agent("1", "Thanks for calling Wreckless auto claims. What’s your claim number?", 2),
      caller("2", "Pull up claim CLM-2026-847291.", 5),
      agent("3", "Sure. What’s the policyholder’s last name?", 7),
      caller("4", "It's Mitchell"),
    ],
    record: [
      agent("1", "Thanks for calling Wreckless auto claims. What’s your claim number?", 2),
      caller("2", "Pull up claim CLM-2026-847291. The last name is Mitchell.", 5),
      tool("3", "search_knowledge_base", { claim_id: "CLM-2026-847291", last_name: "Mitchell" }, 6, 1240),
      agent("4", "Front, hood, passenger front, rear. It's marked damaged but safe to drive, and there are 5 photos on file.", 9, [
        { id: "condition", label: "Vehicle condition" },
        { id: "photos", label: "5 photos" },
      ]),
      caller("5", "Who was driving the other car?"),
    ],
    search: [
      caller("1", "Which claims is Luis Ortega adjusting?", 5),
      tool("2", "search_claims", { question: "Which claims is Luis Ortega adjusting?" }, 6, 3900),
      agent("3", "Luis Ortega is adjusting 2 claims: Linda Park's, which is settlement offered, and Kevin Brooks's, which is pending police follow-up.", 8),
      caller("4", "What's the deductible on the Kevin Brooks claim?"),
    ],
  },
  shortNames: { search_knowledge_base: "claim.lookup", search_claims: "claims.search", set_voice: "voice.set" },
  meta: EN_META,
  you: "DM",
  about: {
    what: "Wreckless Claims is a voice assistant for auto insurance claims. Policyholders ask for their claim by number and last name, and it reads back what they need. Wreckless staff ask a question, and it searches every claim for the answer.",
    viewOnly: "It’s view only. You can find and hear claim details, but not change them.",
    builtWith: BUILT_WITH,
    repo: "https://github.com/deepgram-devs/deepgram-reinvent-26",
  },
};
