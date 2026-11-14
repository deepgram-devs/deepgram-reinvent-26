"use client";

import { usePipecatClient, usePipecatClientTransportState } from "@pipecat-ai/client-react";
import { create } from "qrcode";
import Image from "next/image";
import { type ComponentProps, type KeyboardEvent as ReactKeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";

import { PartnerFooter } from "@/components/chrome/PartnerFooter";
import { blurb, nativeLanguageName, useT } from "@/i18n";
import { usePreferences } from "@/lib/preferences";
import { LANGUAGES, voicesFor, voiceTitle } from "@/lib/voices";

// This app's source. The QR code below encodes the same address.
export const REPO_URL = "https://github.com/deepgram-devs/deepgram-reinvent-26";
const REPO_LABEL = REPO_URL.replace(/^https:\/\//, "");

function CloseIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="m5 5 10 10M15 5 5 15" />
    </svg>
  );
}

function GitHubIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
    </svg>
  );
}

function CopyIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

function CheckIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4.5 10.5 3.5 3.5 7.5-8" />
    </svg>
  );
}

/** The repo address as a QR code, drawn as one SVG path, one square per dark module */
function RepoQrCode({ className = "" }: { className?: string }) {
  const t = useT();
  const { size, path } = useMemo(() => {
    const { modules } = create(REPO_URL, { errorCorrectionLevel: "M" });
    let d = "";
    for (let row = 0; row < modules.size; row++) {
      for (let col = 0; col < modules.size; col++) {
        if (modules.data[row * modules.size + col]) d += `M${col} ${row}h1v1h-1z`;
      }
    }
    return { size: modules.size, path: d };
  }, []);
  return (
    <svg
      viewBox={`-2 -2 ${size + 4} ${size + 4}`}
      className={className}
      role="img"
      aria-label={t.settings.qrLabel(REPO_LABEL)}
      shapeRendering="crispEdges"
    >
      <rect x="-2" y="-2" width={size + 4} height={size + 4} fill="#ffffff" />
      <path d={path} fill="var(--color-ink)" />
    </svg>
  );
}

function CopyRepoButton() {
  const [copied, setCopied] = useState(false);
  const t = useT();
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(REPO_URL).then(() => setCopied(true), () => {});
      }}
      aria-label={copied ? t.settings.copied : t.settings.copy}
      className="grid size-11 shrink-0 place-items-center rounded-full border border-line bg-card text-ink transition hover:bg-paper"
    >
      {copied ? <CheckIcon className="size-4 text-violet" /> : <CopyIcon />}
    </button>
  );
}

/**
 * A select with its own chevron. The browser places its native arrow hard
 * against the edge and padding can't move it, so it's hidden and drawn here.
 */
