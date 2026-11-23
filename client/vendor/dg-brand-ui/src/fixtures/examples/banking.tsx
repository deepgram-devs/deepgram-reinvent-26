import { CardIcon, UserIcon } from "../../icons";
import { NorthwindMark } from "../marks";
import { BUILT_WITH, EN_META, agent, caller, tool } from "../shared";
import type { DemoExample } from "../types";

/** Banking: Northwind Bank's card dispute line. A record with money, signals, and evidence. */
export const bankingExample: DemoExample = {
  id: "banking",
  domain: "Banking: card disputes",
  brand: { name: "Northwind", tagline: "Bank · Card support", deskTagline: "Disputes desk", mark: <NorthwindMark /> },
  personas: [
    {
      id: "cardholder",
      label: "Cardholder",
      mode: "lookup",
      kicker: "Let’s look into that charge",
      title: "Dispute a charge by voice.",
      intro: "Say the last four digits of your card and which charge looks wrong. We’ll find your dispute and tell you where it stands.",
      caption: "Say your card’s last four digits to begin.",
      note: "View only. You can hear where your dispute stands, but not change it. Our disputes team handles updates.",
      prompts: ["My card ends in 2291", "I didn’t get my order from Skyline Electronics"],
    },
    {
      id: "staff",
      label: "Northwind staff",
      mode: "search",
      kicker: "Disputes desk search",
      title: "Search every open dispute by asking.",
      intro: "Ask about any dispute on file. We’ll search them all and show the ones that match.",
      caption: "Ask about any dispute to begin.",
      note: "Staff view. Search and hear any dispute, but not change it. Full card numbers stay hidden.",
      prompts: ["Which disputes are due this week?", "Any disputes over $500?", "Show disputes with fraud signals"],
    },
  ],
  record: {
    id: "DSP-77310",
    noun: "Dispute",
    breadcrumb: "Cards / Disputes /",
    title: "Review this dispute.",
    status: { label: "Merchant contacted", tone: "review" },
    readOnly: true,
    updated: "Last updated Nov 12, 2026",
    steps: [
      { title: "Reported", detail: "Nov 8, 2026", state: "done" },
      { title: "Card replaced", detail: "New card ending 4410", state: "done" },
      { title: "Merchant contacted", detail: "Response due Nov 18", state: "active" },
      { title: "Resolved", detail: "Pending", state: "pending" },
    ],
    tiles: [
      { label: "Cardholder", title: "Jordan Ellis", lines: ["Checking •••• 2291", "Member since 2016"], icon: <UserIcon /> },
      { label: "Disputed charge", title: "Skyline Electronics", lines: ["$842.17", "Nov 6, 2026 · Online"], icon: <CardIcon /> },
    ],
    stats: [
      { label: "Amount", value: "$842.17" },
      { label: "Credit", value: "$842.17" },
      { label: "Reason", value: "Not received" },
      { label: "Due", value: "Nov 18" },
    ],
    sections: [
      {
        type: "fields",
        id: "charge",
        title: "The charge",
        fields: [
          { label: "Merchant", value: "Skyline Electronics" },
          { label: "Date", value: "Nov 6, 2026 · 11:42 PM" },
          { label: "Method", value: "Online, card not present" },
          { label: "Reference", value: "74839201156", numeric: true },
        ],
      },
      {
        type: "tags",
        id: "signals",
        title: "Fraud signals",
        summary: "Card used from a new device",
        level: "bad",
        tags: [{ label: "New device" }, { label: "Shipping ≠ billing" }, { label: "2 declined attempts" }],
      },
      {
        type: "amounts",
        id: "credit",
        title: "Provisional credit",
        rows: [
          { label: "Disputed amount", value: "$842.17" },
          { label: "Credited Nov 9", value: "$842.17", sub: true },
          { label: "Fees", value: "$0.00" },
        ],
        total: { label: "Available now", value: "$842.17" },
      },
      {
        type: "text",
        id: "statement",
        title: "Cardholder statement",
        text: "I ordered headphones on the 6th and never got a shipping notice. The merchant hasn't answered my emails, and the address on the order isn't mine.",
      },
      {
        type: "files",
        id: "evidence",
        title: "Evidence",
        summary: "3 documents on file",
        captions: ["Order confirmation", "Shipping tracking", "Email to merchant"],
      },
    ],
    wideSections: [
      {
        type: "notes",
        id: "history",
        title: "Analyst & history",
        fields: [
          { label: "Analyst", value: "Grace Kim" },
          { label: "Team", value: "Card disputes" },
          { label: "Network case", value: "VX-55021" },
          { label: "Merchant due", value: "Nov 18, 2026" },
        ],
        notes: [
          { date: "Nov 8", text: "Dispute opened by phone. Card locked and replaced." },
          { date: "Nov 9", text: "Provisional credit of $842.17 posted." },
          { date: "Nov 12", text: "Merchant contacted through the card network. Response due Nov 18." },
        ],
      },
    ],
  },
  recordPrompts: ["Is the credit permanent?", "When will I hear back?", "Why was my card replaced?", "What happens if the merchant responds?"],
  found: { kicker: "Found 1 dispute", action: "View dispute details" },
  search: {
    query: "Which disputes are due this week?",
    count: "2 disputes",
    results: [
      {
        recordId: "DSP-77310",
        status: { label: "Merchant contacted", tone: "review" },
        title: "Jordan Ellis",
        subtitle: "Skyline Electronics · $842.17 · Not received",
        meta: { label: "Due", value: "Nov 18" },
      },
      {
        recordId: "DSP-77288",
        status: { label: "Approved", tone: "good" },
        title: "Ana Souza",
        subtitle: "Metro Fitness · $59.00 · Cancelled membership",
        meta: { label: "Due", value: "Nov 17" },
      },
    ],
  },
  conversation: {
    lookup: [
      agent("1", "Thanks for calling Northwind card support. What are the last four digits of your card?", 2),
      caller("2", "It ends in 2291.", 5),
      agent("3", "Got it. Which charge are you calling about?", 7),
      caller("4", "The one from Skyline Electronics"),
    ],
    record: [
      agent("1", "Thanks for calling Northwind card support. What are the last four digits of your card?", 2),
      caller("2", "It ends in 2291. It's about Skyline Electronics.", 5),
      tool("3", "lookup_dispute", { card_last4: "2291", merchant: "Skyline Electronics" }, 6, 860),
      agent("4", "I found it. You already have a provisional credit of $842.17, and the merchant has until November 18th to respond.", 9, [
        { id: "credit", label: "Provisional credit" },
        { id: "history", label: "Due Nov 18" },
      ]),
      caller("5", "Is the credit permanent?"),
    ],
    search: [
      caller("1", "Which disputes are due this week?", 5),
      tool("2", "search_disputes", { question: "Which disputes are due this week?" }, 6, 2100),
      agent("3", "Two disputes are due this week: Jordan Ellis's with Skyline Electronics on the 18th, and Ana Souza's with Metro Fitness, already approved.", 8),
      caller("4", "Open Jordan Ellis's dispute"),
    ],
  },
  shortNames: { lookup_dispute: "dispute.lookup", search_disputes: "disputes.search" },
  meta: EN_META,
  you: "JE",
  about: {
    what: "Northwind Card Support is a voice assistant for card disputes. Cardholders say their card's last four digits and the charge, and it explains where their dispute stands. Staff ask a question, and it searches every dispute.",
    viewOnly: "It’s view only. You can find and hear dispute details, but not change them.",
    builtWith: BUILT_WITH,
    repo: "https://github.com/deepgram-devs/dg-brand-ui",
  },
};
