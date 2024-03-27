import LoadingOverlay from "@/components/LoadingOverlay";
import { useInterval } from "@/hooks/useInterval";
import useNoSleep from "@/hooks/useNoSleep";
import { PlaybackSettings, Song } from "@/interfaces";
import { themeAtom } from "@/state";
import {
  getDominantColorFromImage,
  getFormattedTime,
  getSongLength,
} from "@/utils";
import { generateColors } from "@mantine/colors-generator";
import {
  ActionIcon,
  Anchor,
  Box,
  Button,
  Center,
  Flex,
  Image,
  Loader,
  MantineThemeOverride,
  MediaQuery,
  Menu,
  Modal,
  SegmentedControl,
  Slider,
  Text,
  TextInput,
  Tooltip,
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
  IconBrandYoutube,
  IconBug,
  IconExternalLink,
  IconHome,
  IconMenu2,
  IconMusic,
  IconPhotoEdit,
  IconPlayerPlayFilled,
  IconRepeat,
  IconRepeatOff,
  IconRewindBackward5,
  IconRewindForward5,
  IconRotate
} from "@tabler/icons-react";
import { atom, useAtom } from "jotai";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Player as PlayerTone, Reverb } from "tone";
import { IconPause } from "./IconPause";

type State = "playing" | "stop" | "finished";
const stateAtom = atom<State>("stop");
const playerAtom = atom(typeof window !== "undefined" && new PlayerTone());
const reverbAtom = atom(typeof window !== "undefined" && new Reverb());
const currentPlaybackAtom = atom(0);

