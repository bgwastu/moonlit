import { atom } from "jotai";
import { Player, Reverb } from "tone";
import { PlaybackSettings, Song } from "./interfaces";

export const songAtom = atom(null, async (get, set, song?: Song) => {
  if (!song) return;

  const player = get(playerAtom);
  const playbackSettings = get(playbackSettingsAtom);

  set(loadingAtom, true);

  const reverb = get(reverbAtom);
  const p1 = reverb.generate();
  const p2 = player.load(song.fileUrl);
  await Promise.all([p1, p2]);

  player.playbackRate = playbackSettings.playbackRate;
  reverb.wet.value = playbackSettings.reverbWet;
  reverb.decay = playbackSettings.reverbDecay;

  reverb.toDestination();
  player.connect(reverb);

  set(loadingAtom, false);

  set(songAtom, song);
});

export const loadingAtom = atom(false);
export const playerAtom = atom(new Player());
playerAtom.debugLabel = "playerAtom";
export const reverbAtom = atom(new Reverb());
reverbAtom.debugLabel = "reverbAtom";

const defaultPlaybackSettings = {
  playbackRate: 0.8,
  reverbWet: 0.4,
  reverbDecay: 6,
  reverbPreDelay: 0.1,
};
const playbackSettingsTemp = atom(
  JSON.parse(
    localStorage.getItem("playback-settings") ??
      JSON.stringify(defaultPlaybackSettings)
  ) as PlaybackSettings
);

export const playbackSettingsAtom = atom(
  (get) => get(playbackSettingsTemp),
  async (get, set, playbackSettings: PlaybackSettings) => {
    const reverb = get(reverbAtom);
    const player = get(playerAtom);
    player.playbackRate = playbackSettings.playbackRate;
    reverb.wet.value = playbackSettings.reverbWet;
    reverb.decay = playbackSettings.reverbDecay;
    reverb.preDelay = playbackSettings.reverbPreDelay;
    set(playbackSettingsTemp, playbackSettings);
    localStorage.setItem("playback-settings", JSON.stringify(playbackSettings));
  }
);
playbackSettingsAtom.debugLabel = "playbackSettingsAtom";
