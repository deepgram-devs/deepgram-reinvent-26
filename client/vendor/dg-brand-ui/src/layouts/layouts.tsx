"use client";

import { type ReactNode, useState } from "react";

import { LockIcon } from "../icons";
import { cx } from "../lib/cx";
import { useKitStrings } from "../strings";
import { SessionSurfaceProvider } from "../voice/surface";

/**
 * The three screens every voice agent app is made of:
 *
 *   HeroLanding  — before the call: a photo or the landing texture, what the app does, and Start.
 *   StageLayout  — during the call, before there's a record: the textured violet stage with the
 *                  ring and caption, and the frosted session panel beside it (or the dock on phones).
 *   RecordLayout — a record is open: the light paper page with the session panel kept beside
 *                  it (or the dock and a transcript sheet on phones).
 *
 * They lay things out and nothing more: pass the kit's components into their slots.
 */

export type HeroLandingProps = {
  /**
   * The hero photo: full-bleed on desktop, the top 46% on phones. A scene from the app's world
   * where you can hear the voice (the brand's photography rule). Leave it out and the landing
   * shows the kit's landing texture (assets/textures/landing.webp) instead.
   */
  image?: { src: string; alt: string; /** object-position on phones, where the photo is cropped */ position?: string };
  /** Top left: a Wordmark, variant="pill" over a photo or "plain" on the texture */
  brand: ReactNode;
  /** Top right: SettingsButton */
  actions?: ReactNode;
  /** Above the kicker: a SegmentedControl to pick who's calling */
  toggle?: ReactNode;
  /** Letter-spaced, above the title: "Let’s sort out your order" */
  kicker: string;
  /** Six words or fewer, ending in a period: "Track your order by voice." */
  title: string;
  /** One or two sentences: what to say, and what happens */
  intro: string;
  /** A Notice tone="error" or "info", over the button */
  notice?: ReactNode;
  /** The CtaButton size="sm" */
  cta: ReactNode;
  /** Under the button, muted: "Talk naturally. We’ll ask for microphone access." */
  note?: string;
  /** PartnerLogos */
  footer?: ReactNode;
};

/** The landing screen: before the call starts. */
export function HeroLanding({ image, brand, actions, toggle, kicker, title, intro, notice, cta, note, footer }: HeroLandingProps) {
  return (
    <main className={cx("relative flex min-h-dvh flex-col text-white", image ? "bg-ink" : "landing-texture")}>
      {image ? (
        <div className="relative h-[46dvh] min-h-72 w-full lg:absolute lg:inset-0 lg:h-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.src}
            alt={image.alt}
            fetchPriority="high"
            className="absolute inset-0 size-full object-cover lg:object-center"
            style={{ objectPosition: image.position }}
          />
          <div className="photo-scrim absolute inset-0" />
        </div>
      ) : (
        // No photo: the landing texture, with room for the header on phones
        <div className="h-32 lg:hidden" aria-hidden="true" />
      )}

      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-5 sm:p-8">
        {brand}
        {actions}
      </header>

      <div className="relative z-10 -mt-6 flex w-full flex-1 flex-col items-center px-5 pb-6 text-center sm:px-8 lg:mx-auto lg:mt-0 lg:max-w-xl lg:justify-center lg:px-0 lg:pt-28">
        {toggle}
        <p className={cx("label text-[0.8125rem] text-white", toggle ? "mt-10" : "")}>{kicker}</p>
        <h1 className="mt-3 text-[2.6rem] leading-none font-semibold tracking-[-0.02em] text-balance sm:text-5xl lg:text-[4.5rem]">{title}</h1>
        <p className="mt-6 text-lg leading-[1.3] tracking-[-0.02em] text-white/95 text-balance lg:text-[1.625rem]">{intro}</p>

        <div className="mt-auto flex w-full flex-col items-center pt-10 lg:mt-14">
          {notice && <div className="mb-4 w-full">{notice}</div>}
          {cta}
          {note && <p className="mt-4 text-center text-sm text-white">{note}</p>}
          {footer && <div className="mt-6 border-t border-white/15 pt-6 lg:hidden">{footer}</div>}
        </div>
      </div>

      {footer && <div className="relative z-10 hidden px-16 pb-10 lg:block">{footer}</div>}
    </main>
  );
}

