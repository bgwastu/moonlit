import { atom } from "jotai";
import { Song } from "./interfaces";
import { MantineTheme, MantineThemeOverride } from "@mantine/core";

export const songAtom = atom(null as Song | null);

export const themeAtom = atom({
  colorScheme: "dark",
  primaryColor: "violet",
  primaryShade: 5,
  white: "#f3f0ff" // violet[0],
} as MantineThemeOverride);