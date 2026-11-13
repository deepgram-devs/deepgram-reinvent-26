"use client";

import Image from "next/image";

import { MicIcon, ViewOnlyPill } from "@/components/chrome/Pills";
import { PartnerFooter } from "@/components/chrome/PartnerFooter";
import { SettingsButton } from "@/components/chrome/SettingsButton";
import { TriCountyMark } from "@/components/chrome/TriCountyMark";
import { useT } from "@/i18n";
import { PERSONAS, type Persona } from "@/lib/persona";

/** Who's calling. The bot gets it with the call, so it's fixed once connecting. */
function PersonaToggle({
  persona,
  onChange,
  disabled,
}: {
  persona: Persona;
  onChange: (persona: Persona) => void;
  disabled: boolean;
}) {
  const t = useT();
  return (
    <div role="radiogroup" aria-label={t.landing.callingAs} className="flex w-fit rounded-full border border-white/20 bg-black/35 p-1 backdrop-blur-md">
      {PERSONAS.map((option) => {
        const on = option === persona;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(option)}
            className={`label rounded-full px-4 py-2 text-[0.7rem] transition disabled:cursor-not-allowed ${
              on ? "bg-white text-ink" : "text-white/80 hover:text-white"
            }`}
          >
            {t.persona[option].label}
          </button>
        );
      })}
    </div>
  );
}

export function StartButton({
  onStart,
  connecting,
}: {
  onStart: () => void;
  connecting: boolean;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onStart}
      disabled={connecting}
      className="label flex h-16 w-full items-center justify-center gap-3 rounded-full border-2 border-white/25 bg-magenta text-[0.95rem] text-ink shadow-[0_0_40px_-6px] shadow-magenta/70 transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-magenta disabled:cursor-wait disabled:opacity-80"
    >
      {connecting ? (
        <span className="size-4 animate-spin rounded-full border-2 border-ink/30 border-t-ink" />
      ) : (
        <MicIcon />
      )}
      {connecting ? t.landing.connecting : t.landing.start}
    </button>
  );
}

/** The idle screen: no call yet, so no claim. */
export function Landing({
  onStart,
  connecting,
  error,
  notice,
  persona,
  onPersonaChange,
}: {
  onStart: () => void;
  connecting: boolean;
  error: string | null;
  /** Why the last call ended, when the agent ended it. Not an error. */
  notice: string | null;
  persona: Persona;
  onPersonaChange: (persona: Persona) => void;
}) {
  const t = useT();
  const copy = t.persona[persona];
  return (
    <main className="relative flex min-h-dvh flex-col bg-ink text-white">
      {/* Hero: on top on phones, the whole background on wide screens */}
      <div className="relative h-[46dvh] min-h-72 w-full lg:absolute lg:inset-0 lg:h-full">
        <Image
          src="/hero.jpg"
          alt={t.landing.heroAlt}
          fill
          priority
          sizes="100vw"
          className="object-cover object-[70%_center] lg:object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-ink/10 to-ink lg:bg-gradient-to-r lg:from-ink lg:via-ink/70 lg:to-transparent" />
      </div>

      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-5 sm:p-8">
        <span className="flex items-center gap-2.5 rounded-full border border-white/20 bg-black/35 py-2 pr-5 pl-3 backdrop-blur-md">
          <TriCountyMark className="size-7" />
          <span className="text-lg font-semibold tracking-tight">Tri-County</span>
        </span>
        <div className="flex items-center gap-3">
          <ViewOnlyPill tone="glass" />
          <SettingsButton />
        </div>
      </header>

      <div className="relative z-10 -mt-6 flex flex-1 flex-col px-5 pb-6 sm:px-8 lg:mt-0 lg:max-w-xl lg:justify-center lg:px-16 lg:pt-28">
        <PersonaToggle persona={persona} onChange={onPersonaChange} disabled={connecting} />
        <p className="label mt-6 text-white/80">{copy.kicker}</p>
        <h1 className="mt-4 text-[2.6rem] leading-[1.05] font-semibold tracking-tight sm:text-5xl lg:text-6xl">
          {copy.title}
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-white/85">{copy.intro}</p>

        <p className="label mt-8 text-white/80">{t.landing.trySaying}</p>
        <ul className="mt-3 space-y-3">
          {copy.trySaying.map((line) => (
            <li
              key={line}
              className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3.5 text-lg backdrop-blur-sm"
            >
              {line}
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-10 lg:mt-10">
          {error && (
            <p role="alert" className="mb-4 rounded-2xl border border-red/40 bg-red/15 px-4 py-3 text-sm">
              {error}
            </p>
          )}
          {notice && !error && (
            <p role="status" className="mb-4 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm">
              {notice}
            </p>
          )}
          <StartButton onStart={onStart} connecting={connecting} />
          <p className="mt-3 text-center text-white/70">
            {t.landing.micNote}
          </p>
          <div className="mt-6 border-t border-white/15 pt-6 lg:hidden">
            <PartnerFooter />
          </div>
        </div>
      </div>

      <div className="relative z-10 hidden px-16 pb-10 lg:block">
        <PartnerFooter />
      </div>
    </main>
  );
}
