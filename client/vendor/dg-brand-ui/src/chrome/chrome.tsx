"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

import { CloseIcon, GearIcon } from "../icons";
import { cx } from "../lib/cx";
import { IconButton, PillButton } from "../primitives/Button";
import { useKitStrings } from "../strings";

const WORDMARK_VARIANT = {
  /** Over a photo: frosted pill */
  pill: "rounded-full border border-white/20 bg-black/35 py-2 pr-5 pl-3 backdrop-blur-md text-white",
  /** On the stage */
  plain: "text-white",
  /** On the ink top bar, with the tagline under the name */
  stacked: "text-white",
};

export type WordmarkProps = {
  /** The app brand's mark, sized by the wordmark: an SVG in currentColor plus two accent colors */
  mark: ReactNode;
  /** The fictional company: Brightwave, Northwind Bank, Wreckless */
  name: string;
  /** Letter-spaced under the name (stacked) or after it (plain): "Internet · Support", "Support desk" */
  tagline?: string;
  variant?: keyof typeof WORDMARK_VARIANT;
  className?: string;
};

/**
 * The app brand's mark and name. Every screen has one, top left. The mark is the app's, never
 * Deepgram's: Deepgram appears in PartnerLogos and "Voice AI by Deepgram".
 */
export function Wordmark({ mark, name, tagline, variant = "plain", className }: WordmarkProps) {
  return (
    <span className={cx("flex items-center gap-2.5", WORDMARK_VARIANT[variant], className)}>
      <span className={cx("shrink-0", variant === "pill" ? "size-7" : variant === "plain" ? "size-7 sm:size-9" : "size-8", "[&>svg]:size-full")}>{mark}</span>
      {variant === "stacked" ? (
        <span className="leading-none">
          <span className="block text-[1.15rem] font-semibold tracking-tight">{name}</span>
          {tagline && <span className="label mt-1 block text-[0.6rem] opacity-70">{tagline}</span>}
        </span>
      ) : (
        <>
          <span className={cx("font-semibold tracking-tight", variant === "pill" ? "text-lg" : "text-xl leading-none whitespace-nowrap sm:text-[2rem]")}>{name}</span>
          {tagline && <span className="label ml-2 hidden self-start pt-1 text-[0.8125rem] text-white/70 sm:inline">{tagline}</span>}
        </>
      )}
    </span>
  );
}

export type Partner = { name: string; file: string; width: number; height: number; className: string };

/** The partner logos the kit ships, in assets/logos. All are white, for dark backgrounds. */
export const PARTNERS = {
  deepgram: { name: "Deepgram", file: "deepgram.svg", width: 125, height: 24, className: "h-5 w-auto sm:h-7" },
  aws: { name: "AWS", file: "aws.png", width: 320, height: 191, className: "h-7 w-auto sm:h-10" },
  /** The mark alone, as the stage design sets it. pipecat.svg (mark and name) is still in assets/logos. */
  pipecat: { name: "Pipecat", file: "pipecat-mark.svg", width: 361, height: 214, className: "h-6 w-auto sm:h-9" },
} satisfies Record<string, Partner>;

export type PartnerLogosProps = {
  /** Which logos, in order. Deepgram always comes first. */
  partners?: Array<keyof typeof PARTNERS | Partner>;
  /**
   * Where the app serves the kit's assets/logos folder. `npx vdui-assets public/vdui` copies them
   * to public/vdui/logos, the default.
   */
  basePath?: string;
  className?: string;
};

