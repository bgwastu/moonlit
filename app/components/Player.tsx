import * as Tone from "tone";

import { useAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useInterval } from "../hooks/setInterval";
import { Song } from "../interfaces";
import { loadingAtom, playbackSettingsAtom, playerAtom } from "../state";

const defaultValues = {
  playbackRate: 0.85,
  reverbWet: 0.6,
  reverbDecay: 6,
  reverbPreDelay: 0.1,
};

export const getSongLength = (bufferDuration: number, playbackRate: number) => {
  return bufferDuration / playbackRate;
};

export default function Player({ song }: { song: Song }) {
  const [currentPlayback, setCurrentPlayback] = useState<number>(0);
  const [playbackSettings, setPlaybackSettings] = useAtom(playbackSettingsAtom);
  const [_, setLoading] = useAtom(loadingAtom);
  const [player] = useAtom(playerAtom);

  const { clear: clearInterval, start: startInterval } = useInterval(
    () => {
      setCurrentPlayback((playback) => playback + 1);
    },
    1000,
    false
  );

  function togglePlayer() {
    if (player.state === "started") {
      clearInterval();
      player.stop();
    } else if (player.state === "stopped") {
      startInterval();
      player.start(0, currentPlayback * defaultValues.playbackRate);
    }
  }

  function setPlaybackPosition(value: number) {
    if (player.state === "started") {
      player.stop();
      player.start(0, value * defaultValues.playbackRate);
      setCurrentPlayback(value);
    } else {
      player.seek(0, value * defaultValues.playbackRate);
      setCurrentPlayback(value);
    }
  }

  return (
    <div>
      <p>{song.metadata.title}</p>
      <input
        type="range"
        min={0}
        step={1}
        max={getSongLength(player.buffer.duration, defaultValues.playbackRate)}
        value={currentPlayback}
        onChange={(e) => setPlaybackPosition(Number(e.target.value))}
      />
      <input
        id="playbackSpeed"
        data-testid="playbackSpeed"
        type="range"
        min="0.6"
        max="1"
        step="0.05"
        value={playbackSettings.playbackRate}
        onChange={(e) => {
          console.log(playbackSettings);
          setPlaybackSettings({
            ...playbackSettings,
            playbackRate: Number(e.target.value),
          });
        }}
      />
      <button onClick={() => togglePlayer()}>play/pause</button>
    </div>
  );
}
