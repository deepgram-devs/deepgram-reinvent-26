"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "../icons";
import { SegmentedControl } from "../primitives/SegmentedControl";
import { useKitStrings } from "../strings";
import { THEME_PREFERENCES, type ThemePreference } from "./script";
import { useTheme } from "./ThemeProvider";

const ICON = { dark: MoonIcon, light: SunIcon, system: MonitorIcon };

export type ThemePickerProps = {
  /** Show the line under the picker: what the pick changes, or which theme the device is using */
  note?: boolean;
  className?: string;
};

/**
 * Dark / Light / System, for a Settings Drawer. Put it in a Section titled with
 * strings.appearance. It reads and sets the theme through ThemeProvider.
 */
export function ThemePicker({ note = true, className }: ThemePickerProps) {
  const s = useKitStrings();
  const { preference, resolved, setPreference } = useTheme();
  const names: Record<ThemePreference, string> = { dark: s.themeDark, light: s.themeLight, system: s.themeSystem };
  return (
    <div className={className}>
      <SegmentedControl
        tone="paper"
        label={s.appearance}
        value={preference}
        onChange={setPreference}
        options={THEME_PREFERENCES.map((option) => {
          const Icon = ICON[option];
          return {
            value: option,
            label: (
              <span className="inline-flex items-center gap-2">
                <Icon />
                {names[option]}
              </span>
            ),
          };
        })}
      />
      {note && (
        <p className="mt-3 leading-relaxed text-muted">
          {preference === "system" ? (resolved === "dark" ? s.themeNoteSystemDark : s.themeNoteSystemLight) : s.themeNote}
        </p>
      )}
    </div>
  );
}
