/*
 * The kit's built-in strings, with no React, so <deepgram-data-grid> and other React-free
 * elements share them. strings.tsx re-exports DEFAULT_STRINGS with its provider.
 */

/**
 * Every string the kit's components show on their own: labels, button names, screen reader text.
 * Content (titles, transcripts, record values) always comes in through props instead.
 *
 * To translate the kit, wrap the app in <KitStringsProvider strings={...}> with any subset of these.
 * The source app ships nine languages this way, and switches with the agent's voice.
 */
export const DEFAULT_STRINGS = {
  // Chrome
  settings: "Settings",
  close: "Close",
  back: "Back",
  viewOnly: "View only",
  builtWith: "Built with",
  you: "You",
  copy: "Copy link",
  copied: "Copied",
  openInNewTab: "(opens in a new tab)",

  // Theme (ThemePicker)
  appearance: "Appearance",
  themeDark: "Dark",
  themeLight: "Light",
  themeSystem: "System",
  themeNote: "Changes the record and this panel. The call screens stay dark.",
  themeNoteSystemDark: "Follows your device, which is set to dark right now.",
  themeNoteSystemLight: "Follows your device, which is set to light right now.",

  // Call state
  live: "Live",
  ended: "Ended",
  listening: "Listening",
  thinking: "Thinking",
  searching: "Searching",
  paused: "Paused",
  connecting: "Connecting…",
  startConversation: "Start conversation",
  micNote: "Talk naturally. We’ll ask for microphone access.",

  // Voice session panel
  sessionTitle: "Voice session",
  assistant: "Assistant",
  speaking: "Speaking",
  functionCall: "Function call",
  running: "running",
  done: "done",
  cancelled: "cancelled",
  tryAsking: "Try asking",
  mute: "Mute microphone",
  unmute: "Unmute microphone",
  endConversation: "End conversation",
  liveNote: "Conversation is live. Just talk, and interrupt anytime.",
  pausedNote: "Paused. Close settings to keep talking.",
  endedNote: "This conversation has ended.",
  transcript: "Transcript",
  conversation: "Conversation",
  openConversation: "Open the conversation",
  dockLive: "Conversation is live. Just talk.",
  /** The screen reader name of a function call row */
  callLabel: (name: string, status: string, open: boolean) =>
    `Function call ${name}, ${status}. ${open ? "Hide" : "Show"} the request.`,

  // Records
  open: "Open",
  breadcrumb: "Breadcrumb",
  results: "Results",
  lastUpdated: (date: string) => `Last updated ${date}`,
  scanToOpen: "Scan to open",
  /** A DataGrid with no rows */
  noRows: "No matches.",
  /** The phone layout's sort picker */
  sortBy: "Sort by",
  /** One option in the phone layout's sort picker */
  sortOption: (column: string, direction: "asc" | "desc", numeric: boolean) =>
    `${column}, ${numeric ? (direction === "asc" ? "low to high" : "high to low") : direction === "asc" ? "A to Z" : "Z to A"}`,
  qrLabel: (url: string) => `QR code for ${url}`,
};