/** Deepgram | partner | partner, white, centered, with hairlines between: the bottom of the landing. */
export function PartnerLogos({ partners = ["deepgram", "aws", "pipecat"], basePath = "/vdui/logos", className }: PartnerLogosProps) {
  const s = useKitStrings();
  const list = partners.map((p) => (typeof p === "string" ? PARTNERS[p] : p));
  return (
    <div
      className={cx("flex items-center justify-center gap-5 sm:gap-10", className)}
      role="group"
      aria-label={`${s.builtWith} ${list.map((p) => p.name).join(", ")}`}
    >
      {list.map((partner, i) => (
        <span key={partner.name} className="contents">
          {i > 0 && <span className="h-10 w-px shrink-0 bg-white/25 sm:h-15" aria-hidden="true" />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${basePath}/${partner.file}`} alt={partner.name} width={partner.width} height={partner.height} className={partner.className} />
        </span>
      ))}
    </div>
  );
}

/** The gear that opens Settings. "glass" on dark screens, "solid" on the ink top bar. */
export function SettingsButton({ tone = "glass", open, onClick }: { tone?: "glass" | "solid"; open?: boolean; onClick: () => void }) {
  const s = useKitStrings();
  return (
    <IconButton tone={tone} label={s.settings} aria-haspopup="dialog" aria-expanded={open} onClick={onClick}>
      <GearIcon />
    </IconButton>
  );
}

export type TopBarProps = {
  /** A stacked Wordmark */
  brand: ReactNode;
  /** Shows a Back pill after the brand, as when staff opened a record from search results */
  onBack?: () => void;
  backLabel?: string;
  /** The middle: a CaptionBar */
  center?: ReactNode;
  /** The right: "Voice AI by Deepgram", SettingsButton tone="solid", an Avatar tone="violet" */
  actions?: ReactNode;
};

/**
 * The ink bar across the top of the record screen, sticky. Marked data-top-bar so a Drawer opens
 * below it and its status stays in view.
 */
export function TopBar({ brand, onBack, backLabel, center, actions }: TopBarProps) {
  const s = useKitStrings();
  return (
    <header data-top-bar className="sticky top-0 z-50 bg-ink text-white">
      <div className="mx-auto flex h-[4.5rem] max-w-[100rem] items-center gap-6 px-5 sm:px-8">
        {brand}
        {onBack && (
          <PillButton onClick={onBack}>
            <span aria-hidden="true">←</span> {backLabel ?? s.results}
          </PillButton>
        )}
        {center ?? <span className="flex-1" />}
        <div className="ml-auto flex items-center gap-4 md:ml-0">{actions}</div>
      </div>
    </header>
  );
}

export type DrawerProps = {
  onClose: () => void;
  /** Letter-spaced over the title: SETTINGS */
  kicker?: string;
  title: string;
  children: ReactNode;
  /** An ink strip at the bottom, usually PartnerLogos */
  footer?: ReactNode;
  className?: string;
};

/**
 * A modal panel from the right, on paper: Settings / About this app. Render it while open. It
 * moves focus in and back, keeps Tab inside, closes on Escape and on the backdrop, stops the page
 * scrolling, and opens below a data-top-bar header if the screen has one.
 */
export function Drawer({ onClose, kicker, title, children, footer, className }: DrawerProps) {
  const s = useKitStrings();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const [top] = useState(() =>
    typeof document === "undefined" ? 0 : Math.max(0, document.querySelector("[data-top-bar]")?.getBoundingClientRect().bottom ?? 0),
  );

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // A list inside the drawer handles Escape first, and marks it
        if (!event.defaultPrevented) onClose();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled])",
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
      <div className="absolute inset-0 animate-fade bg-ink/55" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          "absolute inset-y-0 right-0 flex w-full max-w-[30rem] animate-slide flex-col bg-paper text-fg shadow-2xl dark:border-l dark:border-line lg:max-w-xl 2xl:max-w-2xl",
          className,
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-7 pt-7 pb-6">
          <div>
            {kicker && <p className="label text-fg/80">{kicker}</p>}
            <h2 className="mt-2 text-[2rem] leading-tight font-semibold tracking-tight">{title}</h2>
          </div>
          <IconButton ref={close} tone="line" label={s.close} onClick={onClose} className="border-line bg-transparent">
            <CloseIcon />
          </IconButton>
        </header>
        <div className="flex-1 space-y-8 overflow-y-auto px-7 py-7">{children}</div>
        {footer && <footer className="bg-ink px-7 py-5">{footer}</footer>}
      </div>
    </div>
  );
}

/** A letter-spaced section inside a Drawer or a page: VOICE, WHAT IT DOES, SOURCE CODE. */
export function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <h3 className="label text-fg/80">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}
