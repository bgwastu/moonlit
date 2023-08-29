import {
  ActionIcon,
  Box,
  Button,
  Center,
  Flex,
  Image,
  MediaQuery,
  Modal,
  SegmentedControl,
  Slider,
  Text,
  Title,
  useMantineTheme,
} from "@mantine/core";
import { useDisclosure, useIdle } from "@mantine/hooks";
import { useAtom } from "jotai";
import { useEffect, useState } from "react";
import { useInterval } from "../hooks/useInterval";
import { Song } from "../interfaces";
import {
  currentPlaybackAtom,
  customPlaybackSettingsAtom,
  playbackModeAtom,
  playerAtom,
  reverbAtom,
} from "../state";

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
  const [currentPlayback, setCurrentPlayback] = useAtom(currentPlaybackAtom);
  const [state, setState] = useState<State>("stop");
  const [player] = useAtom(playerAtom);
  const [reverb] = useAtom(reverbAtom);
  const [playbackMode, setPlaybackMode] = useAtom(playbackModeAtom);
  const [customPlaybackSettings, setCustomPlaybackSettings] = useAtom(
    customPlaybackSettingsAtom
  );
  const songLength = getSongLength(player.buffer.duration, player.playbackRate);
  const theme = useMantineTheme();
  const { start: startInterval, stop: stopInterval } = useInterval(
    () => setCurrentPlayback((s) => s + 1),
    1000
  );
  const [modalOpened, { open: openModal, close: closeModal }] =
    useDisclosure(false);
  const isIdle = useIdle(3000);

  // playing onmount
  useEffect(() => {
    player.start(0, currentPlayback * player.playbackRate);
    setState("playing");
  }, []);

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
      player.start(0, currentPlayback * player.playbackRate);
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
      player.start(0, value * player.playbackRate);
    }
    setCurrentPlayback(value);
  }

  return (
    <>
      <Modal
        opened={modalOpened}
        onClose={closeModal}
        title="Customize Playback"
      >
        <Flex direction="column" mb={22} gap={2}>
          <Text>Playback Rate</Text>
          <Slider
            min={0.5}
            thumbSize={20}
            max={1.5}
            step={0.01}
            sx={{ zIndex: 100000 }}
            marks={[
              { value: 0.8, label: "Slowed" },
              { value: 1, label: "Normal" },
              { value: 1.25, label: "Speed Up" },
            ]}
            label={(v) => {
              if (v < 0.7) return `who hurt u? 😭`;
              return `${v}x`;
            }}
            value={customPlaybackSettings.playbackRate}
            onChange={(e) => {
              setCustomPlaybackSettings({
                ...customPlaybackSettings,
                playbackRate: e,
              });
            }}
          />
          <Text mt="sm">Reverb</Text>
          <Slider
            min={0}
            max={1}
            thumbSize={20}
            step={0.05}
            marks={[
              { value: 0, label: "None" },
              { value: 0.4, label: "Sweet" },
              { value: 1, label: "Full" },
            ]}
            value={customPlaybackSettings.reverbWet}
            onChange={(e) => {
              setCustomPlaybackSettings({
                ...customPlaybackSettings,
                reverbWet: e,
              });
            }}
          />
        </Flex>
      </Modal>
      <Box>
        <Box style={{ position: "relative" }}>
          <Flex
            opacity={isIdle ? 0.3 : 1}

            style={{
              position: "absolute",
              top: 18,
              left: 0,
              right: 0,
              zIndex: 1,
            }}
            justify="center"
            align="center"
            direction="column"
            gap="sm"
          >
            {/* <Button variant="default">Back</Button> */}
            <SegmentedControl
              bg={theme.colors.dark[6]}
              color="brand"
              radius="xl"
              onChange={setPlaybackMode}
              defaultValue={playbackMode}
              data={[
                { label: "Slowed", value: "slowed" },
                { label: "Normal", value: "normal" },
                { label: "Speed Up", value: "speedup" },
                {
                  label: (
                    <Center>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="1em"
                        height="1em"
                        viewBox="0 0 24 24"
                      >
                        <path
                          fill="currentColor"
                          d="M6.17 18a3.001 3.001 0 0 1 5.66 0H22v2H11.83a3.001 3.001 0 0 1-5.66 0H2v-2h4.17Zm6-7a3.001 3.001 0 0 1 5.66 0H22v2h-4.17a3.001 3.001 0 0 1-5.66 0H2v-2h10.17Zm-6-7a3.001 3.001 0 0 1 5.66 0H22v2H11.83a3.001 3.001 0 0 1-5.66 0H2V4h4.17Z"
                        ></path>
                      </svg>
                      <Box ml={10}>Custom</Box>
                    </Center>
                  ),
                  value: "custom",
                },
              ]}
            />
            {playbackMode === "custom" && (
              <Button radius="xl" variant="default" onClick={openModal}>
                Customize Playback
              </Button>
            )}
          </Flex>
          <Box
            opacity={isIdle ? 0.3 : 1}

            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 1,
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
                  getSongLength(player.buffer.duration, player.playbackRate)
                )}`}</Text>
              </Flex>
            </MediaQuery>
            <Slider
              value={currentPlayback}
              onChange={setPlaybackPosition}
              min={0}
              step={1}
              radius="xs"
              mb={-3}
              showLabelOnHover={false}
              size="sm"
              label={(v) => {
                return getFormattedTime(v);
              }}
              thumbSize={16}
              max={songLength}
            />
            <Box bg={theme.colors.dark[6]}>
              <Flex gap="xl" px="md" py="xs" justify="space-between">
                <Flex align="center">
                  <ActionIcon
                    size="xl"
                    onClick={() => setPlaybackPosition(currentPlayback - 5)}
                    title="Backward 5 sec"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      width="28"
                      height="28"
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
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 16 16"
                        >
                          <path
                            fill="currentColor"
                            d="M6 3.5a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5zm4 0a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5z"
                          ></path>
                        </svg>
                      ) : state === "stop" ? (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 16 16"
                        >
                          <path
                            fill="currentColor"
                            d="m11.596 8.697l-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393z"
                          ></path>
                        </svg>
                      ) : (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                        >
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
                      width="28"
                      height="28"
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
                    >{`${getFormattedTime(
                      currentPlayback
                    )} / ${getFormattedTime(
                      getSongLength(player.buffer.duration, player.playbackRate)
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
                max="1.2"
                step="0.05"
                value={player.playbackRate}
                onChange={(e) => {
                  onPlaybackRateChange(Number(e.target.value));
                  setPlaybackSettings({
                    ...playbackSettings,
                    playbackRate: Number(e.target.value),
                  });
                }}
              /> */}
            </Box>
          </Box>
          <Box h="100vh">
            <Image
              src="https://i.pinimg.com/originals/cc/7f/b2/cc7fb24def262e8507922f8e522caf09.gif"
              alt=""
              // temp
              height="100vh"
              fit="contain"
            />
          </Box>
        </Box>
      </Box>
    </>
  );
}