type PlaybackMode = "slowed" | "normal" | "speedup" | "custom";
const playbackModeAtom = atom(
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

const customPlaybackSettingsTemp = atom(
  typeof window !== "undefined" &&
    (JSON.parse(
      localStorage.getItem("custom-playback-settings") ??
        JSON.stringify({
          playbackRate: 1,
          reverbWet: 0,
          reverbDecay: 6,
          reverbPreDelay: 0.1,
        })
    ) as PlaybackSettings)
);

const customPlaybackSettingsAtom = atom(
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

export function Player({ song, repeating }: { song: Song, repeating: boolean }) {
  const [imgLoading, setImgLoading] = useState(true);
  const [imageFallback, setImageFallback] = useState(false);
  const router = useRouter();
  const [currentPlayback, setCurrentPlayback] = useAtom(currentPlaybackAtom);
  const [state, setState] = useAtom(stateAtom);
  const [isRepeat, setIsRepeat] = useState(repeating);
  useDocumentTitle(`${song.metadata.title} - Moonlit`);

  const [storageBackgroundUrl, setStorageBackgroundUrl] = useLocalStorage<
    string | null
  >({
    key: "background-url",
    defaultValue: null,
  });
  const fallbackBackgroundUrl =
    "https://i.pinimg.com/originals/08/2d/91/082d9121613b89feea2978e756e41a39.gif";

  const defaultBackgroundUrl = song.metadata.id
    ? `https://i.ytimg.com/vi/${song.metadata.id}/maxresdefault.jpg`
    : fallbackBackgroundUrl;

  const backgroundUrl = storageBackgroundUrl
    ? storageBackgroundUrl
    : imageFallback
    ? fallbackBackgroundUrl
    : defaultBackgroundUrl;

  const [player] = useAtom(playerAtom);
  const [reverb] = useAtom(reverbAtom);
  const [playbackMode, setPlaybackMode] = useAtom(playbackModeAtom);

  const [customPlaybackSettings, setCustomPlaybackSettings] = useAtom(
    customPlaybackSettingsAtom
  );
  const songLength = getSongLength(player.buffer.duration, player.playbackRate);

  const theme = useMantineTheme();
  const [globalTheme, setGlobalTheme] = useAtom(themeAtom);
  const [noSleepEnabled, setNoSleepEnabled] = useNoSleep();
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
    async function setupTone() {
      const p1 = reverb.generate();
      const p2 = player.load(song.fileUrl);
      await Promise.all([p1, p2]);
      reverb.toDestination();
      player.connect(reverb);

      // set to normal mode
      await setPlaybackMode("normal");

      while (!player.loaded) {
        continue;
      }

      player.start(0, currentPlayback * player.playbackRate);
      setState("playing");
    }

    setupTone().catch((e) => {
      notifications.show({
        title: "Error",
        message: "An error occured while loading the song",
      });
      console.error(e);
      router.push("/");
    });
  }, []);

  useShallowEffect(() => {
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

      // change theme back to default
      setGlobalTheme({
        colorScheme: "dark",
        primaryColor: "violet",
        primaryShade: 5,
        white: "#f3f0ff", // violet[0],
      });
    };
  }, []);

  useEffect(() => {
    if (state === "playing") {
      startInterval();
    } else {
      stopInterval();
    }
  }, [startInterval, state, stopInterval]);

  useEffect(
    function handleLoop() {
      if (isRepeat) {
        player.loop = true;
        if (state === "finished") {
          setState("playing");
          setCurrentPlayback(0);
        }
      } else {
        player.loop = false;
      }
    },
    [isRepeat, player, setCurrentPlayback, setState, state]
  );

  useEffect(() => {
    if (player.state === "stopped") {
      setState("stop");
    } else if (player.state === "started") {
      setState("playing");
    }

    if (getFormattedTime(currentPlayback) == getFormattedTime(songLength)) {
      if (isRepeat === false) {
        setState("finished");
        setNoSleepEnabled(false);
        stopInterval();
      } else {
        setCurrentPlayback(0);
      }
    }
  }, [
    currentPlayback,
    isRepeat,
    player.state,
    setCurrentPlayback,
    setNoSleepEnabled,
    setState,
    songLength,
    startInterval,
    stopInterval,
  ]);

  function togglePlayer() {
    if (state === "playing") {
      player.stop();
      setState("stop");
      setNoSleepEnabled(false);
    } else if (state === "stop") {
      player.start(0, currentPlayback * player.playbackRate);
      setState("playing");
      setNoSleepEnabled(true);
    } else if (state === "finished") {
      setCurrentPlayback(0);
      player.start(0);
      setState("playing");
      setNoSleepEnabled(true);
    }
  }

  function setPlaybackPosition(value: number) {
    if (state === "playing" || state === "finished") {
      player.stop();
      player.start(0, value * player.playbackRate);
      setNoSleepEnabled(true);
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
      <LoadingOverlay visible={!player.loaded} message="Loading..." />
      <Modal
        opened={modalOpened}
        onClose={closeModal}
        overlayProps={{ opacity: 0.5, blur: 4 }}
        title="Customize Playback"
      >
        <Flex direction="column" mb={22} gap={2}>
          <Text>Playback Rate</Text>
          <Slider
            min={0.5}
            thumbSize={20}
            max={1.5}
            step={0.01}
            style={{ zIndex: 1000 }}
            marks={[
              { value: 0.8, label: "Slowed" },
              { value: 1, label: "Normal" },
              { value: 1.25, label: "Speed Up" },
            ]}
            label={(v) => {
              if (v < 0.7) return `who hurt u? 😭`;
              return `${v}x`;
            }}
            defaultValue={customPlaybackSettings.playbackRate}
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
            defaultValue={customPlaybackSettings.reverbWet}
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
        overlayProps={{ opacity: 0.5, blur: 4 }}
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
            mb="xs"
          />

          <Anchor
            href="https://id.pinterest.com/bznkmmbd/aesthetic/"
            target="_blank"
          >
            pinboard aesthetic references <IconExternalLink size={16} />
          </Anchor>
          <Flex justify="end" mt="md" gap="md" align="center">
            {storageBackgroundUrl && (
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
            )}
            <Button
              type="submit"
              disabled={
                (document.getElementById("background-url") as HTMLInputElement)
                  ?.value === backgroundUrl
              }
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

      <Box
        style={{
          position: "relative",
          height: "100dvh",
        }}
      >
        <Flex
          style={{
            position: "absolute",
            top: 28,
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
              style={{
                boxShadow: "0px 0px 0px 1px #383A3F",
              }}
              size="sm"
              onChange={setPlaybackMode}
              value={playbackMode}
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
              <Button variant="default" onClick={openModal}>
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
                style={{
                  boxShadow: "0px 0px 0px 1px #383A3F",
                  backgroundColor: theme.colors.dark[6],
                  borderRadius: theme.radius.sm,
                }}
              >{`${getFormattedTime(currentPlayback)} / ${getFormattedTime(
                songLength
              )}`}</Text>
            </MediaQuery>
            <Menu shadow="md" width={200} position="top-end">
              <Menu.Target>
                <Button variant="default" leftIcon={<IconMenu2 size={18} />}>
                  Menu
                </Button>
              </Menu.Target>

              <Menu.Dropdown>
                <Menu.Label>Options</Menu.Label>
                <Menu.Item
                  icon={<IconPhotoEdit size={14} />}
                  onClick={openBgModal}
                >
                  Change Background
                </Menu.Item>
                <Menu.Divider />
                <Menu.Label>Navigation</Menu.Label>
                <Menu.Item
                  icon={<IconHome size={14} />}
                  component={Link}
                  href="/"
                >
                  Home
                </Menu.Item>
                <Menu.Item
                  icon={<IconBug size={14} />}
                  component="a"
                  href="https://github.com/bgwastu/moonlit/issues"
                  rightSection={<IconExternalLink size={12} />}
                  target="_blank"
                >
                  Report Bug
                </Menu.Item>
                {song.metadata.id && (
                  <Menu.Item
                    icon={<IconBrandYoutube size={14} />}
                    rightSection={<IconExternalLink size={12} />}
                    component="a"
                    href={`https://www.youtube.com/watch?v=${song.metadata.id}`}
                    target="_blank"
                  >
                    YouTube
                  </Menu.Item>
                )}
              </Menu.Dropdown>
            </Menu>
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
                <ActionIcon size="lg" onClick={backward} title="Backward 5 sec">
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
                    <IconPause />
                  ) : state === "stop" ? (
                    <IconPlayerPlayFilled size={32} />
                  ) : (
                    <IconRotate size={32} />
                  )}
                </ActionIcon>
                <ActionIcon size="lg" onClick={forward} title="Forward 5 sec">
                  <IconRewindForward5 />
                </ActionIcon>
                <Tooltip label={isRepeat ? "Turn off Repeat" : "Repeat"}>
                  <ActionIcon
                    size="lg"
                    onClick={() => {
                      setIsRepeat((s) => !s);
                    }}
                    title={isRepeat ? "Turn off Repeat" : "Repeat"}
                    color={isRepeat ? "brand.4" : null}
                  >
                    {isRepeat ? <IconRepeatOff /> : <IconRepeat />}
                  </ActionIcon>
                </Tooltip>
                <MediaQuery smallerThan="md" styles={{ display: "none" }}>
                  <Text
                    fz="sm"
                    ml="xs"
                    miw={80}
                    color="dimmed"
                  >{`${getFormattedTime(currentPlayback)} / ${getFormattedTime(
                    songLength
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
              opacity: 0.8,
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
              maxHeight: "50dvh",
            }}
            crossOrigin="anonymous"
            src={`https://wsrv.nl/?url=${backgroundUrl}&output=webp&n=-1`}
            onError={() => {
              setImageFallback(true);
              setImgLoading(false);
            }}
            onLoad={(e) => {
              const color = getDominantColorFromImage(
                e.target as HTMLImageElement
              );

              // change global theme based on dominant color
              const colors = generateColors(color);

              const newTheme: MantineThemeOverride = {
                ...globalTheme,
                colors: {
                  ...globalTheme.colors,
                  brand: [
                    colors[0],
                    colors[1],
                    colors[2],
                    colors[3],
                    colors[4],
                    colors[5],
                    colors[6],
                    colors[7],
                    colors[8],
                    colors[9],
                  ],
                },
                primaryColor: "brand",
              };

              setGlobalTheme(newTheme);
              document.getElementById("bg-wrapper").style.backgroundColor =
                colors[8];

              setImgLoading(false);
            }}
          />
        </Flex>
      </Box>
    </>
  );
}
