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
  TextInput,
  UnstyledButton,
  rem,
  useMantineTheme,
} from "@mantine/core";
import {
  useDisclosure,
  useHotkeys,
  useLocalStorage,
  useShallowEffect,
} from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconAdjustments,
  IconHeart,
  IconMusic,
  IconPhoto,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconRewindBackward5,
  IconRewindForward5,
  IconRotate,
} from "@tabler/icons-react";
import { useAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useInterval } from "../hooks/useInterval";
import {
  currentPlaybackAtom,
  customPlaybackSettingsAtom,
  playbackModeAtom,
  playerAtom,
  songAtom,
  stateAtom,
} from "../state";

const getSongLength = (bufferDuration: number, playbackRate: number) => {
  return bufferDuration / playbackRate;
};

function getFormattedTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.ceil(seconds % 60);

  const formattedMinutes = String(minutes).padStart(2, "");
  const formattedSeconds = String(remainingSeconds).padStart(2, "0");

  return `${formattedMinutes}:${formattedSeconds}`;
}

export default function PlayerPage() {
  const navigate = useNavigate();
  const [song] = useAtom(songAtom);
  const [currentPlayback, setCurrentPlayback] = useAtom(currentPlaybackAtom);
  const [state, setState] = useAtom(stateAtom);
  const [backgroundUrl, setBackgroundUrl] = useLocalStorage({
    key: "background-url",
    defaultValue:
      "https://i.pinimg.com/originals/cc/7f/b2/cc7fb24def262e8507922f8e522caf09.gif",
  });
  const [player] = useAtom(playerAtom);
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
  const [modalBgOpened, { open: openBgModal, close: closeBgModal }] =
    useDisclosure(false);

  useHotkeys([
    ["ArrowLeft", () => backward()],
    ["ArrowRight", () => forward()],
    ["Space", () => togglePlayer()],
  ]);

  useShallowEffect(() => {
    if (!song) {
      navigate("/");
      notifications.show({
        title: "No song selected",
        message: "Please select a song to play",
      });
    }

    // confirm before closing
    window.onbeforeunload = () => {
      return "Are you sure?";
    };

    return () => {
      setState("stop");
      setCurrentPlayback(0);
      stopInterval();
      player.stop();
      window.onbeforeunload = null;
    };
  }, []);

  useShallowEffect(() => {
    // wait for 0.5 second before playing
    setTimeout(() => {
      if (song && state === "loaded") {
        player.start(0, currentPlayback * player.playbackRate);
        setState("playing");
      }
    }, 500);
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
  }, [
    currentPlayback,
    player.state,
    setState,
    songLength,
    startInterval,
    stopInterval,
  ]);

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
    if (state === "playing" || state === "finished") {
      player.stop();
      player.start(0, value * player.playbackRate);
    }
    setCurrentPlayback(value);
  }

  function backward() {
    // if current playback is less than 5 seconds, set to 0
    if (currentPlayback < 5) {
      setPlaybackPosition(0);
      return;
    }

    setPlaybackPosition(currentPlayback - 5);
  }

  function forward() {
    // if current playback is length of song - 5 seconds, set to length of song
    if (currentPlayback >= songLength - 5) {
      setPlaybackPosition(songLength);
      return;
    }

    setPlaybackPosition(currentPlayback + 5);
  }

  return (
    <>
      {song && (
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
          <Modal
            opened={modalBgOpened}
            onClose={closeBgModal}
            title="Change Background"
          >
            <form>
              <TextInput
                placeholder="Background URL"
                label="Image URL"
                id="background-url"
                type="url"
                description="PNG, GIF, JPG, JPEG, WEBP"
                defaultValue={backgroundUrl}
              />
              <Flex justify="end" mt="md">
                <Button
                  type="submit"
                  onClick={(e) => {
                    e.preventDefault();
                    const url = (
                      document.getElementById(
                        "background-url"
                      ) as HTMLInputElement
                    ).value;

                    // check
                    if (!/\.(jpg|jpeg|png|webp|gif)$/.test(url)) {
                      notifications.show({
                        title: "Error",
                        message: "Image is not valid",
                      });
                      return;
                    }

                    setBackgroundUrl(url);
                    notifications.show({
                      title: "Background is changed!",
                      message: "Please wait...",
                    })
                    closeBgModal();
                  }}
                >
                  Save
                </Button>
              </Flex>
            </form>
          </Modal>
          <Box>
            <Box
              style={{
                position: "relative",
                height: "100vh",
              }}
            >
              <Flex
                style={{
                  position: "absolute",
                  top: 22,
                  left: 0,
                  right: 0,
                  zIndex: 1,
                }}
                gap="sm"
                wrap="wrap"
                px="lg"
              >
                <Flex
                  style={{ flex: 1 }}
                  justify="center"
                  align="center"
                  direction="column"
                  gap="sm"
                >
                  <SegmentedControl
                    bg={theme.colors.dark[6]}
                    color="brand"
                    radius="xl"
                    size="sm"
                    onChange={setPlaybackMode}
                    defaultValue={playbackMode}
                    data={[
                      { label: "Slowed", value: "slowed" },
                      { label: "Normal", value: "normal" },
                      { label: "Speed Up", value: "speedup" },
                      {
                        label: (
                          <Center>
                            <IconAdjustments size={18} />
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
              </Flex>
              <Box
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  zIndex: 1,
                }}
              >
                <Flex align="center" justify="space-between" m={10}>
                  <MediaQuery largerThan="md" styles={{ visibility: "hidden" }}>
                    <Text
                      fz="sm"
                      px={8}
                      py={4}
                      sx={{
                        backgroundColor: theme.colors.dark[6],
                        borderRadius: theme.radius.sm,
                      }}
                    >{`${getFormattedTime(
                      currentPlayback
                    )} / ${getFormattedTime(
                      getSongLength(player.buffer.duration, player.playbackRate)
                    )}`}</Text>
                  </MediaQuery>
                  <Button
                    size="xs"
                    // variant="light"
                    color="dark"
                    onClick={openBgModal}
                  >
                    Change Image
                  </Button>
                </Flex>
                <Slider
                  value={currentPlayback}
                  onChange={setPlaybackPosition}
                  min={0}
                  step={1}
                  radius={0}
                  mb={-3}
                  showLabelOnHover={false}
                  size="sm"
                  pr={0.3}
                  styles={{
                    thumb: {
                      borderWidth: 0,
                    },
                  }}
                  thumbSize={15}
                  label={(v) => {
                    // prevent overflow
                    if (currentPlayback >= songLength - 5) {
                      return null;
                    }
                    return getFormattedTime(v);
                  }}
                  max={songLength}
                />
                <Box style={{ backgroundColor: theme.colors.dark[7] }}>
                  <Flex gap="sm" px="sm" py="md" justify="space-between">
                    <Flex align="center">
                      <ActionIcon
                        size="lg"
                        onClick={backward}
                        title="Backward 5 sec"
                      >
                        <IconRewindBackward5 />
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
                        {state === "playing" ? (
                          <IconPlayerPauseFilled size={32} />
                        ) : state === "stop" ? (
                          <IconPlayerPlayFilled size={32} />
                        ) : (
                          <IconRotate size={32} />
                        )}
                      </ActionIcon>
                      <ActionIcon
                        size="lg"
                        onClick={forward}
                        title="Forward 5 sec"
                      >
                        <IconRewindForward5 />
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
                          getSongLength(
                            player.buffer.duration,
                            player.playbackRate
                          )
                        )}`}</Text>
                      </MediaQuery>
                    </Flex>
                    <Flex gap="sm" align="center" style={{ flex: 1 }}>
                      <MediaQuery smallerThan="xs" styles={{ display: "none" }}>
                        <Image
                          src={song.metadata.coverUrl}
                          radius="sm"
                          height={38}
                          width={38}
                          withPlaceholder
                          placeholder={
                            <Center>
                              <IconMusic />
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
                </Box>
              </Box>
              <Flex align="center" justify="center" h="100vh" id="bg-wrapper" style={{
                userSelect: "none",
                WebkitUserSelect: "none",
              }}>
                <img
                  id="bg-image"
                  style={{
                    objectFit: "scale-down",
                    width: "90%",
                    userSelect: "none",
                    WebkitUserSelect: "none",
                    // disable drag
                  }}
                  crossOrigin="anonymous"
                  src={`https://wsrv.nl/?url=${backgroundUrl}&n=-1&output=webp`}
                  onLoad={(e) => {
                    // get dominant color
                    const img = e.target as HTMLImageElement;
                    const canvas = document.createElement("canvas");
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(img, 0, 0);
                    const imageData = ctx.getImageData(
                      0,
                      0,
                      img.width,
                      img.height
                    );
                    const data = imageData.data;
                    let r = 0;
                    let g = 0;
                    let b = 0;
                    let count = 0;

                    for (let i = 0; i < data.length; i += 4) {
                      if (data[i + 3] <= 0) {
                        continue;
                      }
                      r += data[i];
                      g += data[i + 1];
                      b += data[i + 2];
                      count++;
                    }

                    r = Math.floor(r / count);
                    g = Math.floor(g / count);
                    b = Math.floor(b / count);

                    const rgb = `rgb(${r}, ${g}, ${b})`;
                    document.getElementById("bg-wrapper").style.backgroundColor = rgb;
                  }}
                />
              </Flex>
            </Box>
          </Box>
        </>
      )}
    </>
  );
}
