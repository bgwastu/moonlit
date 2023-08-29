import { atom } from "jotai";
import { Player, Reverb } from "tone";
import { PlaybackSettings, Song } from "./interfaces";
import { getSongLength } from "./utils";

export const songAtom = atom(null, async (get, set, song?: Song) => {
  if (!song) return;
  const player = get(playerAtom);
  set(loadingAtom, true);

  const reverb = get(reverbAtom);
  const p1 = reverb.generate();
  const p2 = player.load(song.fileUrl);
  await Promise.all([p1, p2]);

  reverb.toDestination();
  player.connect(reverb);

  // default mode is slowed
  set(playbackModeAtom, "slowed");

  set(loadingAtom, false);
  set(songAtom, song);
});

export const loadingAtom = atom(false);
export const playerAtom = atom(new Player());
playerAtom.debugLabel = "playerAtom (DO NOT CLICK)";
export const reverbAtom = atom(new Reverb());
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
  (get, set, playbackMode: PlaybackMode) => {
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


    // finally, set the value
    set(playbackModeAtom, playbackMode)
  }
);
playbackModeAtom.debugLabel = "playbackModeAtom"

const customPlaybackSettingsTemp = atom(
  JSON.parse(
    localStorage.getItem("custom-playback-settings") ??
      JSON.stringify(speedUpPlaybackSettings)
  ) as PlaybackSettings
);

export const customPlaybackSettingsAtom = atom(
  (get) => get(customPlaybackSettingsTemp),
  async (_, set, playbackSettings: PlaybackSettings) => {
    set(customPlaybackSettingsTemp, playbackSettings);
    set(playbackModeAtom, "custom");
    localStorage.setItem(
      "custom-playback-settings",
      JSON.stringify(playbackSettings)
    );
  }
);
customPlaybackSettingsAtom.debugLabel = "playbackSettingsAtom";
