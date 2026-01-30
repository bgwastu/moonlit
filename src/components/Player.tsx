import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { generateColors } from "@mantine/colors-generator";
import {
  ActionIcon,
  Box,
  Button,
  Center,
  Flex,
  Image,
  MantineProvider,
  MantineThemeOverride,
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
  IconBrandTiktok,
  IconBrandYoutube,
  IconBrandYoutubeFilled,
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
} from "@tabler/icons-react";
import LoadingOverlay from "@/components/LoadingOverlay";
import { useDominantColor } from "@/hooks/useDominantColor";
import { useStretchPlayer } from "@/hooks/useStretchPlayer";
import { useVideoPlayer } from "@/hooks/useVideoPlayer";
import { PlaybackMode, Song } from "@/interfaces";
import { getVideoState, saveVideoState } from "@/lib/videoState";
import { getFormattedTime } from "@/utils";
import CookiesModal from "./CookiesModal";
import CustomizePlaybackModal from "./CustomizePlaybackModal";
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

  const videoUrl = song.metadata.id
    ? song.metadata.platform === "youtube"
      ? `https://www.youtube.com/watch?v=${song.metadata.id}`
      : `https://www.tiktok.com/video/${song.metadata.id}`
    : song.fileUrl;

  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>("slowed");
  const [initialStartAt, setInitialStartAt] = useState(0);
  const [stateLoaded, setStateLoaded] = useState(false);
  const dominantColor = useDominantColor(song.metadata.coverUrl, initialDominantColor);

  const [isAudioOnly, setIsAudioOnly] = useState(false);
  const [videoAspectRatio, setVideoAspectRatio] = useState<number>(16 / 9);
  const [isRepeat, setIsRepeat] = useState(repeating);
  // Local slider values during drag; only commit on onChangeEnd
  const [speedSliderValue, setSpeedSliderValue] = useState(0.8);
  const [pitchSliderValue, setPitchSliderValue] = useState(0);

  // Load saved state
  const savedState = useMemo(() => getVideoState(videoUrl), [videoUrl]);

  // Pitch lock setting - loaded from saved state
  const [pitchLockedToSpeed, setPitchLockedToSpeed] = useState(
    savedState?.pitchLockedToSpeed ?? true,
  );

  // Initial rate based on mode
  const getInitialRate = () => {
    if (savedState?.rate) return savedState.rate;
    if (savedState?.mode === "slowed") return 0.8;
    if (savedState?.mode === "speedup") return 1.25;
    if (savedState?.mode === "normal") return 1;
    return 0.8; // Default to slowed
  };

  useEffect(() => {
    if (savedState) {
      setPlaybackMode(savedState.mode);
      setInitialStartAt(savedState.position);
    }

    setStateLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { videoRef, videoElement, isVideoReady, onError } = useVideoPlayer({
    song,
    repeating,
    playbackMode,
    customPlaybackRate: 1,
    startAt: stateLoaded ? initialStartAt : 0,
  });

  const {
    state: stretchState,
    isPlaying,
    currentTime,
    duration,
    rate,
    semitones,
    reverbAmount,
    isNativeFallback,
    play,
    pause,
    togglePlayback,
    setRate,
    setSemitones,
    setReverbAmount,
    seek,
  } = useStretchPlayer({
    videoElement,
    fileUrl: song.fileUrl,
    isVideoReady,
    initialRate: getInitialRate(),
    initialSemitones: savedState?.semitones ?? 0,
    initialReverbAmount: savedState?.reverbAmount ?? 0,
    initialPosition: stateLoaded ? initialStartAt : 0,
    onEnded: () => {
      // Handle repeat when playback ends
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
  const songLength = duration;
  const displayPosition = currentTime;

  // Sync slider local state when rate/semitones change from elsewhere (e.g. mode change)
  useEffect(() => {
    setSpeedSliderValue(rate);
    setPitchSliderValue(semitones);
  }, [rate, semitones]);

  // Disable ambient blur on Safari (renders rough/sharp edges there)
  const [isSafari, setIsSafari] = useState(false);
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ua = navigator.userAgent;
    // Safari (desktop and iOS) has "Safari" and no "Chrome"/"CriOS"
    setIsSafari(ua.includes("Safari") && !ua.includes("Chrome") && !ua.includes("CriOS"));
  }, []);

  // Ambient Mode (Canvas Extraction) - skipped on Safari
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    if (isSafari || !videoElement || !canvasRef.current || isAudioOnly) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { alpha: false });

    if (!ctx) return;

    const draw = () => {
      if (videoElement && !videoElement.paused && !videoElement.ended) {
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      }
      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isSafari, videoElement, isAudioOnly, isPlaying]);

  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const [cookiesModalOpened, { open: openCookiesModal, close: closeCookiesModal }] =
    useDisclosure(false);
  const [downloadModalOpened, { open: openDownloadModal, close: closeDownloadModal }] =
    useDisclosure(false);

  // Save state periodically
  const lastSaveRef = useRef<number>(0);
  useEffect(() => {
    if (!stateLoaded || !isReady) return;

    const now = Date.now();
    if (now - lastSaveRef.current < 5000) return;
    lastSaveRef.current = now;

    saveVideoState(videoUrl, {
      position: currentTime,
      mode: playbackMode,
      rate,
      semitones,
      reverbAmount,
      pitchLockedToSpeed,
      isRepeat,
    });
  }, [
    currentTime,
    playbackMode,
    rate,
    semitones,
    reverbAmount,
    pitchLockedToSpeed,
    isRepeat,
    videoUrl,
    stateLoaded,
    isReady,
  ]);

  // Save state on unmount
  useEffect(() => {
    const saveState = () => {
      if (!stateLoaded) return;
      saveVideoState(videoUrl, {
        position: currentTime,
        mode: playbackMode,
        rate,
        semitones,
        reverbAmount,
        pitchLockedToSpeed,
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
    currentTime,
    playbackMode,
    rate,
    semitones,
    reverbAmount,
    pitchLockedToSpeed,
    isRepeat,
    videoUrl,
    stateLoaded,
  ]);

  // Check Audio Only
  useEffect(() => {
    if (!videoElement) return;

    const checkAudioOnly = () => {
      if (videoElement.videoWidth === 0 && videoElement.videoHeight === 0) {
        setIsAudioOnly(true);
      } else {
        setIsAudioOnly(false);
        if (videoElement.videoWidth && videoElement.videoHeight) {
          setVideoAspectRatio(videoElement.videoWidth / videoElement.videoHeight);
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
  const [toast, setToast] = useState<{
    message: React.ReactNode;
    visible: boolean;
    isCircular?: boolean;
  }>({
    message: null,
    visible: false,
  });
  const toastTimeoutRef = useRef<NodeJS.Timeout>();

  const showToast = useCallback((message: React.ReactNode, isCircular?: boolean) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, visible: true, isCircular });
    toastTimeoutRef.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 1200);
  }, []);

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
    const newTime = Math.min(songLength, currentTime + 5);
    seek(newTime);
    showToast(
      <Flex align="center" gap="xs">
        <IconRewindForward5 size={24} />
        <Text weight={600}>+5s</Text>
      </Flex>,
    );
  }, [currentTime, songLength, seek, showToast]);

  const handleTogglePlayer = useCallback(() => {
    if (isEnded) {
      seek(0);
      play();
      showToast(<IconPlayerPlayFilled size={40} />, true);
    } else {
      togglePlayback();
      if (isPlaying) {
        showToast(<IconPause width={40} height={40} />, true);
      } else {
        showToast(<IconPlayerPlayFilled size={40} />, true);
      }
    }
  }, [isEnded, isPlaying, togglePlayback, seek, play, showToast]);

  const handleRateChange = useCallback(
    (newRate: number) => {
      setRate(newRate);
      // Only update pitch when lock is ON; when lock is OFF, leave semitones unchanged
      if (pitchLockedToSpeed) {
        const syncedSemitones = 12 * Math.log2(newRate);
        setSemitones(syncedSemitones);
        setPitchSliderValue(syncedSemitones);
      }
      // Update playback mode based on rate
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
    [setRate, setSemitones, pitchLockedToSpeed],
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
        setSemitones(12 * Math.log2(rate));
        setPitchSliderValue(12 * Math.log2(rate));
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
        newSemitones = 12 * Math.log2(0.8);
      } else if (mode === "normal") {
        newRate = 1;
        newSemitones = 0;
      } else if (mode === "speedup") {
        newRate = 1.25;
        newSemitones = 12 * Math.log2(1.25);
      }
      if (mode !== "custom") {
        setRate(newRate);
        setSemitones(newSemitones);
        // Show toast for mode change
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

  // Hotkeys
  useHotkeys([
    ["ArrowLeft", () => handleBackward()],
    ["ArrowRight", () => handleForward()],
    ["Space", () => handleTogglePlayer()],
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

  const getOriginalPlatformUrl = () => {
    if (song.metadata.platform === "youtube" && song.metadata.id) {
      const realSeconds = Math.floor(currentTime);
      return `https://www.youtube.com/watch?v=${song.metadata.id}&t=${realSeconds}s`;
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

  // Media Session API
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    let highResCover = song.metadata.coverUrl;
    if (song.metadata.platform === "youtube") {
      highResCover =
        song.metadata.coverUrl?.replace(/(hq|mq|sd)?default/, "maxresdefault") ||
        song.metadata.coverUrl;
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.metadata.title,
      artist: song.metadata.author,
      artwork: [
        {
          src: highResCover,
          sizes: "512x512",
          type: "image/jpeg",
        },
      ],
    });

    navigator.mediaSession.setActionHandler("play", () => play());
    navigator.mediaSession.setActionHandler("pause", () => pause());
    navigator.mediaSession.setActionHandler("seekbackward", () => handleBackward());
    navigator.mediaSession.setActionHandler("seekforward", () => handleForward());
    navigator.mediaSession.setActionHandler("previoustrack", () => handleBackward());
    navigator.mediaSession.setActionHandler("nexttrack", () => handleForward());

    try {
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (details.seekTime !== undefined) {
          seek(details.seekTime);
        }
      });
    } catch (error) {
      console.log("MediaSession seekto not supported");
    }

    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("seekbackward", null);
      navigator.mediaSession.setActionHandler("seekforward", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      try {
        navigator.mediaSession.setActionHandler("seekto", null);
      } catch (e) {}
    };
  }, [song, play, pause, handleBackward, handleForward, seek]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  useEffect(() => {
    if (!("mediaSession" in navigator) || !("setPositionState" in navigator.mediaSession))
      return;

    try {
      navigator.mediaSession.setPositionState({
        duration: Math.max(0, songLength),
        playbackRate: 1.0,
        position: Math.max(0, Math.min(displayPosition, songLength)),
      });
    } catch (e) {
      console.error("Error setting position state:", e);
    }
  }, [displayPosition, songLength]);

  return (
    <MantineProvider theme={dynamicTheme} inherit>
      <LoadingOverlay
        visible={isLoading || !isVideoReady || !videoElement}
        message={isLoading ? "Processing audio..." : "Loading video..."}
      />

      <CustomizePlaybackModal
        opened={modalOpened}
        onClose={closeModal}
        pitchLockedToSpeed={pitchLockedToSpeed}
        onLockToggle={handleLockToggle}
        speedSliderValue={speedSliderValue}
        onSpeedChange={setSpeedSliderValue}
        onSpeedChangeEnd={handleRateChange}
        semitones={semitones}
        pitchSliderValue={pitchSliderValue}
        onPitchChange={setPitchSliderValue}
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
        song={song}
        currentPlaybackRate={rate}
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
            {/* Ambient blur disabled on Safari (rough edges); canvas only rendered when !isSafari */}
            {!isSafari && (
              <canvas
                ref={canvasRef}
                width={30}
                height={15}
                style={{
                  position: "absolute",
                  top: "0",
                  left: "0",
                  width: "100%",
                  height: "100%",
                  filter: "blur(80px) contrast(1.15) saturate(1.1)",
                  transform: "scale(1.3)",
                  opacity: 0.35,
                  zIndex: -1,
                  pointerEvents: "none",
                }}
              />
            )}

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
                borderRadius: theme.radius.md,
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

          {/* Player Click Area */}
          <Box
            onClick={handleTogglePlayer}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "100%",
              height: "100%",
              zIndex: 10,
              cursor: "pointer",
            }}
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
              {`${getFormattedTime(isSeeking ? seekPosition : displayPosition)} / ${getFormattedTime(songLength)}`}
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
                      Go to {song.metadata.platform === "youtube" ? "YouTube" : "TikTok"}
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
            value={isSeeking ? seekPosition : displayPosition}
            onChange={handleSliderChange}
            onChangeEnd={handleSeekChange}
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
            thumbSize={isSeeking ? 20 : 15}
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
                  onClick={handleTogglePlayer}
                  title={isPlaying ? "Pause" : "Play"}
                  variant="transparent"
                  color="gray"
                >
                  {isPlaying ? <IconPause /> : <IconPlayerPlayFilled size={30} />}
                </ActionIcon>
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
                  <Flex align="center" gap={6}>
                    <Text size="sm" weight={600} lineClamp={1}>
                      {song.metadata.title}
                    </Text>
                    {getOriginalPlatformUrl() && (
                      <MediaQuery smallerThan="md" styles={{ display: "none" }}>
                        <ActionIcon
                          component="a"
                          href={getOriginalPlatformUrl()!}
                          target="_blank"
                          variant="transparent"
                          size="xs"
                          color="primary"
                          style={{ opacity: 0.7 }}
                        >
                          {song.metadata.platform === "youtube" ? (
                            <IconBrandYoutubeFilled size={16} />
                          ) : (
                            <IconBrandTiktok size={14} />
                          )}
                        </ActionIcon>
                      </MediaQuery>
                    )}
                  </Flex>
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
