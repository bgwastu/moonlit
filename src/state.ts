import { atom } from "jotai";
import { Player, Reverb } from "tone";
import { PlaybackSettings, Song } from "./interfaces";
import { getSongLength } from "./utils";

export type State = "loaded" | "playing" | "stop" | "finished";
export const stateAtom = atom<State>("loaded");

export const songAtom = atom(
  null as Song | null,
  async (get, set, song: Song | null) => {
    if (!song) return;
    const player = get(playerAtom);

    const reverb = get(reverbAtom);
    const p1 = reverb.generate();
    const p2 = player.load(song.fileUrl);
    await Promise.all([p1, p2]);

    set(playbackModeAtom, "slowed");
    reverb.toDestination();
    player.connect(reverb);

    set(stateAtom, "loaded");
    set(songAtom, song);
  }
);

export const playerAtom = atom(typeof window !== "undefined" && new Player());
playerAtom.debugLabel = "playerAtom (DO NOT CLICK)";
export const reverbAtom = atom(typeof window !== "undefined" && new Reverb());
reverbAtom.debugLabel = "reverbAtom (DO NOT CLICK)";

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

export const currentPlaybackAtom = atom(0);
currentPlaybackAtom.debugLabel = "currentPlaybackAtom";

type PlaybackMode = "slowed" | "normal" | "speedup" | "custom";
export const playbackModeAtom = atom(
  "slowed",
  async (get, set, playbackMode: PlaybackMode) => {
    set(playbackModeAtom, playbackMode);
    let playbackSettings: PlaybackSettings | null = null;
    if (playbackMode === "normal") {
      playbackSettings = {
        playbackRate: 1,
        reverbWet: 0,
        reverbDecay: 6,
        reverbPreDelay: 0.1,
      };
    } else if (playbackMode === "slowed") {
      playbackSettings = {
        playbackRate: 0.8,
        reverbWet: 0.4,
        reverbDecay: 6,
        reverbPreDelay: 0.1,
      };
    } else if (playbackMode === "speedup") {
      playbackSettings = {
        playbackRate: 1.25,
        reverbWet: 0.2,
        reverbDecay: 6,
        reverbPreDelay: 0.1,
      };
    } else {
      playbackSettings = get(customPlaybackSettingsAtom);
    }

    // make the playback speed change smoothly from player.playbackRate to playbackSettings.playbackRate
    let currPlaybackRate = get(playerAtom).playbackRate;
    const player = get(playerAtom);
    while (Math.abs(currPlaybackRate - playbackSettings.playbackRate) > 0.01) {
      player.playbackRate = currPlaybackRate;

      const previousSongLength = getSongLength(
        get(playerAtom).buffer.duration,
        currPlaybackRate
      );

      if (playbackSettings.playbackRate > currPlaybackRate)
        currPlaybackRate += 0.01;
      else currPlaybackRate -= 0.01;

      const newSongLength = getSongLength(
        get(playerAtom).buffer.duration,
        currPlaybackRate
      );

      set(
        currentPlaybackAtom,
        (newSongLength * get(currentPlaybackAtom)) / previousSongLength
      );

      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    // reverb settings
    const reverb = get(reverbAtom);
    reverb.wet.value = playbackSettings.reverbWet;
    reverb.decay = playbackSettings.reverbDecay;
    reverb.preDelay = playbackSettings.reverbPreDelay;

  }
);
playbackModeAtom.debugLabel = "playbackModeAtom";

const customPlaybackSettingsTemp = atom(
  typeof window !== "undefined" &&
    (JSON.parse(
      localStorage.getItem("custom-playback-settings") ??
        JSON.stringify(speedUpPlaybackSettings)
    ) as PlaybackSettings)
);

export const customPlaybackSettingsAtom = atom(
  (get) => get(customPlaybackSettingsTemp),
  async (get, set, playbackSettings: PlaybackSettings) => {
    set(customPlaybackSettingsTemp, playbackSettings);

    const newSongLength = getSongLength(
      get(playerAtom).buffer.duration,
      playbackSettings.playbackRate
    );

    const previousSongLength = getSongLength(
      get(playerAtom).buffer.duration,
      get(playerAtom).playbackRate
    );

    set(
      currentPlaybackAtom,
      (newSongLength * get(currentPlaybackAtom)) / previousSongLength
    );

    // action
    const reverb = get(reverbAtom);
    const player = get(playerAtom);

    player.playbackRate = playbackSettings.playbackRate;
    reverb.wet.value = playbackSettings.reverbWet;
    reverb.decay = playbackSettings.reverbDecay;
    reverb.preDelay = playbackSettings.reverbPreDelay;

    localStorage.setItem(
      "custom-playback-settings",
      JSON.stringify(playbackSettings)
    );
  }
);
customPlaybackSettingsAtom.debugLabel = "playbackSettingsAtom";