export type StageLayoutProps = {
  /** Top left: a Wordmark variant="plain" */
  brand: ReactNode;
  /** Top right: LockPill tone="dark", SettingsButton */
  actions?: ReactNode;
  /** The stage: VoiceRing, CallStatus, LiveCaption, then a FoundCard or ResultCards */
  children: ReactNode;
  /** The VoiceSessionPanel, frosted, floating beside the stage from lg up */
  panel?: ReactNode;
  /** The SessionDock, at the bottom below lg */
  dock?: ReactNode;
  /** Optional: PartnerLogos under a hairline at the bottom of the stage. The stage design leaves them to the landing. */
  footer?: ReactNode;
};

/**
 * The stage: during the call, before a record opens, and for search results. The violet texture
 * runs edge to edge, and the panel and dock on it are frosted glass.
 */
export function StageLayout({ brand, actions, children, panel, dock, footer }: StageLayoutProps) {
  return (
    <main className="stage-glow flex min-h-dvh text-white">
      <div className={cx("relative flex min-h-dvh min-w-0 flex-1 flex-col px-5 pt-5 sm:px-8 sm:pt-8 lg:pl-12", dock ? "pb-56 lg:pb-8" : "pb-8")}>
        <header className="flex items-center justify-between gap-3">
          {brand}
          {actions && <div className="flex items-center gap-3">{actions}</div>}
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
        {footer && <div className="mx-auto mt-6 w-full max-w-2xl border-t border-white/15 pt-6">{footer}</div>}
      </div>
      <SessionSurfaceProvider surface="glass">
        {panel && (
          <aside className="hidden w-[26rem] shrink-0 py-8 pr-8 lg:block">
            <div className="sticky top-8 h-[calc(100dvh-4rem)] min-h-[34rem]">{panel}</div>
          </aside>
        )}
        {dock && <div className="lg:hidden">{dock}</div>}
      </SessionSurfaceProvider>
    </main>
  );
}

/** A centered column on the stage for the ring, the status line, and the caption. */
export function StageCenter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("mx-auto flex w-full max-w-2xl flex-1 flex-col items-center pt-8 text-center", className)}>{children}</div>;
}

export type RecordLayoutProps = {
  /** The TopBar */
  topBar: ReactNode;
  /** The record: PageHeader, ProgressStepper, HighlightBand, CardColumns of DataCards */
  children: ReactNode;
  /** The VoiceSessionPanel. Beside the record from lg up; in a full-screen sheet below that. */
  panel: ReactNode;
  /** Muted, with a lock, under the panel: what the caller can and can't do here */
  panelNote?: string;
  /** PartnerLogos, on an ink strip at the bottom */
  footer?: ReactNode;
  /**
   * The SessionDock for phones and tablets. Gets `openSheet`, for a DockCaption that opens the
   * transcript in a sheet.
   */
  dock?: (openSheet: () => void) => ReactNode;
};

/** The paper record page, with the voice session kept beside it. */
export function RecordLayout({ topBar, children, panel, panelNote, footer, dock }: RecordLayoutProps) {
  const [sheet, setSheet] = useState(false);
  const s = useKitStrings();
  return (
    <div className="min-h-dvh bg-paper text-fg">
      {topBar}

      <div className="mx-auto grid max-w-[100rem] gap-8 px-5 pt-8 pb-16 sm:px-8 lg:grid-cols-[minmax(0,1fr)_24rem] xl:px-12">
        <main className="min-w-0 space-y-7">{children}</main>
        <aside className="hidden space-y-5 lg:block">
          <div className="sticky top-24 flex h-[calc(100dvh-7.5rem)] min-h-[40rem] flex-col gap-5">
            <div className="min-h-[34rem] flex-1">
              <SessionSurfaceProvider surface="violet">{panel}</SessionSurfaceProvider>
            </div>
            {panelNote && <AsideNote>{panelNote}</AsideNote>}
          </div>
        </aside>
      </div>

      {footer && <footer className={cx("bg-ink pt-10", dock ? "pb-66 lg:pb-10" : "pb-10")}>{footer}</footer>}

      <SessionSurfaceProvider surface="violet">
        {dock && <div className="lg:hidden">{dock(() => setSheet(true))}</div>}
        {sheet && (
          <div className="fixed inset-0 z-[60] flex flex-col bg-ink/60 p-3 pt-16 backdrop-blur-sm lg:hidden" role="dialog" aria-modal="true" aria-label={s.conversation}>
            <button type="button" onClick={() => setSheet(false)} className="label absolute top-4 right-4 rounded-full bg-white px-4 py-2 text-ink">
              {s.close}
            </button>
            {panel}
          </div>
        )}
      </SessionSurfaceProvider>
    </div>
  );
}

/** A muted note with a lock, on paper: under the session panel. */
export function AsideNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-3 px-1 text-muted">
      <LockIcon className="mt-1 size-4 shrink-0" />
      {children}
    </p>
  );
}