function Select(props: ComponentProps<"select">) {
  return (
    <div className="relative mt-2">
      <select
        {...props}
        className="peer h-12 w-full appearance-none truncate rounded-full border border-line bg-card pr-11 pl-4 text-[1.05rem] text-ink transition hover:border-ink/40 disabled:cursor-not-allowed disabled:opacity-60"
      />
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-ink/70 peer-disabled:opacity-60"
      >
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/**
 * Each language's flag, from the round set on deepgram.com, kept in
 * public/flags so the picker doesn't depend on a CDN. Portuguese shows
 * Brazil's: most of its voices, and this UI's copy, are Brazilian.
 */
const FLAGS: Record<string, string> = {
  en: "/flags/en.svg",
  es: "/flags/es.png",
  fr: "/flags/fr.svg",
  de: "/flags/de.svg",
  hi: "/flags/hi.svg",
  ru: "/flags/ru.png",
  pt: "/flags/pt.png",
  it: "/flags/it.svg",
  nl: "/flags/nl.png",
};

function Flag({ code }: { code: string }) {
  const src = FLAGS[code];
  if (!src) return <span className="size-6 shrink-0" />;
  // Decorative: the language's name is always beside it
  return <Image src={src} alt="" width={24} height={24} unoptimized className="size-6 shrink-0 rounded-full" />;
}

/**
 * The language picker, with each language's flag. A native select can't show
 * images in its options, so this is the select-only combobox pattern from the
 * ARIA Authoring Practices: a button that opens a listbox, with the arrow
 * keys, Home, End, Enter, Space, Escape, and type-to-jump.
 */
function LanguageSelect({
  id,
  labelId,
  value,
  disabled,
  onChange,
}: {
  id: string;
  /** The visible label's id, which names the list too */
  labelId: string;
  value: string;
  disabled: boolean;
  onChange: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const names = useMemo(() => LANGUAGES.map((language) => nativeLanguageName(language.code, language.name)), []);
  const selected = Math.max(0, LANGUAGES.findIndex((language) => language.code === value));
  // Disabled while a call connects; a list left open then closes with it
  const shown = open && !disabled;
  const optionId = (index: number) => `${listId}-${index}`;

  // A press anywhere else closes the list
  useEffect(() => {
    if (!shown) return;
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [shown]);

  // Keep the highlighted option in view as the keys move it
  useEffect(() => {
    if (shown) document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
  });

  const show = () => {
    setActive(selected);
    setOpen(true);
  };
  const choose = (index: number) => {
    setOpen(false);
    button.current?.focus();
    if (LANGUAGES[index].code !== value) onChange(LANGUAGES[index].code);
  };
  // The next language after the highlighted one whose name starts with this key
  const jump = (key: string) => {
    const k = key.toLocaleLowerCase();
    for (let step = 1; step <= names.length; step++) {
      const index = (active + step) % names.length;
      if (names[index].toLocaleLowerCase().startsWith(k)) return index;
    }
    return -1;
  };

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (!shown) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        show();
      }
      // Enter and Space reach the button's click, which opens the list
      return;
    }
    const last = LANGUAGES.length - 1;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((index) => Math.min(index + 1, last));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((index) => Math.max(index - 1, 0));
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(last);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(active);
        break;
      case "Escape":
        // Close the list, not the drawer: the drawer skips an Escape that's
        // been handled. React listens on the document, as the drawer does,
        // so stopPropagation() couldn't keep it from the drawer.
        event.preventDefault();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          const index = jump(event.key);
          if (index >= 0) setActive(index);
        }
    }
  };

  return (
    <div ref={root} className="relative mt-2">
      <button
        ref={button}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={shown ? optionId(active) : undefined}
        disabled={disabled}
        onClick={() => (shown ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        className="flex h-12 w-full items-center gap-2.5 rounded-full border border-line bg-card pr-11 pl-3 text-left text-[1.05rem] text-ink transition hover:border-ink/40 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Flag code={LANGUAGES[selected].code} />
        <span className="truncate" lang={LANGUAGES[selected].code}>
          {names[selected]}
        </span>
      </button>
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className={`pointer-events-none absolute top-6 right-4 size-4 -translate-y-1/2 text-ink/70 transition-transform ${shown ? "rotate-180" : ""} ${disabled ? "opacity-60" : ""}`}
      >
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {shown && (
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={labelId}
          // Keep focus on the button while an option is clicked
          onMouseDown={(event) => event.preventDefault()}
          className="absolute inset-x-0 top-full z-10 mt-2 max-h-[26rem] overflow-y-auto rounded-[1.625rem] border border-line bg-card p-1.5 shadow-xl"
        >
          {LANGUAGES.map((language, index) => (
            <li
              key={language.code}
              id={optionId(index)}
              role="option"
              aria-selected={index === selected}
              lang={language.code}
              onPointerEnter={() => setActive(index)}
              onClick={() => choose(index)}
              className={`flex cursor-pointer items-center gap-2.5 rounded-full py-2 pr-3 pl-2 text-[1.05rem] text-ink ${index === active ? "bg-ink/[0.06]" : ""}`}
            >
              <Flag code={language.code} />
              <span className="flex-1 truncate">{names[index]}</span>
              {index === selected && <CheckIcon className="size-4 shrink-0 text-ink/70" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The voice, and with it the language of the agent and of this UI. Picking a
 * language picks its first suggested voice, so one choice is enough to switch.
 * Between calls it sets the voice the next call starts in; during a call it
 * also switches the agent's voice right away.
 */
function VoicePicker() {
  const t = useT();
  const { voice, setVoice } = usePreferences();
  const client = usePipecatClient();
  const state = usePipecatClientTransportState();
  const languageId = useId();
  const voiceId = useId();
  const live = state === "ready";
  // Connecting: the start voice has gone out with the request, and the bot
  // can't take a switch yet, so a pick now would be lost
  const connecting = !live && !["initialized", "disconnected", "error", "disconnecting"].includes(state);

  const pick = (name: string) => {
    setVoice(name);
    if (!live) return;
    try {
      client?.sendClientMessage("set-voice", { voice: name });
    } catch {
      // The call ended as the voice was picked; it's still the next call's voice
    }
  };

  return (
    <section>
      <h3 className="label text-ink/80">{t.settings.voice}</h3>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <label id={`${languageId}-label`} htmlFor={languageId} className="text-sm text-muted">
            {t.settings.language}
          </label>
          <LanguageSelect
            id={languageId}
            labelId={`${languageId}-label`}
            value={voice.lang}
            disabled={connecting}
            onChange={(code) => pick(voicesFor(code)[0].name)}
          />
        </div>
        <div>
          <label htmlFor={voiceId} className="text-sm text-muted">
            {t.settings.voice}
          </label>
          <Select
            id={voiceId}
            value={voice.name}
            disabled={connecting}
            onChange={(event) => pick(event.target.value)}
          >
            {voicesFor(voice.lang).map((option) => (
              <option key={option.name} value={option.name}>
                {voiceTitle(option)} · {blurb(t, option.blurb)}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <p className="mt-3 leading-relaxed text-muted">
        {connecting ? t.settings.voiceNoteConnecting : live ? t.settings.voiceNoteLive : t.settings.voiceNoteIdle}
      </p>
    </section>
  );
}

/**
 * About this app: a drawer on the right. It opens below a top bar when the
 * screen has one (marked data-top-bar), so the bar's "Paused" note stays in
 * view.
 */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const [top] = useState(() =>
    typeof document === "undefined"
      ? 0
      : Math.max(0, document.querySelector("[data-top-bar]")?.getBoundingClientRect().bottom ?? 0),
  );

  useEffect(() => {
    // Focus moves into the drawer, and back to whatever opened it on close
    const opener = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // An open list inside the drawer handles Escape first, and only it closes
        if (!event.defaultPrevented) onClose();
        return;
      }
      // Keep Tab inside the drawer while it's open
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), select:not([disabled]), input:not([disabled])",
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = scroll;
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40" style={{ top }}>
      <div className="absolute inset-0 bg-ink/55 animate-fade" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="absolute inset-y-0 right-0 flex w-full max-w-[30rem] animate-slide lg:max-w-xl 2xl:max-w-2xl flex-col bg-paper text-ink shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-7 pt-7 pb-6">
          <div>
            <p className="label text-ink/80">{t.chrome.settings}</p>
            <h2 id="settings-title" className="mt-2 text-[2rem] leading-tight font-semibold tracking-tight">
              {t.settings.title}
            </h2>
          </div>
          <button
            ref={close}
            type="button"
            onClick={onClose}
            aria-label={t.settings.close}
            className="grid size-11 shrink-0 place-items-center rounded-full border border-line text-ink transition hover:bg-card"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="flex-1 space-y-8 overflow-y-auto px-7 py-7">
          <VoicePicker />

          <section>
            <h3 className="label text-ink/80">{t.settings.whatItDoes}</h3>
            <p className="mt-3 text-[1.1rem] leading-relaxed">{t.settings.about}</p>
            <p className="mt-4 text-[1.1rem] leading-relaxed">{t.settings.viewOnly}</p>
            <p className="mt-4 leading-relaxed text-muted">{t.settings.builtWith}</p>
          </section>

          <section>
            <h3 className="label text-ink/80">{t.settings.sourceCode}</h3>
            <div className="mt-3 flex items-center gap-3 rounded-full border border-line bg-card py-1.5 pr-1.5 pl-5">
              <GitHubIcon className="size-5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-[0.9rem]" title={REPO_URL}>
                {REPO_LABEL}
              </span>
              <CopyRepoButton />
            </div>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="label mt-4 inline-flex h-12 items-center gap-2 rounded-full bg-magenta px-6 text-[0.8rem] text-ink transition hover:brightness-110"
            >
              {t.settings.openOnGitHub} <span aria-hidden="true">↗</span>
              <span className="sr-only">{t.settings.newTab}</span>
            </a>

            <div className="mt-6 flex items-center gap-6 rounded-[1.75rem] border border-line bg-card p-5">
              <RepoQrCode className="size-36 shrink-0 rounded-xl border border-line" />
              <div>
                <p className="label text-ink/80">{t.settings.scanToOpen}</p>
                <p className="mt-2 leading-relaxed">{t.settings.scanHint}</p>
              </div>
            </div>
          </section>
        </div>

        <footer className="bg-ink px-7 py-5">
          <PartnerFooter />
        </footer>
      </div>
    </div>
  );
}
