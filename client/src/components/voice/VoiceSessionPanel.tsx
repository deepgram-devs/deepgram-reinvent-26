"use client";

import { usePipecatClientMicControl } from "@pipecat-ai/client-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { LockIcon, MicIcon, MicOffIcon, WaveIcon } from "@/components/chrome/Pills";
import { useLocale, useT, type Locale } from "@/i18n";
import { initials, sectionLabel, type ClaimView, type Section } from "@/lib/claim";
import { useConversationTurns, type Turn } from "@/lib/conversation";
import { usePersona, usePersonaCopy } from "@/lib/persona";
import { useSession, useSetMic } from "@/lib/session";
import { useSettings } from "@/lib/settings";

/** The time of a turn, without AM or PM in any language: the log is short, and the hour is never in doubt */
function clock(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", second: "2-digit" })
    .formatToParts(date)
    .filter((part) => part.type !== "dayPeriod")
    .map((part) => part.value)
    .join("")
    .trim();
}

function Avatar({ text }: { text: string }) {
  return (
    <span className="label grid size-9 shrink-0 place-items-center rounded-full bg-ink text-[0.6rem] tracking-[0.08em] text-white">
      {text}
    </span>
  );
}

function FocusChips({ sections, claim }: { sections: Section[]; claim: ClaimView | null }) {
  const { pointAt } = useSession();
  const t = useT();
  if (!sections.length || !claim) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {sections.map((section) => (
        <li key={section}>
          <button
            type="button"
            onClick={() => pointAt([section])}
            className="label rounded-full border border-white/40 px-3 py-1 text-[0.65rem] text-white transition hover:bg-white/15"
          >
            ↳ {sectionLabel(section, claim, t)}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Bubble({ turn, you, claim }: { turn: Turn; you: string; claim: ClaimView | null }) {
  const t = useT();
  const locale = useLocale();
  if (turn.role === "tool") return <FunctionCallRow turn={turn} />;
  if (turn.role === "user") {
    const live = !turn.final;
    return (
      <li className="flex flex-col items-end">
        <span className="label mb-1.5 mr-12 text-[0.65rem] text-white/80">
          {live ? (
            <>
              <span className="mr-1">●</span> {t.session.you} · {t.session.speaking}
            </>
          ) : (
            <>
              {t.session.you} · {clock(turn.at, locale)}
            </>
          )}
        </span>
        <div className="flex items-end gap-2.5">
          <p
            className={`max-w-[17rem] rounded-2xl px-4 py-3 text-[1.05rem] leading-snug ${
              live ? "border border-dashed border-white/70 text-white" : "bg-white text-ink"
            }`}
          >
            {turn.spoken}
            {live && <span className="ml-0.5 inline-block h-[1em] w-[0.4em] translate-y-[0.15em] animate-caret bg-white" />}
          </p>
          <Avatar text={you} />
        </div>
      </li>
    );
  }
  return (
    <li className="flex flex-col">
      <span className="label mb-1.5 ml-12 text-[0.65rem] text-white/80">
        {t.session.assistant} · {clock(turn.at, locale)}
      </span>
      <div className="flex items-start gap-2.5">
        <span className="mt-auto grid size-9 shrink-0 place-items-center rounded-full border border-white/40 text-white">
          <WaveIcon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="max-w-[17rem] rounded-2xl border border-white/30 bg-white/12 px-4 py-3 text-[1.05rem] leading-snug text-white">
            {turn.spoken}
            {turn.unspoken && <span className="opacity-55">{turn.unspoken}</span>}
          </p>
          <FocusChips sections={turn.focus} claim={claim} />
        </div>
      </div>
    </li>
  );
}

function CodeIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5.5 4 1.5 8l4 4M10.5 4l4 4-4 4" />
    </svg>
  );
}

function ChevronIcon({ up, className = "size-4" }: { up: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={up ? "m3.5 10 4.5-4.5 4.5 4.5" : "m3.5 6 4.5 4.5 4.5-4.5"} />
    </svg>
  );
}

// Short names for the one-line summary, so the argument fits beside them.
// The full request shows the real function name.
const SHORT_NAME: Record<string, string> = {
  search_knowledge_base: "claim.lookup",
  search_claims: "claims.search",
  set_voice: "voice.set",
  list_voices: "voice.list",
  reset_voice: "voice.reset",
  show_on_screen: "screen.show",
};

// The argument that says what a call is about
const MAIN_ARGUMENT = ["claim_id", "question", "voice", "language", "query", "sections"];

// A string argument as is, and a list of strings (like sections) joined
function argumentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) return value.join(", ");
  return "";
}

