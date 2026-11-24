import { DocumentIcon, UserIcon } from "../../icons";
import { BrightwaveMark } from "../marks";
import { BUILT_WITH, EN_META, agent, caller, tool } from "../shared";
import type { DemoExample } from "../types";

/**
 * The default example: customer support for Brightwave, a fictional internet provider. A support
 * case fits almost any company, so start here when the domain is new.
 */
export const supportExample: DemoExample = {
  id: "support",
  domain: "Customer support",
  brand: { name: "Brightwave", tagline: "Internet · Support", deskTagline: "Support desk", mark: <BrightwaveMark /> },
  personas: [
    {
      id: "customer",
      label: "Customer",
      mode: "lookup",
      kicker: "Let’s sort it out",
      title: "Fix your internet by voice.",
      intro: "Say your account number and what’s going wrong. We’ll find your case and walk you through what happens next.",
      caption: "Say your account number to begin.",
      note: "View only. You can look up and hear your case by voice, but not change it. Your support team handles updates.",
      prompts: ["My account number is BW-55102", "My internet keeps dropping"],
    },
    {
      id: "staff",
      label: "Brightwave staff",
      mode: "search",
      kicker: "Support desk search",
      title: "Search every open case by asking.",
      intro: "Ask about any case on file. We’ll search them all and show the ones that match.",
      caption: "Ask about any case to begin.",
      note: "Staff view. Search and hear any case, but not change it. Contact details stay hidden.",
      prompts: ["Which cases are waiting on a technician?", "Show me Priya Nair’s open cases", "Any outages in Portland this week?"],
    },
  ],
  record: {
    id: "CASE-20418",
    noun: "Case",
    breadcrumb: "Support / Cases /",
    title: "Review this case.",
    status: { label: "Technician booked", tone: "review" },
    readOnly: true,
    updated: "Last updated Nov 12, 2026",
    steps: [
      { title: "Opened", detail: "Nov 10, 2026", state: "done" },
      { title: "Diagnosed", detail: "Remote line test", state: "done" },
      { title: "Technician visit", detail: "Nov 14 · 9–11 AM", state: "active" },
      { title: "Resolved", detail: "Pending", state: "pending" },
    ],
    tiles: [
      { label: "Customer", title: "Maya Chen", lines: ["Account BW-55102", "Customer since 2021"], icon: <UserIcon /> },
      { label: "Service", title: "Fiber 500", lines: ["Modem •••• 7C21", "$65 / month"], icon: <DocumentIcon /> },
    ],
    stats: [
      { label: "Priority", value: "High" },
      { label: "Affected", value: "3 days" },
      { label: "Credit", value: "$15" },
      { label: "Visit", value: "Nov 14" },
    ],
    sections: [
      {
        type: "fields",
        id: "issue",
        title: "The issue",
        fields: [
          { label: "Type", value: "Intermittent connection drops" },
          { label: "Started", value: "Nov 9, 2026 · 8:15 PM" },
          { label: "Affects", value: "All devices, Wi-Fi and wired" },
        ],
      },
      {
        type: "tags",
        id: "diagnostics",
        title: "Line health",
        summary: "Signal drops at peak hours",
        level: "warn",
        tags: [{ label: "Packet loss 4%" }, { label: "Modem reboots" }, { label: "Firmware 2.1.4", tone: "neutral" }],
      },
      {
        type: "place",
        id: "visit",
        title: "Technician visit",
        roads: ["Alder Street", "Pine Avenue"],
        city: "Portland, OR",
        fields: [
          { label: "Window", value: "Nov 14, 2026 · 9–11 AM" },
          { label: "Technician", value: "Sam Ortiz" },
        ],
      },
      {
        type: "amounts",
        id: "billing",
        title: "Billing",
        rows: [
          { label: "Fiber 500", value: "$65.00" },
          { label: "Equipment rental", value: "$10.00" },
          { label: "Outage credit", value: "−$15.00", sub: true },
        ],
        total: { label: "Next bill", value: "$60.00" },
      },
      {
        type: "text",
        id: "summary",
        title: "In the customer’s words",
        text: "My connection drops every evening around eight, for a minute or two at a time. Restarting the modem helps for a bit, then it happens again.",
      },
    ],
    wideSections: [
      {
        type: "notes",
        id: "history",
        title: "Owner & history",
        fields: [
          { label: "Owner", value: "Priya Nair" },
          { label: "Team", value: "Field operations" },
          { label: "Status", value: "Technician booked" },
          { label: "Next update", value: "Nov 13, 2026" },
        ],
        notes: [
          { date: "Nov 10", text: "Case opened by phone. Remote line test scheduled." },
          { date: "Nov 11", text: "Line test found packet loss at peak hours. $15 credit applied." },
          { date: "Nov 12", text: "Technician visit booked for Nov 14, 9–11 AM." },
        ],
      },
    ],
  },
  recordPrompts: ["When is the technician coming?", "Why does it drop at night?", "What’s my next bill?", "Can I change the visit time?"],
  found: { kicker: "Found 1 case", action: "View case details" },
  search: {
    query: "Which cases are waiting on a technician?",
    count: "2 cases",
    results: [
      {
        recordId: "CASE-20418",
        status: { label: "Technician booked", tone: "review" },
        title: "Maya Chen",
        subtitle: "Fiber 500 · Intermittent drops",
        meta: { label: "Owner", value: "Priya Nair" },
      },
      {
        recordId: "CASE-20377",
        status: { label: "Parts on order", tone: "review" },
        title: "Daniel Okoro",
        subtitle: "Fiber 1000 · No signal at the wall jack",
        meta: { label: "Owner", value: "Luis Ortega" },
      },
    ],
  },
  conversation: {
    lookup: [
      agent("1", "Thanks for calling Brightwave support. What’s your account number?", 2),
      caller("2", "It’s BW-55102.", 5),
      agent("3", "Thanks. And what’s going on with your service?", 7),
      caller("4", "My internet keeps dropping"),
    ],
    record: [
      agent("1", "Thanks for calling Brightwave support. What’s your account number?", 2),
      caller("2", "It’s BW-55102.", 5),
      tool("3", "lookup_case", { account_id: "BW-55102" }, 6, 980),
      agent("4", "I found your case. A technician is booked for November 14th between 9 and 11, and you’ve got a $15 credit on your next bill.", 9, [
        { id: "visit", label: "Technician visit" },
        { id: "billing", label: "Billing" },
      ]),
      caller("5", "Why does it drop at night?"),
    ],
    search: [
      caller("1", "Which cases are waiting on a technician?", 5),
      tool("2", "search_cases", { question: "Which cases are waiting on a technician?" }, 6, 2700),
      agent("3", "Two cases are waiting on a technician: Maya Chen’s, booked for November 14th, and Daniel Okoro’s, waiting on parts.", 8),
      caller("4", "When does Daniel’s part arrive?"),
    ],
  },
  shortNames: { lookup_case: "case.lookup", search_cases: "cases.search" },
  meta: EN_META,
  you: "MC",
  about: {
    what: "Brightwave Support is a voice assistant for internet service. Customers say their account number, and it finds their case and explains what happens next. Staff ask a question, and it searches every case.",
    viewOnly: "It’s view only. You can find and hear case details, but not change them.",
    builtWith: BUILT_WITH,
    repo: "https://github.com/deepgram-devs/dg-brand-ui",
  },
};
