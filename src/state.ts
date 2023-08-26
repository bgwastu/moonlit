import { atom } from "jotai";
import { Song } from "./interfaces";
import { atomWithStorage } from "jotai/utils";

export const songAtom = atom<Song | null>(null);
export const currentPlaybackPositionAtom = atom<number>(0);
export const loadingAtom = atom<boolean>(false);
export const playbackSettingsAtom = atomWithStorage("playback-settings", {
  playbackRate: 0.8,
  reverbWet: 0.6,
  reverbDecay: 6,
  reverbPreDelay: 0.1,
});
