import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SiTiktok, SiYoutube } from "@icons-pack/react-simple-icons";
import {
  ActionIcon,
  Box,
  Button,
  Center,
  Flex,
  Image,
  MantineProvider,
  MediaQuery,
  Menu,
  SegmentedControl,
  Slider,
  Text,
  Transition,
  useMantineTheme,
} from "@mantine/core";
import { useDisclosure, useHotkeys, useMediaQuery } from "@mantine/hooks";
import {
  IconAdjustments,
  IconBug,
  IconCookie,
  IconDownload,
  IconExternalLink,
  IconHome,
  IconMenu2,
  IconMusic,
  IconPlayerPlayFilled,
  IconPlayerTrackNextFilled,
  IconPlayerTrackPrevFilled,
  IconRepeat,
  IconRepeatOff,
  IconRewindBackward5,
  IconRewindForward5,
  IconVolume,
  IconVolume2,
  IconVolume3,
  IconVolumeOff,
} from "@tabler/icons-react";
import { Pause } from "lucide-react";
import AmbientCanvas from "@/components/AmbientCanvas";
import LoadingOverlay from "@/components/LoadingOverlay";
import { useDominantColor } from "@/hooks/useDominantColor";
import { useMediaSession } from "@/hooks/useMediaSession";
import { usePlayerTapGestures } from "@/hooks/usePlayerTapGestures";
import { useStretchPlayer } from "@/hooks/useStretchPlayer";
import { useToast } from "@/hooks/useToast";
import { useVideoPlayer } from "@/hooks/useVideoPlayer";
import { useVideoStatePersistence } from "@/hooks/useVideoStatePersistence";
import { Media } from "@/interfaces";
import { getModeFromRate, getVideoState } from "@/lib/videoState";
import { getFormattedTime, getPlatform } from "@/utils";
import {
  createDynamicTheme,
  getOriginalPlatformUrl,
  getSemitonesFromRate,
} from "@/utils/player";
import CookiesModal from "./CookiesModal";
import CustomizePlaybackModal from "./CustomizePlaybackModal";
import DownloadModal from "./DownloadModal";

type PlaybackMode = "slowed" | "normal" | "speedup" | "custom";

