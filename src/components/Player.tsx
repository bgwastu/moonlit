import LoadingOverlay from "@/components/LoadingOverlay";
import { useAudioContext } from "@/hooks/useAudioContext";
import { useDominantColor } from "@/hooks/useDominantColor";
import { useVideoPlayer } from "@/hooks/useVideoPlayer";
import { PlaybackMode, Song } from "@/interfaces";
import {
  getStateFromUrlParams,
  getVideoState,
  saveVideoState,
} from "@/lib/videoState";
import { getFormattedTime } from "@/utils";
import { generateColors } from "@mantine/colors-generator";
import {
  ActionIcon,
  Box,
  Button,
  Center,
  Container,
  CopyButton,
  Flex,
  Image,
  MantineProvider,
  MantineThemeOverride,
  MediaQuery,
  Menu,
  Modal,
  SegmentedControl,
  Slider,
  Stack,
  Text,
  TextInput,
  useMantineTheme,
} from "@mantine/core";
import { useDisclosure, useHotkeys, useMediaQuery } from "@mantine/hooks";
import {
  IconAdjustments,
  IconBrandTiktok,
  IconBrandX,
  IconBrandYoutube,
  IconBug,
  IconCheck,
  IconCookie,
  IconCopy,
  IconDownload,
  IconExternalLink,
  IconHome,
  IconMenu2,
  IconMusic,
  IconPlayerPlayFilled,
  IconRepeat,
  IconRepeatOff,
  IconRewindBackward5,
  IconRewindForward5,
  IconRotate,
  IconShare,
} from "@tabler/icons-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import CookiesModal from "./CookiesModal";
import DownloadModal from "./DownloadModal";
import { IconPause } from "./IconPause";

