/**
 * @deepgram-devs/dg-brand-ui
 *
 * Deepgram's brand UI kit for voice agent apps, for any domain. Every export is listed in catalog.json with when to
 * use it; the Storybook shows each one. Pipecat adapters are in "./pipecat", sample data in
 * "./fixtures", tokens in "./theme.css" and "./tokens.json".
 */

// Strings and helpers
export { DEFAULT_STRINGS, KitStringsProvider, useKitStrings, type KitStrings } from "./strings";
export { cx, initials } from "./lib/cx";

// Icons
export * from "./icons";

// Primitives
export { CtaButton, CtaLink, IconButton, PillButton, Spinner } from "./primitives/Button";
export type { CtaButtonProps, CtaLinkProps, IconButtonProps, PillButtonProps } from "./primitives/Button";
export { Chip, DEFAULT_TONE_RULES, LiveBadge, LockPill, StatusPill, toneFor, type ChipProps, type Tone } from "./primitives/Pill";
export { SegmentedControl, type SegmentOption, type SegmentedControlProps } from "./primitives/SegmentedControl";
export { ImageSelect, Select, type ImageOption, type ImageSelectProps } from "./primitives/Select";
export { Avatar, Caret, CopyField, Notice, ProgressBar, QrCode } from "./primitives/misc";

// The agent points at the screen
export { FocusProvider, FocusTarget, useFocus, type FocusTargetProps, type Highlight } from "./focus/Focus";

// Records (paper) and results (stage)
export {
  CardColumns,
  DataCard,
  Field,
  GlassTile,
  HighlightBand,
  LineItems,
  NoteList,
  PageHeader,
  PlaceholderGrid,
  ProgressStepper,
} from "./data/records";
export type { DataCardProps, LineItem, NoteItem, PageHeaderProps, Stat, Step, StepState } from "./data/records";
export { FoundCard, ResultCard, type FoundCardProps, type ResultCardProps, type StatusSpec } from "./data/results";
export { SketchMap } from "./data/SketchMap";
export { DataGrid, type DataGridColumn, type DataGridProps, type GridSort, type SortValue } from "./data/DataGrid";

// Any record, as data: describe it once and RecordBody draws the record screen
export { RecordBody, RecordSectionCard, foundCardFor, stepProgress } from "./data/RecordView";
export type { RecordField, RecordSection, RecordTile, RecordView } from "./data/RecordView";

// Voice
export type { Caption, FunctionCall, Turn, TurnChip, TurnState } from "./voice/types";
export { FunctionCallRow, ThinkingDots, TurnBubble, callSummary, clockTime, type TurnBubbleProps } from "./voice/Transcript";
export { SessionSurfaceProvider, useSessionSurface, type SessionSurface } from "./voice/surface";
export {
  CallControls,
  DOCK_CLEARANCE,
  DockCaption,
  PromptRail,
  SessionDock,
  VoiceSessionPanel,
} from "./voice/SessionPanel";
export type { CallControlsProps, PromptRailProps, SessionDockProps, VoiceSessionPanelProps } from "./voice/SessionPanel";
export { CallStatus, CaptionBar, LiveCaption, VoiceRing, useSimulatedLevel } from "./voice/Stage";
export type { CaptionBarProps, LiveCaptionProps, VoiceRingProps } from "./voice/Stage";

// Chrome
export { Drawer, PARTNERS, PartnerLogos, Section, SettingsButton, TopBar, Wordmark } from "./chrome/chrome";
export type { DrawerProps, Partner, PartnerLogosProps, TopBarProps, WordmarkProps } from "./chrome/chrome";

// Screens
export { AsideNote, HeroLanding, RecordLayout, StageCenter, StageLayout } from "./layouts/layouts";
export type { HeroLandingProps, RecordLayoutProps, StageLayoutProps } from "./layouts/layouts";

// Theme: dark, light, or the device's. The paper surface flips; ink, stage, and violet don't
export { DARK_QUERY, THEME_PREFERENCES, THEME_STORAGE_KEY, themeScript, type ResolvedTheme, type ThemePreference } from "./theme/script";
export { ThemeProvider, useTheme, type ThemeProviderProps, type ThemeValue } from "./theme/ThemeProvider";
export { ThemePicker, type ThemePickerProps } from "./theme/ThemePicker";

// Hooks
export { useMediaQuery, WIDE } from "./hooks/useMediaQuery";
export { useCopied } from "./hooks/useCopied";
export { useStickToBottom } from "./hooks/useStickToBottom";
