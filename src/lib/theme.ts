import type { MantineThemeOverride } from "@mantine/core";

/** Shared dark theme — used by app shell and standalone error boundaries. */
export const appTheme: MantineThemeOverride = {
  colorScheme: "dark",
  primaryColor: "violet",
  primaryShade: 5,
  white: "#f3f0ff",
  // https://v6.mantine.dev/theming/theme-object/#focusring
  focusRing: "never",
  // https://v6.mantine.dev/styles/global-styles/
  globalStyles: () => ({
    // Non-text chrome: no accidental selection while tapping/dragging
    "img, svg, video, canvas, button, [role='button'], [role='menuitem'], [role='option'], [role='tab'], [role='slider'], [role='switch'], input[type='range'], input[type='checkbox'], input[type='radio']":
      {
        WebkitUserSelect: "none",
        userSelect: "none",
        WebkitTouchCallout: "none",
      },
    "button *, [role='button'] *, [role='menuitem'] *, [role='tab'] *": {
      WebkitUserSelect: "none",
      userSelect: "none",
    },
  }),
};

export const APP_BG = "#1A1B1E";
