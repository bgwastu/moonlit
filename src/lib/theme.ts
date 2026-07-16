import { type MantineThemeOverride, createTheme } from "@mantine/core";

/** Shared dark theme — used by app shell and standalone error boundaries. */
export const appTheme: MantineThemeOverride = createTheme({
  primaryColor: "violet",
  primaryShade: 5,
  white: "#f3f0ff",
  cursorType: "pointer",
  focusClassName: "",
});

export const APP_BG = "#1A1B1E";

/** CSS variable for search accent focus ring (set on the search shell). */
export const SEARCH_ACCENT_VAR = "--moonlit-accent";