function callSummary(name: string, args: Record<string, unknown> = {}): string {
  const key =
    MAIN_ARGUMENT.find((k) => argumentText(args[k])) ?? Object.keys(args).find((k) => argumentText(args[k]));
  return `${SHORT_NAME[name] ?? name}(${key ? argumentText(args[key]) : ""})`;
}

function duration(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function JsonValue({ value }: { value: unknown }) {
  const color = typeof value === "string" ? "text-lime" : typeof value === "number" ? "text-yellow" : "text-orange";
  return <span className={color}>{JSON.stringify(value)}</span>;
}

/** A function call in the chat log: one line, tap it for the full request. Results stay hidden. */
function FunctionCallRow({ turn }: { turn: Turn }) {
  const [open, setOpen] = useState(false);
  const row = useRef<HTMLLIElement>(null);
  const bodyId = useId();
  const t = useT();
  const call = turn.call;
  if (!call?.function_name) return null;

  const running = call.status !== "completed";
  const status = call.cancelled
    ? t.session.cancelled
    : running
      ? t.session.running
      : turn.ms !== undefined
        ? duration(turn.ms)
        : t.session.done;
  const entries: [string, unknown][] = [
    ["function", call.function_name],
    ...Object.entries(call.args ?? {}),
    ...(turn.ms !== undefined ? ([["latency_ms", turn.ms]] as [string, unknown][]) : []),
  ];

  const toggle = () => {
    setOpen(!open);
    // Keep the opened request in view, wherever the row sits in the log
    if (!open) requestAnimationFrame(() => row.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };

  return (
    <li ref={row}>
      <div
        className={`@container overflow-hidden rounded-2xl transition-colors ${
          open ? "bg-ink" : "border border-white/30 bg-white/15 hover:bg-white/20"
        }`}
      >
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={t.session.callLabel(call.function_name, status, open)}
          className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
        >
          <CodeIcon className={`size-4 shrink-0 ${open ? "text-ring-blue" : "text-white"}`} />
          {/* In a narrow panel the icon says it, and the summary gets the room */}
          <span className="label hidden shrink-0 text-[0.65rem] text-white @sm:inline">{t.session.functionCall}</span>
          <span
            title={`${call.function_name}(${JSON.stringify(call.args ?? {})})`}
            className={`min-w-0 flex-1 truncate font-mono text-[0.85rem] ${open ? "text-lime" : "text-white"}`}
          >
            {callSummary(call.function_name, call.args)}
          </span>
          <span className={`shrink-0 font-mono text-[0.8rem] text-yellow ${running ? "animate-caret" : ""}`}>{status}</span>
          <ChevronIcon up={open} className="size-4 shrink-0 text-white" />
        </button>
        {open && (
          <pre
            id={bodyId}
            className="overflow-x-auto border-t border-white/10 px-4 py-3 font-mono text-[0.8rem] leading-relaxed text-white"
          >
            {entries.map(([key, value], i) => (
              <span key={key} className="block">
                <span className="text-ring-blue">&quot;{key}&quot;</span>
                <span className="text-white/50">: </span>
                <JsonValue value={value} />
                {i < entries.length - 1 && <span className="text-white/50">,</span>}
              </span>
            ))}
          </pre>
        )}
      </div>
    </li>
  );
}

export function MicButton({ live }: { live: boolean }) {
  const { isMicEnabled } = usePipecatClientMicControl();
  const setMic = useSetMic();
  const on = live && isMicEnabled;
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => setMic(!isMicEnabled)}
      disabled={!live}
      aria-pressed={!on}
      aria-label={on ? t.session.mute : t.session.unmute}
      className="grid size-14 shrink-0 place-items-center rounded-full border border-white/40 bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-50"
    >
      {on ? <MicIcon /> : <MicOffIcon />}
    </button>
  );
}

export function EndButton({ onEnd, live }: { onEnd: () => void; live: boolean }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onEnd}
      className="label flex h-14 flex-1 items-center justify-center gap-3 rounded-full border-2 border-white/40 text-[0.85rem] text-white transition hover:bg-white/10"
    >
      <WaveIcon />
      {live ? t.session.end : t.session.close}
    </button>
  );
}

