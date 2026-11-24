"use client";

import { CtaButton, HeroLanding, Notice, SegmentedControl } from "@deepgram-devs/dg-brand-ui";

import { PartnerFooter } from "@/components/chrome/PartnerFooter";
import { SettingsButton } from "@/components/chrome/SettingsButton";
import { WrecklessWordmark } from "@/components/chrome/WrecklessMark";
import { useT } from "@/i18n";
import { PERSONAS, type Persona } from "@/lib/persona";

/** The idle screen: no call yet, so no claim. The UI kit's HeroLanding, over the coastal photo. */
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
    <HeroLanding
      image={{ src: "/hero.jpg", alt: t.landing.heroAlt, position: "70% center" }}
      brand={<WrecklessWordmark variant="pill" />}
      actions={<SettingsButton />}
      toggle={
        // Who's calling. The bot gets it with the call, so it's fixed once connecting.
        <SegmentedControl
          label={t.landing.callingAs}
          value={persona}
          onChange={onPersonaChange}
          disabled={connecting}
          options={PERSONAS.map((option) => ({ value: option, label: t.persona[option].label }))}
        />
      }
      kicker={copy.kicker}
      title={copy.title}
      intro={copy.intro}
      notice={error ? <Notice tone="error">{error}</Notice> : notice ? <Notice tone="info">{notice}</Notice> : undefined}
      cta={
        <CtaButton size="sm" busy={connecting} onClick={onStart}>
          {connecting ? t.landing.connecting : t.landing.start}
        </CtaButton>
      }
      note={t.landing.micNote}
      footer={<PartnerFooter />}
    />
  );
}