export function Player({
  song,
  repeating,
  initialDominantColor,
}: {
  song: Song;
  repeating: boolean;
  initialDominantColor?: string;
}) {
  const theme = useMantineTheme();
  const isMobile = useMediaQuery("(max-width: 768px)");

  // Get the video URL for state storage
  const videoUrl = song.metadata.id
    ? song.metadata.platform === "youtube"
      ? `https://www.youtube.com/watch?v=${song.metadata.id}`
      : `https://www.tiktok.com/video/${song.metadata.id}`
    : song.fileUrl;

  // Playback State - default to "slowed"
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>("slowed");
  const [customPlaybackRate, setCustomPlaybackRate] = useState(1);
  const [initialStartAt, setInitialStartAt] = useState(0);
  const [stateLoaded, setStateLoaded] = useState(false);
  const dominantColor = useDominantColor(
    song.metadata.coverUrl,
    initialDominantColor,
  );

  const [isAudioOnly, setIsAudioOnly] = useState(false);
  const [videoAspectRatio, setVideoAspectRatio] = useState<number>(16 / 9);

  // Load initial settings from URL params (for sharing) or localStorage
  useEffect(() => {
    // Priority: URL params > localStorage > defaults
    const urlParams = getStateFromUrlParams();
    const savedState = getVideoState(videoUrl);

    // If URL has sharing params (startAt), use URL params
    if (urlParams.startAt !== undefined) {
      setPlaybackMode(urlParams.mode || "slowed");
      if (urlParams.mode === "custom" && urlParams.rate) {
        setCustomPlaybackRate(urlParams.rate);
      }
      setInitialStartAt(urlParams.startAt);
    }
    // Otherwise, restore from localStorage
    else if (savedState) {
      setPlaybackMode(savedState.mode);
      setCustomPlaybackRate(savedState.customRate);
      setInitialStartAt(savedState.position);
    }
    // Default to "slowed" mode (already set in useState)

    setStateLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    videoRef,
    videoElement,
    isVideoReady,
    isPlaying,
    isFinished,
    isRepeat,
    currentPlayback,
    displayPosition,
    songLength,
    isSeeking,
    togglePlayer,
    setPlaybackPosition,
    handleSliderChange,
    backward,
    forward,
    toggleLoop,
    onTimeUpdate,
    onError,
  } = useVideoPlayer({
    song,
    repeating,
    playbackMode,
    customPlaybackRate,
    startAt: stateLoaded ? initialStartAt : 0,
  });

  const { setReverbAmount, reverbAmount, isSafari } =
    useAudioContext(videoElement);

  const [modalOpened, { open: openModal, close: closeModal }] =
    useDisclosure(false);
  const [shareModalOpened, { open: openShareModal, close: closeShareModal }] =
    useDisclosure(false);
  const [
    cookiesModalOpened,
    { open: openCookiesModal, close: closeCookiesModal },
  ] = useDisclosure(false);
  const [
    downloadModalOpened,
    { open: openDownloadModal, close: closeDownloadModal },
  ] = useDisclosure(false);

  const [shareStartTime, setShareStartTime] = useState(0);

  // Save state to localStorage periodically and on changes
  const lastSaveRef = useRef<number>(0);
  useEffect(() => {
    if (!stateLoaded || !isVideoReady) return;

    // Throttle saves to every 5 seconds
    const now = Date.now();
    if (now - lastSaveRef.current < 5000) return;
    lastSaveRef.current = now;

    saveVideoState(videoUrl, {
      position: currentPlayback,
      mode: playbackMode,
      customRate: customPlaybackRate,
      reverbAmount,
      isRepeat,
    });
  }, [
    currentPlayback,
    playbackMode,
    customPlaybackRate,
    reverbAmount,
    isRepeat,
    videoUrl,
    stateLoaded,
    isVideoReady,
  ]);

  // Save state on unmount or visibility change
  useEffect(() => {
    const saveState = () => {
      if (!stateLoaded) return;
      saveVideoState(videoUrl, {
        position: currentPlayback,
        mode: playbackMode,
        customRate: customPlaybackRate,
        reverbAmount,
        isRepeat,
      });
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        saveState();
      }
    };

    window.addEventListener("beforeunload", saveState);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      saveState();
      window.removeEventListener("beforeunload", saveState);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    currentPlayback,
    playbackMode,
    customPlaybackRate,
    reverbAmount,
    isRepeat,
    videoUrl,
    stateLoaded,
    isVideoReady,
  ]);

  // Extract Dominant Color
  // Extract Dominant Color

  // Check Audio Only
  useEffect(() => {
    if (!videoElement) return;

    const checkAudioOnly = () => {
      if (videoElement.videoWidth === 0 && videoElement.videoHeight === 0) {
        setIsAudioOnly(true);
      } else {
        setIsAudioOnly(false);
        if (videoElement.videoWidth && videoElement.videoHeight) {
          setVideoAspectRatio(
            videoElement.videoWidth / videoElement.videoHeight,
          );
        }
      }
    };

    if (videoElement.readyState >= 1) {
      checkAudioOnly();
    }
    videoElement.addEventListener("loadedmetadata", checkAudioOnly);

    return () => {
      videoElement.removeEventListener("loadedmetadata", checkAudioOnly);
    };
  }, [videoElement]);

  // Toast Logic
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({
    message: "",
    visible: false,
  });
  const toastTimeoutRef = useRef<NodeJS.Timeout>();

  const showToast = (message: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, visible: true });
    toastTimeoutRef.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 2000);
  };

  const adjustCustomSpeed = (delta: number) => {
    let currentRate = customPlaybackRate;
    if (playbackMode !== "custom") {
      if (playbackMode === "normal") currentRate = 1;
      else if (playbackMode === "slowed") currentRate = 0.8;
      else if (playbackMode === "speedup") currentRate = 1.25;
    }
    let newRate = Math.round((currentRate + delta) * 100) / 100;
    if (newRate < 0.1) newRate = 0.1;
    setCustomPlaybackRate(newRate);
    setPlaybackMode("custom");
    showToast(`${newRate}x`);
  };

  // Hotkeys
  useHotkeys([
    ["ArrowLeft", () => backward()],
    ["ArrowRight", () => forward()],
    ["Space", () => togglePlayer()],
    [
      "alt+1",
      () => {
        setPlaybackMode("slowed");
        showToast("Slowed (0.8x)");
      },
    ],
    [
      "alt+¡",
      () => {
        setPlaybackMode("slowed");
        showToast("Slowed (0.8x)");
      },
    ],
    [
      "alt+2",
      () => {
        setPlaybackMode("normal");
        showToast("Normal (1.0x)");
      },
    ],
    [
      "alt+™",
      () => {
        setPlaybackMode("normal");
        showToast("Normal (1.0x)");
      },
    ],
    [
      "alt+3",
      () => {
        setPlaybackMode("speedup");
        showToast("Speed Up (1.25x)");
      },
    ],
    [
      "alt+£",
      () => {
        setPlaybackMode("speedup");
        showToast("Speed Up (1.25x)");
      },
    ],
    [
      "alt+4",
      () => {
        setPlaybackMode("custom");
        showToast(`Custom (${customPlaybackRate}x)`);
      },
    ],
    [
      "alt+¢",
      () => {
        setPlaybackMode("custom");
        showToast(`Custom (${customPlaybackRate}x)`);
      },
    ],
    ["shift+<", () => adjustCustomSpeed(-0.05)],
    ["shift+>", () => adjustCustomSpeed(0.05)],
  ]);

  const getOriginalPlatformUrl = () => {
    if (song.metadata.platform === "youtube" && song.metadata.id) {
      return `https://www.youtube.com/watch?v=${song.metadata.id}`;
    }
    if (song.metadata.platform === "tiktok" && song.metadata.id) {
      const currentUrl = window.location.pathname;
      const match = currentUrl.match(/\/(@[^/]+)\/video\/(\d+)/);
      if (match) {
        const [, creator, videoId] = match;
        return `https://www.tiktok.com/${creator}/video/${videoId}`;
      }
    }
    return null;
  };

  const getShareUrl = (startTime: number) => {
    const baseUrl = window.location.origin + window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    params.set("startAt", Math.floor(startTime).toString());
    if (playbackMode !== "normal") params.set("mode", playbackMode);
    if (playbackMode === "custom")
      params.set("rate", customPlaybackRate.toString());
    return `${baseUrl}?${params.toString()}`;
  };

  const handleOpenShareModal = () => {
    setShareStartTime(Math.floor(currentPlayback));
    openShareModal();
  };

  const dynamicTheme = useMemo(() => {
    if (dominantColor === "rgba(0,0,0,0)") return theme;

    return {
      ...theme,
      primaryColor: "brand",
      colors: {
        ...theme.colors,
        brand: generateColors(dominantColor) as any,
      },
    } as MantineThemeOverride;
  }, [dominantColor, theme]);

  return (
    <MantineProvider theme={dynamicTheme} inherit>
      <LoadingOverlay
        visible={!isVideoReady || !videoElement}
        message="Loading video..."
      />

      {/* Modals */}
      <Modal
        opened={modalOpened}
        onClose={closeModal}
        overlayProps={{ opacity: 0.5, blur: 4 }}
        title="Customize Playback"
      >
        <Stack>
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
              label={(v) => (v < 0.7 ? `who hurt u? 😭` : `${v}x`)}
              value={customPlaybackRate}
              onChange={setCustomPlaybackRate}
            />
          </Flex>
          {!isSafari && (
            <Flex direction="column" mb={22} gap={2}>
              <Text>Reverb Amount</Text>
              <Slider
                min={0}
                thumbSize={20}
                max={1}
                step={0.01}
                style={{ zIndex: 1000 }}
                marks={[
                  { value: 0, label: "Off" },
                  { value: 0.5, label: "Medium" },
                  { value: 1, label: "Full" },
                ]}
                label={(v) => `${Math.round(v * 100)}%`}
                value={reverbAmount}
                onChange={setReverbAmount}
              />
            </Flex>
          )}
          {isSafari && (
            <Text size="xs" color="dimmed">
              Note: Reverb is disabled on Safari for optimal playback
              performance
            </Text>
          )}
        </Stack>
      </Modal>

      <DownloadModal
        opened={downloadModalOpened}
        onClose={closeDownloadModal}
        song={song}
        currentPlaybackRate={
          playbackMode === "normal"
            ? 1
            : playbackMode === "slowed"
              ? 0.8
              : playbackMode === "speedup"
                ? 1.25
                : customPlaybackRate
        }
        currentReverb={reverbAmount}
      />

      <Modal
        opened={shareModalOpened}
        onClose={closeShareModal}
        overlayProps={{ opacity: 0.5, blur: 4 }}
        title="Share"
      >
        <Stack>
          <Text size="sm" color="dimmed">
            Share this remix starting at a specific time
          </Text>
          <TextInput
            label="Start time (seconds)"
            type="number"
            value={shareStartTime}
            onChange={(e) => setShareStartTime(parseInt(e.target.value) || 0)}
            min={0}
            max={songLength}
            rightSection={
              <Text size="xs" color="dimmed" pr="sm">
                {getFormattedTime(shareStartTime)}
              </Text>
            }
          />
          <TextInput
            label="Share URL"
            value={getShareUrl(shareStartTime)}
            readOnly
          />
          <CopyButton value={getShareUrl(shareStartTime)}>
            {({ copied, copy }) => (
              <Button
                leftIcon={
                  copied ? <IconCheck size={18} /> : <IconCopy size={18} />
                }
                color={copied ? "teal" : ""}
                onClick={copy}
                fullWidth
              >
                {copied ? "Copied!" : "Copy link to share"}
              </Button>
            )}
          </CopyButton>
        </Stack>
      </Modal>

      <CookiesModal opened={cookiesModalOpened} onClose={closeCookiesModal} />

      <Box style={{ position: "relative", height: "100dvh" }}>
        {/* Top Controls */}
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
              tabIndex={-1}
              bg={theme.colors.dark[6]}
              color="brand"
              style={{ boxShadow: "0px 0px 0px 1px #383A3F" }}
              size="sm"
              onChange={(value) => setPlaybackMode(value as PlaybackMode)}
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

        {/* Toast */}
        {toast.visible && (
          <Box
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 20,
              background: "rgba(255, 255, 255, 0.1)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
            }}
          >
            {toast.message}
          </Box>
        )}

        {/* Video Player Area */}
        <Box
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            backgroundColor: "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {/* Video Container with Dynamic Aspect Ratio */}
          <Box
            style={{
              position: "relative",
              width: "auto",
              height: "auto",
              maxWidth: isMobile ? "100vw" : "60vw",
              maxHeight: isMobile ? "70vh" : "70vh",
              aspectRatio: `${videoAspectRatio}`,
              borderRadius: theme.radius.md,
              overflow: "hidden",
              zIndex: 1,
              display: isAudioOnly ? "none" : "block",
            }}
          >
            <video
              ref={videoRef}
              key={song.fileUrl}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
                userSelect: "none",
                pointerEvents: "none",
              }}
              playsInline
              controls={false}
              preload="metadata"
              autoPlay
              muted={false}
              crossOrigin="anonymous"
              onTimeUpdate={onTimeUpdate}
              onError={onError}
            />
          </Box>

          {/* Audio Only / Music Mode Display */}
          {isAudioOnly && (
            <Box
              style={{
                zIndex: 1,
                position: "relative",
                width: "auto",
                height: "auto",
                maxWidth: isMobile ? "100vw" : "60vw",
                maxHeight: isMobile ? "70vh" : "60vh",
                aspectRatio: "1/1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {song.metadata.coverUrl ? (
                <Image
                  src={
                    song.metadata.coverUrl?.replace(
                      /(hq|mq|sd)?default/,
                      "maxresdefault",
                    ) || song.metadata.coverUrl
                  }
                  width="100%"
                  height="100%"
                  radius={theme.radius.md}
                  fit="contain"
                  style={{
                    userSelect: "none",
                    pointerEvents: "none",
                  }}
                  alt={song.metadata.title}
                />
              ) : (
                <Box
                  w="100%"
                  h="100%"
                  bg="rgba(255,255,255,0.1)"
                  style={{
                    borderRadius: theme.radius.md,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "column",
                    gap: 10,
                    userSelect: "none",
                  }}
                >
                  <IconMusic size={80} style={{ opacity: 0.5 }} />
                  <Text size="xl" weight={600} align="center">
                    {song.metadata.title}
                  </Text>
                  <Text size="md" color="dimmed" align="center">
                    {song.metadata.author}
                  </Text>
                </Box>
              )}
            </Box>
          )}

          {/* Pause/Resume Overlay */}
          <Box
            onClick={togglePlayer}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "100%",
              height: "100%",
              zIndex: 10,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {!isPlaying && (
              <Center
                w={80}
                h={80}
                bg="rgba(0,0,0,0.3)"
                style={{ borderRadius: "50%", backdropFilter: "blur(4px)" }}
              >
                {isFinished ? (
                  <IconRotate size={40} />
                ) : (
                  <IconPlayerPlayFilled size={40} />
                )}
              </Center>
            )}
          </Box>
        </Box>

        {/* Bottom Controls */}
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
            <Text
              fz="sm"
              px={10}
              py={6}
              style={{
                boxShadow: "0px 0px 0px 1px #383A3F",
                backgroundColor: theme.colors.dark[6],
                borderRadius: theme.radius.sm,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {`${getFormattedTime(displayPosition)} / ${getFormattedTime(songLength)}`}
            </Text>
            <Menu shadow="md" width={200} position="top-end">
              <Menu.Target>
                <Button variant="default" leftIcon={<IconMenu2 size={18} />}>
                  Menu
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>Navigation</Menu.Label>
                <Menu.Item
                  icon={<IconHome size={14} />}
                  component={Link}
                  href="/"
                >
                  Home
                </Menu.Item>
                {getOriginalPlatformUrl() && (
                  <Menu.Item
                    icon={
                      song.metadata.platform === "youtube" ? (
                        <IconBrandYoutube size={14} />
                      ) : (
                        <IconBrandTiktok size={14} />
                      )
                    }
                    component="a"
                    href={getOriginalPlatformUrl()!}
                    rightSection={<IconExternalLink size={12} />}
                    target="_blank"
                  >
                    Go to{" "}
                    {song.metadata.platform === "youtube"
                      ? "YouTube"
                      : "TikTok"}
                  </Menu.Item>
                )}
                <Menu.Divider />
                <Menu.Label>Actions</Menu.Label>
                <Menu.Item
                  icon={<IconShare size={14} />}
                  onClick={handleOpenShareModal}
                >
                  Share
                </Menu.Item>
                <Menu.Item
                  icon={<IconDownload size={14} />}
                  onClick={openDownloadModal}
                >
                  Download
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
                <Menu.Item
                  icon={<IconBrandX size={14} />}
                  component="a"
                  href={`https://x.com/intent/tweet?text=I'm listening to ${song.metadata.title} by ${song.metadata.author} on Moonlit!&url=${window.location.href}`}
                  rightSection={<IconExternalLink size={12} />}
                  target="_blank"
                >
                  Share on X
                </Menu.Item>
                <Menu.Divider />
                <Menu.Label>Settings</Menu.Label>
                <Menu.Item
                  icon={<IconCookie size={14} />}
                  onClick={openCookiesModal}
                >
                  Cookies Settings
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Flex>

          <Slider
            value={displayPosition}
            onChange={handleSliderChange}
            onChangeEnd={setPlaybackPosition}
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
            thumbSize={isSeeking ? 25 : 15}
            label={(v) =>
              displayPosition >= songLength - 5 ? null : getFormattedTime(v)
            }
            max={songLength}
          />

          <Box style={{ backgroundColor: theme.colors.dark[6] }}>
            <Flex gap="sm" px="xs" py="xs" align="center">
              <Flex align="center" gap={4}>
                <ActionIcon
                  size="xl"
                  onClick={togglePlayer}
                  title={isPlaying ? "Pause" : isFinished ? "Replay" : "Play"}
                  variant="transparent"
                  color="gray"
                >
                  {isPlaying ? (
                    <IconPause />
                  ) : isFinished ? (
                    <IconPlayerPlayFilled size={30} />
                  ) : (
                    <IconPlayerPlayFilled size={30} />
                  )}
                </ActionIcon>
                <ActionIcon
                  size="lg"
                  onClick={backward}
                  title="Backward 5 sec"
                  variant="transparent"
                  color="gray"
                >
                  <IconRewindBackward5 />
                </ActionIcon>
                <ActionIcon
                  size="lg"
                  onClick={forward}
                  title="Forward 5 sec"
                  variant="transparent"
                  color="gray"
                >
                  <IconRewindForward5 />
                </ActionIcon>
                <ActionIcon
                  size="lg"
                  onClick={toggleLoop}
                  title={isRepeat ? "Turn off Repeat" : "Repeat"}
                  variant={isRepeat ? "filled" : "transparent"}
                  color="primary"
                >
                  {isRepeat ? <IconRepeat /> : <IconRepeatOff />}
                </ActionIcon>
              </Flex>
              <Flex ml={{ base: 0, xs: "lg" }}>
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
                <Box ml="sm">
                  <Text size="sm" weight={600} lineClamp={1}>
                    {song.metadata.title}
                  </Text>
                  <Text size="xs" color="dimmed" lineClamp={1}>
                    {song.metadata.author}
                  </Text>
                </Box>
              </Flex>
            </Flex>
          </Box>
        </Box>
      </Box>
    </MantineProvider>
  );
}