export function VoiceSessionPanel({ onEnd, live }: { onEnd: () => void; live: boolean }) {
  const { claim, voice, latencyMs } = useSession();
  const { turns } = useConversationTurns();
  const persona = usePersona();
  const { paused } = useSettings();
  const t = useT();
  const list = useRef<HTMLOListElement>(null);
  // Whether the log is scrolled to its newest item. Scrolling up to read
  // unpins it; scrolling back down pins it again.
  const pinned = useRef(true);
  // A policyholder is the person on their claim; staff browse other people's
  const you = persona === "policyholder" && claim ? initials(claim.policyholder.name) : t.chrome.you;

  // The panel re-renders for every change to the conversation: a new turn,
  // words as they're spoken, a function call, a card the agent points at.
  // After each one, keep the newest item in view, unless the caller is
  // reading further up. Opening a function call row re-renders only the row.
  useLayoutEffect(() => {
    const el = list.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  });

  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const onScroll = () => {
      pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    };
    // The log changes size too, when the window does or the panel's height
    // settles; stay at the bottom through that
    const resize = new ResizeObserver(() => {
      if (pinned.current) el.scrollTop = el.scrollHeight;
    });
    el.addEventListener("scroll", onScroll, { passive: true });
    resize.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      resize.disconnect();
    };
  }, []);

  const meta = [voice?.stt_model ?? "flux-general-en", voice?.language ?? "en", latencyMs !== null ? `${latencyMs} ms` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <section aria-label={t.session.title} className="flex max-h-[calc(100dvh-7rem)] flex-col rounded-[1.75rem] bg-violet p-6 text-white">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{t.session.title}</h2>
          <p className="mt-2 font-mono text-sm text-white/85">{meta}</p>
        </div>
        <span
          className={`label inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.7rem] ${live ? "bg-lime text-ink" : "bg-white/20 text-white"}`}
        >
          <span className="size-1.5 rounded-full bg-current" />
          {live ? t.call.live : t.call.ended}
        </span>
      </header>

      <ol ref={list} className="-mr-2 mt-5 min-h-40 flex-1 space-y-5 overflow-y-auto pr-2" aria-live="polite">
        {turns.map((turn) => (
          <Bubble key={turn.id} turn={turn} you={you} claim={claim} />
        ))}
      </ol>


      <footer className="mt-4">
        <p className="flex items-start gap-2 text-[0.95rem] leading-snug text-white/90">
          <span className={`mt-1.5 size-2 shrink-0 rounded-full ${live && !paused ? "bg-white" : "bg-white/40"}`} />
          {paused ? t.session.pausedNote : live ? t.session.liveNote : t.session.endedNote}
        </p>
        <div className="mt-4 flex items-center gap-3">
          <MicButton live={live} />
          <EndButton onEnd={onEnd} live={live} />
        </div>
      </footer>
    </section>
  );
}

/**
 * Tap-to-ask prompts for what's on screen. `open` is the claim the review
 * screen shows. Staff prompts follow it, not the session's claim, which
 * stays set after a staff member goes back to the results.
 */
export function TryAsking({ claim: open }: { claim?: ClaimView }) {
  const { claim } = useSession();
  const { sendText } = useConversationTurns();
  const persona = usePersona();
  const copy = usePersonaCopy();
  const t = useT();
  // In the UI's language: a tapped prompt is sent as the caller's own words
  const prompts =
    persona === "policyholder" && claim
      ? [
          t.session.askDeductible,
          t.session.askNextReview,
          t.session.askLocationNotes,
          claim.other_party ? t.session.askOtherDriver : t.session.askDamage,
        ]
      : persona === "employee" && open
        ? [
            "What’s the status of this claim?",
            "Who’s the adjuster?",
            open.valuation ? "What’s the total loss valuation?" : "What’s the repair estimate?",
            "What’s the latest note?",
          ]
        : copy.prompts;
  return (
    // text-ink: on the listening screen this white card sits in a text-white aside
    <section className="card p-6 text-ink">
      <h2 className="label text-ink/80">{t.session.tryAsking}</h2>
      <ul className="mt-4 flex flex-wrap gap-2.5">
        {prompts.map((prompt) => (
          <li key={prompt}>
            {sendText ? (
              <button
                type="button"
                onClick={() => sendText(prompt)}
                className="rounded-full border border-line px-4 py-2 text-left transition hover:border-violet hover:text-violet"
              >
                {prompt}
              </button>
            ) : (
              <span className="inline-block rounded-full border border-line px-4 py-2">{prompt}</span>
            )}
          </li>
        ))}
      </ul>
      {sendText && <p className="mt-3 text-sm text-muted">{t.session.tapHint}</p>}
    </section>
  );
}

export function ViewOnlyNote() {
  const copy = usePersonaCopy();
  return (
    <p className="flex gap-3 px-1 text-muted">
      <LockIcon className="mt-1 size-4 shrink-0" />
      {copy.viewOnly}
    </p>
  );
}
