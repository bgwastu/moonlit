import {
  ActionIcon,
  Box,
  Button,
  Center,
  Flex,
  Image,
  MediaQuery,
  Slider,
  Text,
  useMantineTheme,
} from "@mantine/core";
import { useAtom } from "jotai";
import { useEffect, useState } from "react";
import { useInterval } from "../hooks/useInterval";
import { Song } from "../interfaces";
import { playbackSettingsAtom, playerAtom } from "../state";

const getSongLength = (bufferDuration: number, playbackRate: number) => {
  return bufferDuration / playbackRate;
};

type State = "playing" | "stop" | "finished";

function getFormattedTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.ceil(seconds % 60);

  const formattedMinutes = String(minutes).padStart(2, "");
  const formattedSeconds = String(remainingSeconds).padStart(2, "0");

  return `${formattedMinutes}:${formattedSeconds}`;
}

export default function Player({ song }: { song: Song }) {
  const [currentPlayback, setCurrentPlayback] = useState(0);
  const [state, setState] = useState<State>("stop");
  const [playbackSettings, setPlaybackSettings] = useAtom(playbackSettingsAtom);
  const [player] = useAtom(playerAtom);
  const songLength = getSongLength(
    player.buffer.duration,
    playbackSettings.playbackRate
  );
  const theme = useMantineTheme();
  const { start: startInterval, stop: stopInterval } = useInterval(
    () => setCurrentPlayback((s) => s + 1),
    1000
  );

  useEffect(() => {
    if (state === "playing") {
      startInterval();
    } else {
      stopInterval();
    }
  }, [startInterval, state, stopInterval]);

  useEffect(() => {
    if (player.state === "stopped") {
      setState("stop");
    } else if (player.state === "started") {
      setState("playing");
    }
    if (player.state === "stopped" && currentPlayback >= songLength) {
      setState("finished");
      stopInterval();
    }
  }, [currentPlayback, player.state, songLength, startInterval, stopInterval]);

  function togglePlayer() {
    if (state === "playing") {
      player.stop();
      setState("stop");
    } else if (state === "stop") {
      player.start(0, currentPlayback * playbackSettings.playbackRate);
      setState("playing");
    } else if (state === "finished") {
      setCurrentPlayback(0);
      player.start(0);
      setState("playing");
    }
  }

  function setPlaybackPosition(value: number) {
    if (state === "playing") {
      player.stop();
      player.start(0, value * playbackSettings.playbackRate);
    }
    setCurrentPlayback(value);
  }

  function onPlaybackRateChange(newPlaybackRate: number) {
    const newSongLength = getSongLength(
      player.buffer.duration,
      newPlaybackRate
    );
    const previousSongLength = songLength;
    setCurrentPlayback((currentPlaybackPosition) => {
      return (newSongLength * currentPlaybackPosition) / previousSongLength;
    });
  }

  return (
    <div>
      <Box
        sx={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
        }}
      >
        <MediaQuery largerThan="md" styles={{ display: "none" }}>
          <Flex>
            <Text
              fz="sm"
              m="sm"
              px={8}
              py={4}
              sx={{
                backgroundColor: theme.colors.dark[6],
                borderRadius: theme.radius.sm,
                opacity: 0.8,
              }}
            >{`${getFormattedTime(currentPlayback)} / ${getFormattedTime(
              getSongLength(
                player.buffer.duration,
                playbackSettings.playbackRate
              )
            )}`}</Text>
          </Flex>
        </MediaQuery>
        <Box bg={theme.colors.dark[6]}>
          <Slider
            value={currentPlayback}
            onChange={setPlaybackPosition}
            min={0}
            step={1}
            radius="xs"
            showLabelOnHover={false}
            size="sm"
            label={(v) => {
              return getFormattedTime(v);
            }}
            thumbSize={16}
            max={songLength}
          />
          <Flex gap="xl" px="md" py="sm" justify="space-between">
            <Flex align="center">
              <ActionIcon
                size="xl"
                onClick={() => setPlaybackPosition(currentPlayback - 5)}
                title="Backward 5 sec"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  width="32"
                  height="32"
                >
                  <g
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  >
                    <path d="M15 18a6 6 0 1 0 0-12H4" />
                    <path d="M7 9L4 6l3-3m1 17h2a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1H8v-3h3" />
                  </g>
                </svg>
              </ActionIcon>
              <ActionIcon
                size="xl"
                onClick={togglePlayer}
                title={
                  state === "playing"
                    ? "Pause"
                    : state === "stop"
                    ? "Play"
                    : "Stop"
                }
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                  {state === "playing" ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
                      <path
                        fill="currentColor"
                        d="M6 3.5a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5zm4 0a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5z"
                      ></path>
                    </svg>
                  ) : state === "stop" ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
                      <path
                        fill="currentColor"
                        d="m11.596 8.697l-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393z"
                      ></path>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M12 20.75a7.26 7.26 0 0 1-7.25-7.25a.75.75 0 0 1 1.5 0A5.75 5.75 0 1 0 12 7.75H9.5a.75.75 0 0 1 0-1.5H12a7.25 7.25 0 0 1 0 14.5Z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 10.75a.74.74 0 0 1-.53-.22l-3-3a.75.75 0 0 1 0-1.06l3-3a.75.75 0 1 1 1.06 1.06L10.06 7l2.47 2.47a.75.75 0 0 1 0 1.06a.74.74 0 0 1-.53.22Z"
                      />
                    </svg>
                  )}
                </svg>
              </ActionIcon>
              <ActionIcon
                size="xl"
                onClick={() => setPlaybackPosition(currentPlayback + 5)}
                title="Forward 5 sec"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  width="32"
                  height="32"
                >
                  <g
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  >
                    <path d="M9 18A6 6 0 1 1 9 6h11m-7 14h2a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1h-2v-3h3" />
                    <path d="m17 9l3-3l-3-3" />
                  </g>
                </svg>
              </ActionIcon>
              <MediaQuery smallerThan="md" styles={{ display: "none" }}>
                <Text
                  fz="sm"
                  ml="xs"
                  miw={80}
                  color="dimmed"
                >{`${getFormattedTime(currentPlayback)} / ${getFormattedTime(
                  getSongLength(
                    player.buffer.duration,
                    playbackSettings.playbackRate
                  )
                )}`}</Text>
              </MediaQuery>
            </Flex>
            <Flex gap="sm" align="center" style={{ flex: 1 }}>
              <MediaQuery smallerThan="sm" styles={{ display: "none" }}>
                <Image
                  src={song.metadata.coverUrl}
                  radius="sm"
                  height={38}
                  width={38}
                  withPlaceholder
                  placeholder={
                    <Center>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="1.5em"
                        height="1.5em"
                        viewBox="0 0 24 24"
                      >
                        <g
                          fill="none"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                        >
                          <path d="M3 17a3 3 0 1 0 6 0a3 3 0 0 0-6 0m10 0a3 3 0 1 0 6 0a3 3 0 0 0-6 0"></path>
                          <path d="M9 17V4h10v13M9 8h10"></path>
                        </g>
                      </svg>
                    </Center>
                  }
                  alt="cover image"
                  sx={{}}
                />
              </MediaQuery>
              <Flex direction="column">
                <Text weight="600" lineClamp={1} lh={1.2} fz="sm">
                  {song.metadata.title}
                </Text>
                <Text lineClamp={1} color="dimmed" fz="sm" lh={1.2}>
                  {song.metadata.author}
                </Text>
              </Flex>
            </Flex>
          </Flex>
          {/* <input
            id="playbackSpeed"
            data-testid="playbackSpeed"
            type="range"
            min="0.6"
            max="1"
            step="0.05"
            value={playbackSettings.playbackRate}
            onChange={(e) => {
              onPlaybackRateChange(Number(e.target.value));
              setPlaybackSettings({
                ...playbackSettings,
                playbackRate: Number(e.target.value),
              });
            }}
          />
          <button onClick={() => togglePlayer()}>play/stop</button> */}
        </Box>
      </Box>
    </div>
  );
}
