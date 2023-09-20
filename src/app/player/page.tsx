"use client";
export const dynamic = "force-dynamic";

import {
  ActionIcon,
  Box,
  Button,
  Center,
  Flex,
  Image,
  Loader,
  MediaQuery,
  Modal,
  SegmentedControl,
  Slider,
  Text,
  TextInput,
  useMantineTheme,
} from "@mantine/core";
import {
  useDisclosure,
  useDocumentTitle,
  useHotkeys,
  useLocalStorage,
  useShallowEffect,
} from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconAdjustments,
  IconMusic,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconRewindBackward5,
  IconRewindForward5,
  IconRotate,
} from "@tabler/icons-react";
import { useAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useInterval } from "../../hooks/useInterval";
import {
  currentPlaybackAtom,
  customPlaybackSettingsAtom,
  playbackModeAtom,
  playerAtom,
  songAtom,
  stateAtom,
} from "../../state";
import { useRouter, useSearchParams } from "next/navigation";
import LoadingOverlay from "@/components/LoadingOverlay";
import Link from "next/link";

const getSongLength = (bufferDuration: number, playbackRate: number) => {
  return bufferDuration / playbackRate;
};

function getFormattedTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  const formattedMinutes = String(minutes).padStart(2, "");
  const formattedSeconds = String(remainingSeconds).padStart(2, "0");

  return `${formattedMinutes}:${formattedSeconds}`;
}

export default function PlayerPage() {
  const router = useRouter();
  const [imgLoading, setImgLoading] = useState(true);

  const [song] = useAtom(songAtom);
  const [currentPlayback, setCurrentPlayback] = useAtom(currentPlaybackAtom);
  const [state, setState] = useAtom(stateAtom);
  useDocumentTitle(song ? `${song.metadata.title} - Moonlit` : "Moonlit");

  const [storageBackgroundUrl, setStorageBackgroundUrl] = useLocalStorage<
    string | null
  >({
    key: "background-url",
    defaultValue: null,
  });
  const backgroundUrl = useMemo(() => {
    const listBackgroundUrls = [
      "https://i.pinimg.com/originals/08/2d/91/082d9121613b89feea2978e756e41a39.gif",
      "https://i.pinimg.com/originals/89/8f/bd/898fbd8a5d79c90be4732525a122a96f.gif",
      "https://i.pinimg.com/originals/a9/76/7d/a9767d35192a99c9a45b5376fff4a709.gif",
      "https://i.pinimg.com/originals/80/8d/ac/808dac987d37b884c2c068352ede5b5f.gif",
      "https://i.pinimg.com/originals/b3/e2/2e/b3e22e164a207f353809d20dde261bb8.gif",
    ];

    return (
      storageBackgroundUrl ||
      listBackgroundUrls[Math.floor(Math.random() * listBackgroundUrls.length)]
    );
  }, [storageBackgroundUrl]);

  const [player] = useAtom(playerAtom);
  const [playbackMode, setPlaybackMode] = useAtom(playbackModeAtom);
  const [customPlaybackSettings, setCustomPlaybackSettings] = useAtom(
    customPlaybackSettingsAtom
  );
  const songLength =
    typeof window !== "undefined" &&
    getSongLength(player.buffer.duration, player.playbackRate);
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
      router.replace("/");
      notifications.show({
        title: "No song selected",
        message: "Please select a song to play",
      });
      return;
    }

    while (!player.loaded) {
      continue;
    }

    player.start(0, currentPlayback * player.playbackRate);
    setState("playing");

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

    if (getFormattedTime(currentPlayback) == getFormattedTime(songLength)) {
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

  if (!song) return <></>;

  return (
    <>
      <LoadingOverlay visible={!player.loaded} message="Loading..." />
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
          <Flex justify="end" mt="md" gap="md" align="center">
            {storageBackgroundUrl ? (
              <Button
                variant="default"
                onClick={() => {
                  setStorageBackgroundUrl(null);
                  notifications.show({
                    title: "Background is changed!",
                    message: "Please wait...",
                  });
                  closeBgModal();
                }}
              >
                Use default background
              </Button>
            ): <Link href="https://id.pinterest.com/bznkmmbd/aesthetic/" target="_blank">Pinboard Aesthetic ✨</Link>}
            <Button
              type="submit"
              onClick={(e) => {
                e.preventDefault();
                const url = (
                  document.getElementById("background-url") as HTMLInputElement
                ).value;

                // check
                if (!/\.(jpg|jpeg|png|webp|gif)$/.test(url)) {
                  notifications.show({
                    title: "Error",
                    message: "Image is not valid",
                  });
                  return;
                }

                setStorageBackgroundUrl(url);
                notifications.show({
                  title: "Background is changed!",
                  message: "Please wait...",
                });
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
            height: "100dvh",
          }}
        >
          <Flex
            style={{
              position: "absolute",
              top: 22,
              left: 0,
              right: 0,
              zIndex: 2,
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
                style={{
                  boxShadow: "0px 0px 2px 0px rgba(0,0,0,0.75)",
                }}
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
              zIndex: 2,
            }}
          >
            <Flex align="center" justify="space-between" m={10}>
              <MediaQuery largerThan="md" styles={{ visibility: "hidden" }}>
                <Text
                  fz="sm"
                  px={10}
                  py={6}
                  sx={{
                    backgroundColor: theme.colors.dark[6],
                    borderRadius: theme.radius.sm,
                  }}
                >{`${getFormattedTime(currentPlayback)} / ${getFormattedTime(
                  songLength
                )}`}</Text>
              </MediaQuery>
              <Button size="sm" variant="default" onClick={openBgModal}>
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
            <Box style={{ backgroundColor: theme.colors.dark[6] }}>
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
                  <ActionIcon size="lg" onClick={forward} title="Forward 5 sec">
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
                    )} / ${getFormattedTime(songLength)}`}</Text>
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
          <Flex
            align="center"
            justify="center"
            h="100dvh"
            id="bg-wrapper"
            style={{
              userSelect: "none",
              WebkitUserSelect: "none",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 1,
                opacity: 0.6,
                backgroundImage:
                  "url(data:image/png;base64,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)",
              }}
            ></div>
            {imgLoading && (
              <Loader
                style={{
                  position: "absolute",
                  top: "calc(50% - 20px)",
                  left: "calc(50% - 20px)",
                  zIndex: 2,
                }}
              />
            )}
            <img
              id="bg-image"
              alt="background"
              style={{
                objectFit: "scale-down",
                width: "90%",
                height: "100%",
              }}
              crossOrigin="anonymous"
              src={`https://wsrv.nl/?url=${backgroundUrl}&n=-1&output=webp`}
              onLoad={(e) => {
                // get dominant color
                const img = e.target as HTMLImageElement;
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, img.width, img.height);
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
                document.getElementById("bg-wrapper").style.backgroundColor =
                  rgb;
                setImgLoading(false);
              }}
            />
          </Flex>
        </Box>
      </Box>
    </>
  );
}
