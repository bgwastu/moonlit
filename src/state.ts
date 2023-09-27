import { atom } from "jotai";
import { Song } from "./interfaces";


export const songAtom = atom(
  null as Song | null,
  // async (get, set, song: Song | null) => {
  //   if (!song) return;
  //   const player = get(playerAtom);

  //   const reverb = get(reverbAtom);
  //   const p1 = reverb.generate();
  //   const p2 = player.load(song.fileUrl);
  //   await Promise.all([p1, p2]);

  //   set(playbackModeAtom, "slowed");
  //   reverb.toDestination();
  //   player.connect(reverb);

  //   set(songAtom, song);
  // }
);


export const normalPlaybackSettings = {
  playbackRate: 1,
  reverbWet: 0,
  reverbDecay: 6,
  reverbPreDelay: 0.1,
};

export const slowedPlaybackSettings = {
  playbackRate: 0.8,
  reverbWet: 0.4,
  reverbDecay: 6,
  reverbPreDelay: 0.1,
};

export const speedUpPlaybackSettings = {
  playbackRate: 1.25,
  reverbWet: 0.2,
  reverbDecay: 6,
  reverbPreDelay: 0.1,
};

