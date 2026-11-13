"use client";

import { create } from "qrcode";
import { useEffect, useMemo, useRef, useState } from "react";

import { PartnerFooter } from "@/components/chrome/PartnerFooter";

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
      aria-label={`QR code for ${REPO_LABEL}`}
      shapeRendering="crispEdges"
    >
      <rect x="-2" y="-2" width={size + 4} height={size + 4} fill="#ffffff" />
      <path d={path} fill="var(--color-ink)" />
    </svg>
  );
}

function CopyRepoButton() {
  const [copied, setCopied] = useState(false);
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
      aria-label={copied ? "Copied the repo address" : "Copy the repo address"}
      className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-card text-ink transition hover:bg-paper"
    >
      {copied ? <CheckIcon className="size-4 text-violet" /> : <CopyIcon />}
    </button>
  );
}

/**
 * About this app: a drawer on the right. It opens below a top bar when the
 * screen has one (marked data-top-bar), so the bar's "Paused" note stays in
 * view.
 */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
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
        onClose();
        return;
      }
      // Keep Tab inside the drawer while it's open
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = panel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
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
        className="absolute inset-y-0 right-0 flex w-full max-w-[30rem] animate-slide flex-col bg-paper text-ink shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-7 pt-7 pb-6">
          <div>
            <p className="label text-ink/80">Settings</p>
            <h2 id="settings-title" className="mt-2 text-[2rem] leading-tight font-semibold tracking-tight">
              About this app
            </h2>
          </div>
          <button
            ref={close}
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="grid size-11 shrink-0 place-items-center rounded-full border border-line text-ink transition hover:bg-card"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="flex-1 space-y-8 overflow-y-auto px-7 py-7">
          <section>
            <h3 className="label text-ink/80">What it does</h3>
            <p className="mt-3 text-[1.1rem] leading-relaxed">
              Tri-County Claims is a voice assistant for auto insurance claims. Policyholders ask for their claim
              by number and last name, and it reads back what they need. Tri-County staff ask a question, and it
              searches every claim for the answer.
            </p>
            <p className="mt-4 text-[1.1rem] leading-relaxed">
              It&rsquo;s view only. You can find and hear claim details, but not change them.
            </p>
            <p className="mt-4 leading-relaxed text-muted">
              Built with Deepgram speech-to-text and text-to-speech, Pipecat, Amazon Bedrock, and AWS Strands.
            </p>
          </section>

          <section>
            <h3 className="label text-ink/80">Source code</h3>
            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-line bg-card py-1.5 pr-1.5 pl-4">
              <GitHubIcon className="size-5 shrink-0" />
              <span className="min-w-0 flex-1 truncate font-mono text-[0.9rem]" title={REPO_URL}>
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
              Open on GitHub <span aria-hidden="true">↗</span>
              <span className="sr-only">(opens in a new tab)</span>
            </a>

            <div className="mt-6 flex items-center gap-6 rounded-2xl border border-line bg-card p-5">
              <RepoQrCode className="size-36 shrink-0 rounded-xl border border-line" />
              <div>
                <p className="label text-ink/80">Scan to open</p>
                <p className="mt-2 leading-relaxed">Point your phone&rsquo;s camera here to open the repo.</p>
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
