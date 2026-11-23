/**
 * Example brand marks for the fixture examples. Every mark follows one recipe: a 32×32 viewBox, a 3px
 * currentColor outline (white on dark, ink on paper), and two 3px accents, one magenta (#e042ff)
 * and one ring-blue (#00b2ff). Size them with className; Wordmark sizes them for you.
 */

type MarkProps = { className?: string };

/** Brightwave (internet support): a signal wave in a rounded square */
export function BrightwaveMark({ className = "size-8" }: MarkProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="4" y="4" width="24" height="24" rx="8" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M9.5 18c2-4 4.5-4 6.5 0" fill="none" stroke="#e042ff" strokeWidth="3" strokeLinecap="round" />
      <path d="M16 18c2 4 4.5 4 6.5 0" fill="none" stroke="#00b2ff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Wreckless (auto insurance): a shield with a road running into it */
export function WrecklessMark({ className = "size-8" }: MarkProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M16 3 27 7v8c0 7-5 12-11 14C10 27 5 22 5 15V7Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <path d="M11 22 13.5 12" fill="none" stroke="#e042ff" strokeWidth="3" strokeLinecap="round" />
      <path d="M21 22 18.5 12" fill="none" stroke="#00b2ff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Northwind Bank: a vault door */
export function NorthwindMark({ className = "size-8" }: MarkProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M16 9v7" fill="none" stroke="#e042ff" strokeWidth="3" strokeLinecap="round" />
      <path d="M16 16l5 4" fill="none" stroke="#00b2ff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Cedar Health (clinic scheduling): a leaf with a cross */
export function CedarMark({ className = "size-8" }: MarkProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M16 4c7 4 10 9 10 14a10 10 0 0 1-20 0c0-5 3-10 10-14Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <path d="M16 13v10" fill="none" stroke="#e042ff" strokeWidth="3" strokeLinecap="round" />
      <path d="M11 18h10" fill="none" stroke="#00b2ff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Kettle & Crate (grocery delivery): a crate with two slats */
export function KettleCrateMark({ className = "size-8" }: MarkProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M5 11h22l-2.5 15h-17Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <path d="M12 6l-3 5" fill="none" stroke="#e042ff" strokeWidth="3" strokeLinecap="round" />
      <path d="M20 6l3 5" fill="none" stroke="#00b2ff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** A neutral placeholder for a brand that doesn't have a mark yet */
export function PlaceholderMark({ className = "size-8" }: MarkProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="4 4" />
      <circle cx="12" cy="16" r="2" fill="#e042ff" />
      <circle cx="20" cy="16" r="2" fill="#00b2ff" />
    </svg>
  );
}

/** A sedan from the side: the insurance example's GlassTile icon. Domain icons live with the domain. */
export function CarIcon({ className = "h-5 w-10" }: MarkProps) {
  return (
    <svg viewBox="0 0 40 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 14V11l4-1 5-5h13l6 5 5 1v3h-3M9 14H6M28 14H14" />
      <circle cx="11.5" cy="14.5" r="2.5" />
      <circle cx="30.5" cy="14.5" r="2.5" />
    </svg>
  );
}
