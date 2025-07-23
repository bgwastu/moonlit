import { Song } from "./interfaces";
import { MantineThemeOverride } from "@mantine/core";
import { atom } from "jotai";

export const songAtom = atom<Song | null>(null);

export const themeAtom = atom<MantineThemeOverride>({
  colorScheme: "dark",
  primaryColor: "violet",
  primaryShade: 5,
  white: "#f3f0ff", // violet[0]
});