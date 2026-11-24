/**
 * The theme, before React. No "use client": a server layout imports themeScript() and gets the
 * string itself, not a client reference.
 */

/** What the viewer picked. "system" follows the device. */
export type ThemePreference = "dark" | "light" | "system";
/** What the page shows */
export type ResolvedTheme = "dark" | "light";

/** The pick's localStorage key, unless ThemeProvider and themeScript() are given another */
export const THEME_STORAGE_KEY = "vdui.theme";
/** The order ThemePicker shows them in */
export const THEME_PREFERENCES: ThemePreference[] = ["dark", "light", "system"];
export const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * A script for <head> that sets data-theme on <html> while the page parses, before the first
 * paint, so a saved dark theme never flashes light. Pass ThemeProvider's storageKey and
 * defaultPreference, if you set them. Storage can throw (blocked, private windows), and then the
 * default decides.
 *
 *   <html lang="en" data-theme="light" suppressHydrationWarning>
 *     <head><script dangerouslySetInnerHTML={{ __html: themeScript() }} /></head>
 */
export function themeScript(storageKey = THEME_STORAGE_KEY, defaultPreference: ThemePreference = "system"): string {
  return `(function(){var p;try{p=localStorage.getItem(${JSON.stringify(storageKey)})}catch(e){}if(p!=="dark"&&p!=="light"&&p!=="system")p=${JSON.stringify(defaultPreference)};if(p==="system")p=matchMedia(${JSON.stringify(DARK_QUERY)}).matches?"dark":"light";document.documentElement.setAttribute("data-theme",p)})()`;
}
