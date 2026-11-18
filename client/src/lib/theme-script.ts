// Shared by the root layout (a server component) and the theme provider, so
// both read the same key and resolve "system" the same way.

export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

export const THEME_KEY = "wreckless.theme";
export const THEME_PREFERENCES: ThemePreference[] = ["dark", "light", "system"];
export const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Runs in <head> while the page parses, before the first paint, so a saved
 * dark theme never flashes light. It sets data-theme on <html> to "dark" or
 * "light"; globals.css flips the paper tokens on it. Storage can throw
 * (blocked, private windows), and then the device's setting decides.
 */
export const THEME_SCRIPT = `(function(){var p;try{p=localStorage.getItem(${JSON.stringify(THEME_KEY)})}catch(e){}if(p!=="dark"&&p!=="light")p=matchMedia(${JSON.stringify(DARK_QUERY)}).matches?"dark":"light";document.documentElement.setAttribute("data-theme",p)})()`;
