import { CalendarIcon, UserIcon } from "../../icons";
import { CedarMark } from "../marks";
import { BUILT_WITH, EN_META, agent, caller, tool } from "../shared";
import type { DemoExample } from "../types";

/**
 * Healthcare scheduling: Cedar Health's referral line. One persona (the patient) to show an app
 * without staff search. All people and details are invented.
 */
export const healthcareExample: DemoExample = {
  id: "healthcare",
  domain: "Healthcare scheduling",
  brand: { name: "Cedar Health", tagline: "Clinic · Scheduling", mark: <CedarMark /> },
  personas: [
    {
      id: "patient",
      label: "Patient",
      mode: "lookup",
      kicker: "Let’s get you scheduled",
      title: "Book your visit by voice.",
      intro: "Say your member ID and the referral you got. We’ll find it and tell you when and where to go.",
      caption: "Say your member ID to begin.",
      note: "View only. You can hear your referral and visit details, but not change them. Call the clinic to reschedule.",
      prompts: ["My member ID is CH-8812", "I have a dermatology referral"],
    },
  ],
  record: {
    id: "REF-30915",
    noun: "Referral",
    breadcrumb: "Scheduling / Referrals /",
    title: "Review this referral.",
    status: { label: "Scheduled", tone: "good" },
    readOnly: true,
    updated: "Last updated Nov 12, 2026",
    steps: [
      { title: "Referred", detail: "Dr. Amara Okafor", state: "done" },
      { title: "Coverage checked", detail: "Prior authorization approved", state: "done" },
      { title: "Scheduled", detail: "Nov 21 · 10:30 AM", state: "active" },
      { title: "Visit", detail: "Upcoming", state: "pending" },
    ],
    tiles: [
      { label: "Patient", title: "Leo Martins", lines: ["Member •••• 8812", "Primary: Dr. Amara Okafor"], icon: <UserIcon /> },
      { label: "Visit", title: "Dermatology consult", lines: ["Dr. Hannah Lee", "Cedar Health Eastside"], icon: <CalendarIcon /> },
    ],
    stats: [
      { label: "Date", value: "Nov 21" },
      { label: "Time", value: "10:30 AM" },
      { label: "Copay", value: "$30" },
      { label: "Length", value: "30 min" },
    ],
    sections: [
      {
        type: "place",
        id: "location",
        title: "Where to go",
        roads: ["Burnside Street", "12th Avenue"],
        city: "Portland, OR",
        fields: [
          { label: "Clinic", value: "Cedar Health Eastside, Suite 220" },
          { label: "Arrive by", value: "10:15 AM" },
        ],
      },
      {
        type: "tags",
        id: "checklist",
        title: "Before your visit",
        summary: "Bring three things",
        level: "ok",
        tags: [
          { label: "Photo ID", tone: "neutral" },
          { label: "Insurance card", tone: "neutral" },
          { label: "Medication list", tone: "neutral" },
        ],
      },
      {
        type: "fields",
        id: "coverage",
        title: "Coverage",
        fields: [
          { label: "Plan", value: "Cedar Choice PPO" },
          { label: "Prior authorization", value: "Approved Nov 11" },
          { label: "Authorization", value: "PA-2026-44180", numeric: true },
        ],
      },
      {
        type: "amounts",
        id: "costs",
        title: "What you’ll pay",
        rows: [
          { label: "Specialist visit", value: "$210.00" },
          { label: "Covered by plan", value: "−$180.00", sub: true },
        ],
        total: { label: "Your copay", value: "$30.00" },
      },
      {
        type: "text",
        id: "reason",
        title: "Reason for referral",
        text: "A rash on the forearm for three weeks that hasn't cleared with over-the-counter cream. Dr. Okafor asked for a dermatology consult.",
      },
    ],
    wideSections: [
      {
        type: "notes",
        id: "history",
        title: "Care team & history",
        fields: [
          { label: "Referred by", value: "Dr. Amara Okafor" },
          { label: "Specialist", value: "Dr. Hannah Lee" },
          { label: "Coordinator", value: "Rosa Diaz" },
          { label: "Reminder", value: "Nov 20, 2026" },
        ],
        notes: [
          { date: "Nov 7", text: "Referral sent by Dr. Okafor." },
          { date: "Nov 11", text: "Prior authorization approved by the plan." },
          { date: "Nov 12", text: "Visit booked for Nov 21 at 10:30 AM. Reminder set." },
        ],
      },
    ],
  },
  recordPrompts: ["Where do I park?", "What should I bring?", "How much will I pay?", "Can I move it to the afternoon?"],
  found: { kicker: "Found 1 referral", action: "View visit details" },
  conversation: {
    lookup: [
      agent("1", "Thanks for calling Cedar Health scheduling. What’s your member ID?", 2),
      caller("2", "It’s CH-8812.", 5),
      agent("3", "Thanks, Leo. Which referral are you calling about?", 7),
      caller("4", "The dermatology one"),
    ],
    record: [
      agent("1", "Thanks for calling Cedar Health scheduling. What’s your member ID?", 2),
      caller("2", "It’s CH-8812. It's about my dermatology referral.", 5),
      tool("3", "lookup_referral", { member_id: "CH-8812", specialty: "dermatology" }, 6, 740),
      agent("4", "You're booked with Dr. Hannah Lee on November 21st at 10:30, at the Eastside clinic. Your copay is $30.", 9, [
        { id: "location", label: "Where to go" },
        { id: "costs", label: "Copay" },
      ]),
      caller("5", "What should I bring?"),
    ],
  },
  shortNames: { lookup_referral: "referral.lookup" },
  meta: EN_META,
  you: "LM",
  about: {
    what: "Cedar Health Scheduling is a voice assistant for referrals and visits. Patients say their member ID, and it explains when and where their visit is and what to bring.",
    viewOnly: "It’s view only. You can hear visit details, but not change them.",
    builtWith: BUILT_WITH,
    repo: "https://github.com/deepgram-devs/dg-brand-ui",
  },
};
