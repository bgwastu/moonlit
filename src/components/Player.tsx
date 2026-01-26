import LoadingOverlay from "@/components/LoadingOverlay";
import { useAudioContext } from "@/hooks/useAudioContext";
import { useVideoPlayer } from "@/hooks/useVideoPlayer";
import { PlaybackMode, Song } from "@/interfaces";
import { getFormattedTime } from "@/utils";
import {
  ActionIcon,
  Box,
  Button,
  Center,
  CopyButton,
  Flex,
  Image,
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
import { useDisclosure, useDocumentTitle, useHotkeys } from "@mantine/hooks";
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
import { useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import { useEffect, useRef, useState } from "react";
import CookiesModal from "./CookiesModal";
import DownloadModal from "./DownloadModal";
import { IconPause } from "./IconPause";

export function Player({
  song,
  repeating,
}: {
  song: Song;
  repeating: boolean;
}) {
  const theme = useMantineTheme();
  // Playback State
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>("normal");
  const [customPlaybackRate, setCustomPlaybackRate] = useState(1);

  // URL Query State
  const [mode, setMode] = useQueryState("mode");
  const [rate, setRate] = useQueryState("rate");
  const [startAt] = useQueryState("startAt");

  // Load initial settings
  useEffect(() => {
    if (mode && ["slowed", "normal", "speedup", "custom"].includes(mode)) {
      setPlaybackMode(mode as PlaybackMode);
    }
    if (mode === "custom") {
      const savedRate = localStorage.getItem("custom-playback-rate");
      const parsedRate = savedRate
        ? JSON.parse(savedRate)
        : parseFloat(rate || "1") || 1;
      setCustomPlaybackRate(parsedRate);
    }
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
    startAt: startAt ? parseInt(startAt) : 0,
  });

  const { setReverbAmount, reverbAmount, isSafari } =
    useAudioContext(videoElement);

  useDocumentTitle(`${song.metadata.title} - Moonlit`);

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

  // Sync state to URL
  useEffect(() => {
    setMode(playbackMode === "normal" ? null : playbackMode);
    if (playbackMode === "custom") {
      setRate(customPlaybackRate + "");
    } else {
      setRate(null);
    }
  }, [playbackMode, customPlaybackRate, setMode, setRate]);

  // Save custom rate
  useEffect(() => {
    if (playbackMode === "custom") {
      localStorage.setItem(
        "custom-playback-rate",
        JSON.stringify(customPlaybackRate),
      );
    }
  }, [customPlaybackRate, playbackMode]);

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

  return (
    <>
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
              background: "rgba(0, 0, 0, 0.6)",
              color: "white",
              padding: "8px 16px",
              borderRadius: "8px",
              fontWeight: 500,
              pointerEvents: "none",
              backdropFilter: "blur(4px)",
            }}
          >
            {toast.message}
          </Box>
        )}

        {/* Video Player */}
        <Box
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 1,
            width: "90%",
            maxWidth: "600px",
            height: "60vh",
            maxHeight: "60vh",
            backgroundColor: "rgba(0,0,0,0.1)",
          }}
        >
          <video
            ref={videoRef}
            key={song.fileUrl}
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "8px",
              objectFit: "contain",
              display: "block",
              cursor: "pointer",
            }}
            playsInline
            controls={false}
            preload="metadata"
            autoPlay
            muted={false}
            crossOrigin="anonymous"
            onClick={togglePlayer}
            onTimeUpdate={onTimeUpdate}
            onError={onError}
          />
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
              >
                {`${getFormattedTime(displayPosition)} / ${getFormattedTime(songLength)}`}
              </Text>
            </MediaQuery>
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
            styles={{ thumb: { borderWidth: isSeeking ? 3 : 0 } }}
            thumbSize={isSeeking ? 25 : 15}
            label={(v) =>
              displayPosition >= songLength - 5 ? null : getFormattedTime(v)
            }
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
                  title={isPlaying ? "Pause" : isFinished ? "Replay" : "Play"}
                >
                  {isPlaying ? (
                    <IconPause />
                  ) : isFinished ? (
                    <IconRotate size={32} />
                  ) : (
                    <IconPlayerPlayFilled size={32} />
                  )}
                </ActionIcon>
                <ActionIcon size="lg" onClick={forward} title="Forward 5 sec">
                  <IconRewindForward5 />
                </ActionIcon>
                <ActionIcon
                  size="lg"
                  onClick={toggleLoop}
                  title={isRepeat ? "Turn off Repeat" : "Repeat"}
                  style={{
                    backgroundColor: isRepeat
                      ? theme.colors.violet[6]
                      : undefined,
                    color: isRepeat ? theme.white : undefined,
                  }}
                >
                  {isRepeat ? <IconRepeat /> : <IconRepeatOff />}
                </ActionIcon>
                <MediaQuery smallerThan="md" styles={{ display: "none" }}>
                  <Text
                    fz="sm"
                    ml="xs"
                    miw={80}
                    color="dimmed"
                  >{`${getFormattedTime(displayPosition)} / ${getFormattedTime(songLength)}`}</Text>
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
      </Box>
    </>
  );
}