export function Player({ media, repeating }: { media: Media; repeating: boolean }) {
  const theme = useMantineTheme();
  const isMobile = useMediaQuery("(max-width: 768px)");

  // Use sourceUrl from media state
  const sourceUrl = media.sourceUrl;

  // Load saved state
  const savedState = useMemo(() => getVideoState(sourceUrl), [sourceUrl]);

  // State - derive mode from rate
  const initialRate = savedState?.rate ?? 0.8;
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>(
    getModeFromRate(initialRate),
  );
  const initialStartAt = savedState?.position ?? 0;
  const [stateLoaded, setStateLoaded] = useState(false);
  const [isAudioOnly, setIsAudioOnly] = useState(false);
  const [videoAspectRatio, setVideoAspectRatio] = useState<number>(16 / 9);
  const [isRepeat, setIsRepeat] = useState(savedState?.isRepeat ?? repeating);
  const [pitchLockedToSpeed, setPitchLockedToSpeed] = useState(
    savedState?.pitchLockedToSpeed ?? true,
  );

  // Volume UI state (actual volume is managed by useStretchPlayer)
  const [isMuted, setIsMuted] = useState(false);
  const [isVolumeHovered, setIsVolumeHovered] = useState(false);
  const previousVolumeRef = useRef(savedState?.volume ?? 1);
  const pitchLockedToSpeedRef = useRef(pitchLockedToSpeed);

  const dominantColor = useDominantColor(media.metadata.coverUrl);
  const { toast, showToast } = useToast();

  // Initialize state loaded flag
  useEffect(() => {
    setStateLoaded(true);
  }, []);

  // Video player setup
  const { videoRef, videoElement, isVideoReady, onError } = useVideoPlayer({
    media,
    repeating,
    initialRate: stateLoaded ? initialRate : 1, // Use initialRate
    startAt: stateLoaded ? initialStartAt : 0,
  });

  // Stretch player (audio processing)
  const {
    state: stretchState,
    isPlaying,
    currentTime,
    duration,
    rate,
    semitones,
    reverbAmount,
    volume,
    isNativeFallback,
    play,
    pause,
    togglePlayback,
    setRate,
    setSemitones,
    setReverbAmount,
    setVolume,
    seek,
  } = useStretchPlayer({
    videoElement,
    fileUrl: media.fileUrl,
    isVideoReady,
    initialRate: initialRate,
    initialSemitones: savedState?.semitones ?? 0,
    initialReverbAmount: savedState?.reverbAmount ?? 0,
    initialVolume: savedState?.volume ?? 1,
    initialPosition: stateLoaded ? initialStartAt : 0,
    onEnded: () => {
      if (isRepeat) {
        seek(0);
        play();
      }
    },
  });

  const isLoading = stretchState === "loading";
  const isReady = stretchState === "ready";
  const isEnded =
    stretchState === "ready" &&
    currentTime >= duration - 0.05 &&
    duration > 0 &&
    !isPlaying &&
    !isRepeat;

  // Media session (browser controls)
  const handleBackward = useCallback(() => {
    const newTime = Math.max(0, currentTime - 5);
    seek(newTime);
    showToast(
      <Flex align="center" gap="xs">
        <IconRewindBackward5 size={24} />
        <Text weight={600}>-5s</Text>
      </Flex>,
    );
  }, [currentTime, seek, showToast]);

  const handleForward = useCallback(() => {
    const newTime = Math.min(duration, currentTime + 5);
    seek(newTime);
    showToast(
      <Flex align="center" gap="xs">
        <IconRewindForward5 size={24} />
        <Text weight={600}>+5s</Text>
      </Flex>,
    );
  }, [currentTime, duration, seek, showToast]);

  useMediaSession({
    media: media, // Same here, will update hook next
    isPlaying,
    currentTime,
    duration,
    onPlay: play,
    onPause: pause,
    onSeekBackward: handleBackward,
    onSeekForward: handleForward,
    onSeek: seek,
  });

  // Video state persistence
  useVideoStatePersistence({
    sourceUrl,
    currentTime,
    rate,
    semitones,
    reverbAmount,
    pitchLockedToSpeed,
    isRepeat,
    volume,
    isReady,
    stateLoaded,
  });

  // Keep ref in sync so rate-change handler always sees current lock state
  useEffect(() => {
    pitchLockedToSpeedRef.current = pitchLockedToSpeed;
  }, [pitchLockedToSpeed]);

  // Sync media dimensions (audio-only vs video with aspect ratio)
  useEffect(() => {
    if (!videoElement) return;

    const sync = () => {
      const { videoWidth, videoHeight } = videoElement;
      const audioOnly = videoWidth === 0 && videoHeight === 0;
      setIsAudioOnly(audioOnly);
      if (!audioOnly && videoWidth && videoHeight) {
        setVideoAspectRatio(videoWidth / videoHeight);
      }
    };

    if (videoElement.readyState >= 1) sync();
    videoElement.addEventListener("loadedmetadata", sync);
    return () => videoElement.removeEventListener("loadedmetadata", sync);
  }, [videoElement]);

  // Sync video rate with audio rate
  useEffect(() => {
    if (videoElement && Math.abs(videoElement.playbackRate - rate) > 0.01) {
      videoElement.playbackRate = rate;
    }
  }, [videoElement, rate]);

  // Modal controls
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const [cookiesModalOpened, { open: openCookiesModal, close: closeCookiesModal }] =
    useDisclosure(false);
  const [downloadModalOpened, { open: openDownloadModal, close: closeDownloadModal }] =
    useDisclosure(false);

  // Seeking state
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPosition, setSeekPosition] = useState(0);

  const handleSliderChange = useCallback((value: number) => {
    setSeekPosition(value);
    setIsSeeking(true);
  }, []);

  const handleSeekChange = useCallback(
    (value: number) => {
      setIsSeeking(false);
      seek(value);
    },
    [seek],
  );

  const handleTogglePlayer = useCallback(() => {
    if (isEnded) {
      seek(0);
      play();
      showToast(<IconPlayerPlayFilled size={40} />, true);
    } else {
      togglePlayback();
      if (isPlaying) {
        showToast(<Pause size={40} fill="currentColor" />, true);
      } else {
        showToast(<IconPlayerPlayFilled size={40} />, true);
      }
    }
  }, [isEnded, isPlaying, togglePlayback, seek, play, showToast]);

  const handleRateChange = useCallback(
    (newRate: number) => {
      setRate(newRate);
      if (pitchLockedToSpeedRef.current) {
        const syncedSemitones = getSemitonesFromRate(newRate);
        setSemitones(syncedSemitones);
      }
      // Update mode based on rate
      if (Math.abs(newRate - 0.8) < 0.01) {
        setPlaybackMode("slowed");
      } else if (Math.abs(newRate - 1) < 0.01) {
        setPlaybackMode("normal");
      } else if (Math.abs(newRate - 1.25) < 0.01) {
        setPlaybackMode("speedup");
      } else {
        setPlaybackMode("custom");
      }
    },
    [setRate, setSemitones],
  );

  const handleSemitonesChange = useCallback(
    (newSemitones: number) => {
      if (!pitchLockedToSpeed) setSemitones(newSemitones);
    },
    [pitchLockedToSpeed, setSemitones],
  );

  const handleLockToggle = useCallback(
    (locked: boolean) => {
      setPitchLockedToSpeed(locked);
      if (locked) {
        const syncedSemitones = getSemitonesFromRate(rate);
        setSemitones(syncedSemitones);
      }
    },
    [rate, setSemitones],
  );

  const handlePlaybackModeChange = useCallback(
    (mode: PlaybackMode) => {
      setPlaybackMode(mode);
      let newRate = rate;
      let newSemitones = semitones;

      if (mode === "slowed") {
        newRate = 0.8;
        newSemitones = getSemitonesFromRate(0.8);
      } else if (mode === "normal") {
        newRate = 1;
        newSemitones = 0;
      } else if (mode === "speedup") {
        newRate = 1.25;
        newSemitones = getSemitonesFromRate(1.25);
      }

      if (mode !== "custom") {
        setRate(newRate);
        setSemitones(newSemitones);
        const modeLabels: Record<string, string> = {
          slowed: "Slowed",
          normal: "Normal",
          speedup: "Speed Up",
        };
        showToast(
          <Flex align="center" gap="xs">
            <Text weight={600}>
              {modeLabels[mode]} ({newRate.toFixed(2)}x)
            </Text>
          </Flex>,
        );
      } else {
        showToast(
          <Flex align="center" gap="xs">
            <Text weight={600}>Custom ({rate.toFixed(2)}x)</Text>
          </Flex>,
        );
      }
    },
    [rate, semitones, setRate, setSemitones, showToast],
  );

  const toggleLoop = useCallback(() => {
    setIsRepeat(!isRepeat);
    showToast(
      <Flex align="center" gap="xs">
        {!isRepeat ? <IconRepeat size={24} /> : <IconRepeatOff size={24} />}
        <Text weight={600}>{!isRepeat ? "Repeat On" : "Repeat Off"}</Text>
      </Flex>,
    );
  }, [isRepeat, showToast]);

  // Volume handlers
  const handleMuteToggle = useCallback(() => {
    if (isMuted || volume === 0) {
      const newVol = previousVolumeRef.current > 0 ? previousVolumeRef.current : 1;
      setVolume(newVol);
      setIsMuted(false);
      showToast(
        <Flex align="center" gap="xs">
          <IconVolume3 size={24} />
          <Text weight={600}>Unmuted</Text>
        </Flex>,
      );
    } else {
      previousVolumeRef.current = volume;
      setVolume(0);
      setIsMuted(true);
      showToast(
        <Flex align="center" gap="xs">
          <IconVolumeOff size={24} />
          <Text weight={600}>Muted</Text>
        </Flex>,
      );
    }
  }, [isMuted, volume, setVolume, showToast]);

  const handleVolumeChange = useCallback(
    (newVolume: number) => {
      setVolume(newVolume);
      setIsMuted(newVolume === 0);
    },
    [setVolume],
  );

  const getVolumeIcon = useCallback(() => {
    if (isMuted || volume === 0) return <IconVolumeOff size={24} />;
    if (volume < 0.66) return <IconVolume2 size={24} />;
    return <IconVolume size={24} />;
  }, [isMuted, volume]);

  useHotkeys([
    ["ArrowLeft", () => handleBackward()],
    ["ArrowRight", () => handleForward()],
    ["Space", () => handleTogglePlayer()],
    ["k", () => handleTogglePlayer()],
    ["m", () => handleMuteToggle()],
    [
      "shift+<",
      () => {
        const newRate = Math.max(0.5, rate - 0.05);
        handleRateChange(Math.round(newRate * 100) / 100);
        showToast(
          <Flex align="center" gap="xs">
            <IconPlayerTrackPrevFilled size={24} />
            <Text weight={600}>{newRate.toFixed(2)}x</Text>
          </Flex>,
        );
      },
    ],
    [
      "shift+>",
      () => {
        const newRate = Math.min(1.5, rate + 0.05);
        handleRateChange(Math.round(newRate * 100) / 100);
        showToast(
          <Flex align="center" gap="xs">
            <IconPlayerTrackNextFilled size={24} />
            <Text weight={600}>{newRate.toFixed(2)}x</Text>
          </Flex>,
        );
      },
    ],
  ]);

  const originalPlatformUrl = getOriginalPlatformUrl(media, currentTime);
  const dynamicTheme = useMemo(
    () => createDynamicTheme(dominantColor, theme),
    [dominantColor, theme],
  );

  const playerAreaRef = useRef<HTMLDivElement>(null);
  usePlayerTapGestures(playerAreaRef, {
    onBackward: handleBackward,
    onForward: handleForward,
    onTogglePlayback: handleTogglePlayer,
    enabled: true,
  });

  return (
    <MantineProvider theme={dynamicTheme} inherit>
      <LoadingOverlay
        visible={isLoading || !isVideoReady || !videoElement}
        message={isLoading ? "Decoding the audio..." : "Loading..."}
      />

      <CustomizePlaybackModal
        opened={modalOpened}
        onClose={closeModal}
        pitchLockedToSpeed={pitchLockedToSpeed}
        onLockToggle={handleLockToggle}
        rate={rate}
        onSpeedChangeEnd={handleRateChange}
        semitones={semitones}
        onPitchChangeEnd={handleSemitonesChange}
        reverbAmount={reverbAmount}
        onReverbChange={setReverbAmount}
        isNativeFallback={isNativeFallback}
        onReset={() => {
          handleRateChange(1);
          setSemitones(0);
          setReverbAmount(0);
        }}
      />

      <DownloadModal
        opened={downloadModalOpened}
        onClose={closeDownloadModal}
        media={media}
        currentPlaybackRate={rate}
        currentSemitones={semitones}
        currentReverbAmount={reverbAmount}
      />

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
              onChange={(value) => handlePlaybackModeChange(value as PlaybackMode)}
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
        <Box
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <Transition
            mounted={toast.visible}
            transition="pop"
            duration={200}
            timingFunction="ease"
          >
            {(styles) => (
              <Box
                style={{
                  ...styles,
                  background: "rgba(0, 0, 0, 0.45)",
                  backdropFilter: "blur(12px)",
                  borderRadius: toast.isCircular ? "50%" : theme.radius.xl,
                  padding: toast.isCircular ? "20px" : "12px 24px",
                  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: toast.isCircular ? "90px" : "auto",
                  height: toast.isCircular ? "90px" : "auto",
                }}
              >
                {toast.message}
              </Box>
            )}
          </Transition>
        </Box>

        {/* Video Player Area - tap for play/pause, double-tap left/right edges on mobile for backward/forward */}
        <Box
          ref={playerAreaRef}
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
          {/* Video Container */}
          <Box
            style={{
              position: "relative",
              width: "auto",
              height: "auto",
              maxWidth: isMobile ? "100vw" : "60vw",
              maxHeight: isMobile ? "70vh" : "70vh",
              aspectRatio: `${videoAspectRatio}`,
              borderRadius: theme.radius.md,
              zIndex: 1,
              margin: "10px",
              display: isAudioOnly ? "none" : "block",
            }}
          >
            <AmbientCanvas
              videoElement={videoElement}
              isAudioOnly={isAudioOnly}
              isPlaying={isPlaying}
            />

            <video
              ref={videoRef}
              key={media.fileUrl}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
                userSelect: "none",
                borderRadius: theme.radius.md,
                cursor: "pointer",
                pointerEvents: "none",
              }}
              playsInline
              controls={false}
              preload="metadata"
              muted
              crossOrigin="anonymous"
              onError={onError}
            />
          </Box>

          {/* Audio Only Display */}
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
                pointerEvents: "none",
              }}
            >
              {media.metadata.coverUrl ? (
                <Image
                  src={
                    media.metadata.coverUrl?.replace(
                      /(hq|mq|sd)?default/,
                      "maxresdefault",
                    ) || media.metadata.coverUrl
                  }
                  width="100%"
                  height="100%"
                  radius={theme.radius.md}
                  fit="contain"
                  style={{ userSelect: "none", pointerEvents: "none" }}
                  alt={media.metadata.title}
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
                    {media.metadata.title}
                  </Text>
                  <Text size="md" color="dimmed" align="center">
                    {media.metadata.author}
                  </Text>
                </Box>
              )}
            </Box>
          )}
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
              {`${getFormattedTime(isSeeking ? seekPosition : currentTime)} / ${getFormattedTime(duration)}`}
            </Text>
            <Flex gap="xs">
              <Menu shadow="md" width={200} position="top-end">
                <Menu.Target>
                  <Button variant="default" leftIcon={<IconMenu2 size={18} />}>
                    Menu
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Navigation</Menu.Label>
                  <Menu.Item icon={<IconHome size={14} />} component={Link} href="/">
                    Home
                  </Menu.Item>
                  {originalPlatformUrl && (
                    <Menu.Item
                      icon={
                        getPlatform(media.sourceUrl) === "youtube" ? (
                          <SiYoutube size={14} />
                        ) : (
                          <SiTiktok size={14} />
                        )
                      }
                      component="a"
                      href={originalPlatformUrl}
                      rightSection={<IconExternalLink size={12} />}
                      target="_blank"
                    >
                      Go to{" "}
                      {getPlatform(media.sourceUrl) === "youtube" ? "YouTube" : "TikTok"}
                    </Menu.Item>
                  )}
                  <Menu.Divider />
                  <Menu.Label>Actions</Menu.Label>
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
                  <Menu.Divider />
                  <Menu.Label>Settings</Menu.Label>
                  <Menu.Item icon={<IconCookie size={14} />} onClick={openCookiesModal}>
                    Cookies Settings
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Flex>
          </Flex>

          <Slider
            value={isSeeking ? seekPosition : currentTime}
            onChange={handleSliderChange}
            onChangeEnd={handleSeekChange}
            min={0}
            step={1}
            radius={0}
            mb={-3}
            showLabelOnHover={false}
            size="xs"
            pr={0.3}
            sx={{
              "&:hover": {
                ".mantine-Slider-track": {
                  height: 6,
                },
                ".mantine-Slider-thumb": {
                  opacity: 1,
                  width: 15,
                  height: 15,
                },
              },
            }}
            styles={{
              thumb: {
                borderWidth: 0,
                opacity: 0,
                width: 0,
                height: 0,
                transition: "opacity 0.15s, width 0.15s, height 0.15s",
              },
              track: {
                transition: "height 0.15s",
              },
            }}
            label={(v) => (currentTime >= duration - 5 ? null : getFormattedTime(v))}
            max={duration}
          />

          <Box style={{ backgroundColor: theme.colors.dark[6] }}>
            <Flex gap="sm" px="xs" py="xs" align="center">
              <Flex align="center" gap={4}>
                <ActionIcon
                  size="xl"
                  onClick={handleTogglePlayer}
                  title={isPlaying ? "Pause" : "Play"}
                  variant="transparent"
                  color="gray"
                >
                  {isPlaying ? (
                    <Pause size={30} fill="currentColor" />
                  ) : (
                    <IconPlayerPlayFilled size={30} />
                  )}
                </ActionIcon>
                {/* Volume Control */}
                <Flex
                  align="center"
                  onMouseEnter={() => !isMobile && setIsVolumeHovered(true)}
                  onMouseLeave={() => !isMobile && setIsVolumeHovered(false)}
                  style={{ position: "relative" }}
                >
                  <ActionIcon
                    size="lg"
                    onClick={() => {
                      if (isMobile) {
                        setIsVolumeHovered(!isVolumeHovered);
                      } else {
                        handleMuteToggle();
                      }
                    }}
                    title={isMuted || volume === 0 ? "Unmute" : "Mute"}
                    variant="transparent"
                    color="gray"
                  >
                    {getVolumeIcon()}
                  </ActionIcon>
                  <Box
                    style={{
                      width: isVolumeHovered ? 80 : 0,
                      overflow: "hidden",
                      transition: "width 0.2s ease",
                    }}
                  >
                    <Slider
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                      min={0}
                      max={1}
                      step={0.01}
                      size="sm"
                      w={70}
                      ml={4}
                      styles={{
                        thumb: {
                          borderWidth: 0,
                        },
                      }}
                    />
                  </Box>
                </Flex>
                {/* Backward/Forward - hidden on mobile */}
                <MediaQuery smallerThan="xs" styles={{ display: "none" }}>
                  <Flex align="center" gap={4}>
                    <ActionIcon
                      size="lg"
                      onClick={handleBackward}
                      title="Backward 5 sec"
                      variant="transparent"
                      color="gray"
                    >
                      <IconRewindBackward5 />
                    </ActionIcon>
                    <ActionIcon
                      size="lg"
                      onClick={handleForward}
                      title="Forward 5 sec"
                      variant="transparent"
                      color="gray"
                    >
                      <IconRewindForward5 />
                    </ActionIcon>
                  </Flex>
                </MediaQuery>
                <ActionIcon
                  size="lg"
                  onClick={toggleLoop}
                  title={isRepeat ? "Turn off Repeat" : "Repeat"}
                  variant="transparent"
                  color={isRepeat ? "primary" : "gray"}
                >
                  {isRepeat ? <IconRepeat /> : <IconRepeatOff />}
                </ActionIcon>
              </Flex>
              <Flex ml={{ base: 0, xs: "lg" }}>
                <MediaQuery smallerThan="xs" styles={{ display: "none" }}>
                  <Image
                    src={media.metadata.coverUrl}
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
                  <Flex align="center" gap={6}>
                    <Text size="sm" weight={600} lineClamp={1}>
                      {media.metadata.title}
                    </Text>
                    {originalPlatformUrl && (
                      <MediaQuery smallerThan="md" styles={{ display: "none" }}>
                        <ActionIcon
                          component="a"
                          href={originalPlatformUrl}
                          target="_blank"
                          variant="transparent"
                          size="xs"
                          color="primary"
                          style={{ opacity: 0.7 }}
                        >
                          {getPlatform(media.sourceUrl) === "youtube" ? (
                            <SiYoutube size={16} />
                          ) : (
                            <SiTiktok size={14} />
                          )}
                        </ActionIcon>
                      </MediaQuery>
                    )}
                  </Flex>
                  <Text size="xs" color="dimmed" lineClamp={1}>
                    {media.metadata.author}
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
