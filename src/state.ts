import { atom } from "jotai";
import { Song } from "./interfaces";

export const songAtom = atom(null as Song | null);
