import * as Tone from "tone";

import { useEffect, useMemo, useState } from "react";
import { useInterval } from "../hooks/setInterval";
import { Song, SongMetadata } from "../interfaces";

const defaultValues = {
  playbackRate: 0.7,
  reverbWet: 0.4,
  reverbDecay: 6,
  reverbPreDelay: 0.01,
};

export const getSongLength = (bufferDuration: number, playbackRate: number) => {
  return bufferDuration / playbackRate;
};

interface Props {
  song: Song;
  setLoading(value: boolean): void;
}

export default function Player({ song, setLoading }: Props) {
  const [currentPlayback, setCurrentPlayback] = useState<number>(0);

  const { clear: clearInterval, start: startInterval } = useInterval(
    () => {
      setCurrentPlayback((playback) => playback + 1);
    },
    1000,
    false
  );

  useEffect(() => {
    init(song.fileUrl);
  }, [init, song.fileUrl])

  const reverb = useMemo(() => new Tone.Reverb(), []);
  const player = useMemo(() => new Tone.Player(), []);

  function togglePlayer() {
    if (player.state === "started") {
      clearInterval();
      player.stop();
    } else if (player.state === "stopped") {
      startInterval();
      player.start(0, currentPlayback * defaultValues.playbackRate);
    }
  }

  async function init(trackUrl: string) {
    const p1 = reverb.generate();
    const p2 = player.load(trackUrl);
    await Promise.all([p1, p2]);

    player.playbackRate = defaultValues.playbackRate;
    reverb.wet.value = defaultValues.reverbWet;
    reverb.decay = defaultValues.reverbDecay;

    reverb.toDestination();
    player.connect(reverb);

    setLoading(false);
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
      <button onClick={() => togglePlayer()}>play/pause</button>
    </div>
  );
}
