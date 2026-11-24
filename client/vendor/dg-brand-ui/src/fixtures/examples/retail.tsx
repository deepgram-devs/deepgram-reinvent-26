import { BoxIcon, UserIcon } from "../../icons";
import { KettleCrateMark } from "../marks";
import { BUILT_WITH, EN_META, agent, caller, tool } from "../shared";
import type { DemoExample } from "../types";

/** Retail: Kettle & Crate grocery delivery. An order with items, substitutions, and a live delivery. */
export const retailExample: DemoExample = {
  id: "retail",
  domain: "Retail: order delivery",
  brand: { name: "Kettle & Crate", tagline: "Groceries · Delivery", deskTagline: "Orders desk", mark: <KettleCrateMark /> },
  personas: [
    {
      id: "customer",
      label: "Customer",
      mode: "lookup",
      kicker: "Let’s find your order",
      title: "Track your order by voice.",
      intro: "Say your order number or the phone number on the order. We’ll find it and tell you when it’s coming.",
      caption: "Say your order number to begin.",
      note: "View only. You can hear where your order is, but not change it. Changes go through the app.",
      prompts: ["Where’s order ORD-58213?", "My number is 555-0142"],
    },
    {
      id: "staff",
      label: "Store staff",
      mode: "search",
      kicker: "Orders desk search",
      title: "Search every order today by asking.",
      intro: "Ask about any order today. We’ll search them all and show the ones that match.",
      caption: "Ask about any order to begin.",
      note: "Staff view. Search and hear any order, but not change it. Payment details stay hidden.",
      prompts: ["Which orders have substitutions?", "Which deliveries are running late?", "Show Marco’s deliveries"],
    },
  ],
  record: {
    id: "ORD-58213",
    noun: "Order",
    breadcrumb: "Orders / Today /",
    title: "Review this order.",
    status: { label: "Out for delivery", tone: "review" },
    readOnly: true,
    updated: "Last updated 5:48 PM",
    steps: [
      { title: "Ordered", detail: "Nov 12 · 2:05 PM", state: "done" },
      { title: "Packed", detail: "2 substitutions", state: "done" },
      { title: "Out for delivery", detail: "Arriving 6:10–6:30 PM", state: "active" },
      { title: "Delivered", detail: "Pending", state: "pending" },
    ],
    tiles: [
      { label: "Customer", title: "Aisha Rahman", lines: ["Member since 2023", "Crate Plus"], icon: <UserIcon /> },
      { label: "Order", title: "14 items", lines: ["$86.40", "Visa •••• 1182"], icon: <BoxIcon /> },
    ],
    stats: [
      { label: "Total", value: "$86.40" },
      { label: "Arriving", value: "6:10 PM" },
      { label: "Substitutions", value: "2" },
      { label: "Driver", value: "Marco" },
    ],
    sections: [
      {
        type: "place",
        id: "delivery",
        title: "Delivery",
        roads: ["Maple Avenue", "Fifth Street"],
        city: "Austin, TX",
        fields: [
          { label: "Window", value: "Today · 6:10–6:30 PM" },
          { label: "Driver", value: "Marco · Gray Honda Fit" },
        ],
      },
      {
        type: "tags",
        id: "substitutions",
        title: "Substitutions",
        summary: "2 items were swapped",
        level: "warn",
        tags: [
          { label: "Oat milk → Almond milk", tone: "neutral" },
          { label: "Sourdough → Rye loaf", tone: "neutral" },
        ],
      },
      {
        type: "amounts",
        id: "items",
        title: "Items",
        rows: [
          { label: "Produce · 6 items", value: "$24.10" },
          { label: "Dairy & eggs · 3 items", value: "$15.75" },
          { label: "Bakery · 2 items", value: "$11.50" },
          { label: "Pantry · 3 items", value: "$22.06" },
          { label: "Delivery", value: "$4.99" },
          { label: "Tip", value: "$8.00" },
        ],
        total: { label: "Total", value: "$86.40" },
      },
      {
        type: "text",
        id: "instructions",
        title: "Delivery instructions",
        text: "Leave it on the side porch by the blue door. Please don't ring the bell; the baby's asleep.",
      },
    ],
    wideSections: [
      {
        type: "notes",
        id: "history",
        title: "Order history",
        notes: [
          { date: "2:05 PM", text: "Order placed in the app." },
          { date: "4:40 PM", text: "Packed with 2 substitutions; customer approved them by text." },
          { date: "5:48 PM", text: "Picked up by Marco. Arriving 6:10–6:30 PM." },
        ],
      },
    ],
  },
  recordPrompts: ["When will it get here?", "What got substituted?", "Who’s delivering it?", "Can I add eggs?"],
  found: { kicker: "Found 1 order", action: "View order details" },
  search: {
    query: "Which orders have substitutions?",
    count: "2 orders",
    results: [
      {
        recordId: "ORD-58213",
        status: { label: "Out for delivery", tone: "review" },
        title: "Aisha Rahman",
        subtitle: "14 items · 2 substitutions",
        meta: { label: "Driver", value: "Marco" },
      },
      {
        recordId: "ORD-58190",
        status: { label: "Delivered", tone: "good" },
        title: "Ben Carter",
        subtitle: "9 items · 1 substitution",
        meta: { label: "Driver", value: "Jess" },
      },
    ],
  },
  conversation: {
    lookup: [
      agent("1", "Thanks for calling Kettle & Crate. What’s your order number?", 2),
      caller("2", "It’s ORD-58213.", 5),
      agent("3", "Thanks. Can I get the name on the order?", 7),
      caller("4", "Aisha Rahman"),
    ],
    record: [
      agent("1", "Thanks for calling Kettle & Crate. What’s your order number?", 2),
      caller("2", "It’s ORD-58213, for Aisha Rahman.", 5),
      tool("3", "lookup_order", { order_id: "ORD-58213", name: "Aisha Rahman" }, 6, 640),
      agent("4", "Marco has it and he's on his way. He'll be there between 6:10 and 6:30. Two items were swapped, and you approved them by text.", 9, [
        { id: "delivery", label: "Delivery" },
        { id: "substitutions", label: "2 substitutions" },
      ]),
      caller("5", "What got substituted?"),
    ],
    search: [
      caller("1", "Which orders have substitutions?", 5),
      tool("2", "search_orders", { question: "Which orders have substitutions?" }, 6, 1800),
      agent("3", "Two orders today have substitutions: Aisha Rahman's, out for delivery now, and Ben Carter's, already delivered.", 8),
      caller("4", "Open Aisha's order"),
    ],
  },
  shortNames: { lookup_order: "order.lookup", search_orders: "orders.search" },
  meta: EN_META,
  you: "AR",
  about: {
    what: "Kettle & Crate Orders is a voice assistant for grocery delivery. Customers say their order number, and it tells them when it's coming and what changed. Store staff ask a question, and it searches every order today.",
    viewOnly: "It’s view only. You can find and hear order details, but not change them.",
    builtWith: BUILT_WITH,
    repo: "https://github.com/deepgram-devs/dg-brand-ui",
  },
};
