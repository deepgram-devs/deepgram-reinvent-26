/**
 * The kit's icons: hand-drawn strokes in currentColor, sized by className (default size-5).
 * All are decorative (aria-hidden); the control around one names it.
 *
 * Add an icon here, not inline in a component, and add it to the Icons story.
 */
import type { SVGProps } from "react";

export type IconProps = { className?: string } & Omit<SVGProps<SVGSVGElement>, "children">;

function Icon({
  className = "size-5",
  viewBox = "0 0 24 24",
  strokeWidth = 2,
  children,
  ...rest
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox={viewBox}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function MicIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </Icon>
  );
}

export function MicOffIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15 9.3V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 4.9 2.3M5 11a7 7 0 0 0 11.5 5.3M19 11a7 7 0 0 1-.4 2.3M12 18v3M3 3l18 18" />
    </Icon>
  );
}

/** Five bars: the agent's voice. Marks assistant turns and the End button. */
export function WaveIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4" />
    </Icon>
  );
}

export function LockIcon({ className = "size-3.5", ...props }: IconProps) {
  return (
    <Icon className={className} viewBox="0 0 16 16" strokeWidth={1.6} {...props}>
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </Icon>
  );
}

export function GearIcon(props: IconProps) {
  return (
    <Icon strokeWidth={1.7} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 20 20" strokeWidth={1.8} {...props}>
      <path d="m5 5 10 10M15 5 5 15" />
    </Icon>
  );
}

export function GitHubIcon(props: IconProps) {
  return (
    <Icon strokeWidth={1.7} {...props}>
      <path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
    </Icon>
  );
}

export function CopyIcon({ className = "size-4", ...props }: IconProps) {
  return (
    <Icon className={className} viewBox="0 0 20 20" strokeWidth={1.6} {...props}>
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
    </Icon>
  );
}

export function CheckIcon({ className = "size-4", ...props }: IconProps) {
  return (
    <Icon className={className} viewBox="0 0 20 20" {...props}>
      <path d="m4.5 10.5 3.5 3.5 7.5-8" />
    </Icon>
  );
}

/** Angle brackets: a function call */
/** The dark theme (ThemePicker) */
export function MoonIcon({ className = "size-4", ...props }: IconProps) {
  return (
    <Icon className={className} strokeWidth={1.8} {...props}>
      <path d="M20 14.6A8.5 8.5 0 0 1 9.4 4a8.5 8.5 0 1 0 10.6 10.6Z" />
    </Icon>
  );
}

/** The light theme (ThemePicker) */
export function SunIcon({ className = "size-4", ...props }: IconProps) {
  return (
    <Icon className={className} strokeWidth={1.8} {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icon>
  );
}

/** The device's setting (ThemePicker's System) */
export function MonitorIcon({ className = "size-4", ...props }: IconProps) {
  return (
    <Icon className={className} strokeWidth={1.8} {...props}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </Icon>
  );
}

export function CodeIcon({ className = "size-4", ...props }: IconProps) {
  return (
    <Icon className={className} viewBox="0 0 16 16" strokeWidth={1.8} {...props}>
      <path d="M5.5 4 1.5 8l4 4M10.5 4l4 4-4 4" />
    </Icon>
  );
}

export function ChevronIcon({ up = false, className = "size-4", ...props }: IconProps & { up?: boolean }) {
  return (
    <Icon className={className} viewBox="0 0 16 16" strokeWidth={1.8} {...props}>
      <path d={up ? "m3.5 10 4.5-4.5 4.5 4.5" : "m3.5 6 4.5 4.5 4.5-4.5"} />
    </Icon>
  );
}

export function ArrowRightIcon({ className = "size-4", ...props }: IconProps) {
  return (
    <Icon className={className} viewBox="0 0 16 16" strokeWidth={1.6} {...props}>
      <path d="M2.5 8h11M9.5 4l4 4-4 4" />
    </Icon>
  );
}

// Generic subjects, for GlassTile icons and empty states. Domain icons (a car, a plane) belong in
// the app's own code; see CarIcon in the fixtures' insurance example.

/** A person: a customer, a patient, a policyholder */
export function UserIcon(props: IconProps) {
  return (
    <Icon strokeWidth={1.6} {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </Icon>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <Icon strokeWidth={1.6} {...props}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </Icon>
  );
}

export function PinIcon(props: IconProps) {
  return (
    <Icon strokeWidth={1.6} {...props}>
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </Icon>
  );
}

/** A document: a case, a policy, a report */
export function DocumentIcon(props: IconProps) {
  return (
    <Icon strokeWidth={1.6} {...props}>
      <path d="M6 3h8l4 4v14H6Z" />
      <path d="M14 3v4h4M9 12h6M9 16h6" />
    </Icon>
  );
}

/** A payment card */
export function CardIcon(props: IconProps) {
  return (
    <Icon strokeWidth={1.6} {...props}>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M2.5 10h19M6.5 15h4" />
    </Icon>
  );
}

/** A package: an order, a shipment */
export function BoxIcon(props: IconProps) {
  return (
    <Icon strokeWidth={1.6} {...props}>
      <path d="m3.5 7.5 8.5-4.5 8.5 4.5v9L12 21l-8.5-4.5Z" />
      <path d="m3.5 7.5 8.5 4.5 8.5-4.5M12 12v9" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon strokeWidth={1.8} {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.8-4.8" />
    </Icon>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Icon strokeWidth={1.6} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Icon>
  );
}

// The status and stage icons below follow Lucide's shapes (lucide.dev, ISC license), as the
// design file specifies them.

/** A status pill's "bad" tone: denied, failed (Lucide circle-x) */
export function XCircleIcon({ className = "size-4", ...props }: IconProps) {
  return (
    <Icon className={className} {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6M9 9l6 6" />
    </Icon>
  );
}

/** A status pill's "review" tone: in progress, pending (Lucide circle-dashed) */
export function CircleDashedIcon({ className = "size-4", ...props }: IconProps) {
  return (
    <Icon className={className} {...props}>
      <path d="M10.1 2.18a10 10 0 0 1 3.8 0M13.9 21.82a10 10 0 0 1-3.8 0M17.61 3.72a10 10 0 0 1 2.69 2.7M2.18 13.9a10 10 0 0 1 0-3.8M20.28 17.61a10 10 0 0 1-2.7 2.69M21.82 10.1a10 10 0 0 1 0 3.8M3.72 6.39a10 10 0 0 1 2.7-2.69M6.39 20.28a10 10 0 0 1-2.69-2.7" />
    </Icon>
  );
}

/** Broadcasting: the LIVE badge (Lucide radio) */
export function RadioIcon({ className = "size-4", ...props }: IconProps) {
  return (
    <Icon className={className} {...props}>
      <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5M19.1 4.9C23 8.8 23 15.1 19.1 19" />
      <circle cx="12" cy="12" r="2" />
    </Icon>
  );
}

/** Look but don't touch: VIEW ONLY on the stage (Lucide scan-eye) */
export function ScanEyeIcon({ className = "size-4", ...props }: IconProps) {
  return (
    <Icon className={className} {...props}>
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
      <circle cx="12" cy="12" r="1" />
      <path d="M18.94 12.33a1 1 0 0 0 0-.66 7.5 7.5 0 0 0-13.88 0 1 1 0 0 0 0 .66 7.5 7.5 0 0 0 13.88 0" />
    </Icon>
  );
}
