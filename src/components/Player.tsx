"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SiYoutube } from "@icons-pack/react-simple-icons";
import { generateColors } from "@mantine/colors-generator";
import {
  ActionIcon,
  Box,
  Button,
  Center,
  Container,
  Flex,
  Image,
  Loader,
  MantineProvider,
  MediaQuery,
  Menu,
  Progress,
  SegmentedControl,
  Slider,
  Text,
  Transition,
  useMantineTheme,
} from "@mantine/core";
import { useDisclosure, useHotkeys, useMediaQuery, useOs } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconAdjustments,
  IconChevronsLeft,
  IconChevronsRight,
  IconDownload,
  IconExternalLink,
  IconFileMusic,
  IconHome,
  IconMenu2,
  IconMicrophone2,
  IconMusic,
  IconPlayerPauseFilled,
  IconPlayerPlay,
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
import Icon from "@/components/Icon";
import { useAppContext } from "@/context/AppContext";
import { useDominantColor } from "@/hooks/useDominantColor";
import { useLyrics } from "@/hooks/useLyrics";
import { usePlayerTapGestures } from "@/hooks/usePlayerTapGestures";
import { useStretchPlayer } from "@/hooks/useStretchPlayer";
import { HistoryItem, LyricsSettings, Media } from "@/interfaces";
import { stripVideoTitleFiller } from "@/lib/lyrics";
import { getModeFromRate, getVideoState, saveVideoState } from "@/lib/videoState";
import { getFormattedTime, getPlatform, isSupportedURL } from "@/utils";
import {
  createDynamicTheme,
  getOriginalPlatformUrl,
  getSemitonesFromRate,
  toMaxResCoverUrl,
} from "@/utils/player";
import { StreamState, streamWithProgress } from "@/utils/streamer";
import CustomizePlaybackModal from "./CustomizePlaybackModal";
import DownloadModal from "./DownloadModal";
import LyricsModal from "./LyricsModal";
import LyricsPanel from "./LyricsPanel";

type PlaybackMode = "slowed" | "normal" | "speedup" | "custom";

const PLAYBACK_MODE_LABELS: Record<PlaybackMode, string> = {
  slowed: "Slowed",
  normal: "Normal",
  speedup: "Speed Up",
  custom: "Custom",
};

const PLAYBACK_MODE_ICONS: Record<PlaybackMode, ReactNode> = {
  slowed: <IconChevronsLeft size={24} />,
  normal: <IconPlayerPlay size={24} />,
  speedup: <IconChevronsRight size={24} />,
  custom: <IconAdjustments size={24} />,
};

export function Player({
  url,
  duration: propDuration,
  metadataLoadError: propMetadataLoadError,
  media: propMedia,
  repeating,
}: {
  url?: string;
  duration?: number;
  metadataLoadError?: string;
  media?: Media;
  repeating?: boolean;
}) {
  const theme = useMantineTheme();
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const { media: contextMedia, history, setHistory } = useAppContext();

  // Phase management: extracting while URL is being resolved, then playing
  const [extractedMedia, setExtractedMedia] = useState<Media | null>(null);
  const [streamState, setStreamState] = useState<StreamState>({ status: "idle" });
  const streamStarted = useRef(false);

  const media = propMedia || extractedMedia || (url ? null : contextMedia);
  const metadataLoadError = propMetadataLoadError;
  const isExtracting = !media && !!url;

  // Inlined extraction logic (was in InitialPlayer + useMediaStreamer)
  const startStream = useCallback(() => {
    if (!url || !isSupportedURL(url)) {
      notifications.show({ title: "Error", message: "Invalid URL provided." });
      return () => {};
    }
    setStreamState({ status: "idle" });
    const abortController = new AbortController();
    const updateStreamState = (next: StreamState) => {
      setStreamState((prev) => ({ ...prev, ...next }));
    };
    streamWithProgress(url, updateStreamState, abortController.signal)
      .then((streamedMedia: Media) => {
        setExtractedMedia(streamedMedia);
      })
      .catch((e) => {
        if (e.name === "AbortError") return;
        console.error("Stream error:", e);
        const message = e.message || "Could not process the media.";
        setStreamState({ status: "error", message });
        notifications.show({
          title: "Stream failed",
          message: `${message} Try configuring cookies from a logged-in account in the app settings if the problem persists.`,
          color: "red",
          autoClose: 10000,
        });
      });
    return () => abortController.abort();
  }, [url]);

  // Auto-start stream for URL mode
  useEffect(() => {
    if (media || metadataLoadError || streamStarted.current) return;
    if (!url) return;
    streamStarted.current = true;
    setTimeout(() => startStream(), 0);
  }, [url, metadataLoadError, media, startStream]);

  // Add to history when playback starts (media excluded intentionally — it changes reference on every render)
  useEffect(() => {
    if (!media) return;
    setHistory((prev) => {
      const filtered = prev.filter((item) => item.sourceUrl !== media.sourceUrl);
      const newItem: HistoryItem = { ...media, playedAt: Date.now() };
      return [newItem, ...filtered].slice(0, 50);
    });
  }, [media?.sourceUrl, setHistory]); // eslint-disable-line react-hooks/exhaustive-deps

  // Use sourceUrl from media state
  const sourceUrl = media?.sourceUrl ?? url ?? "";

  // Load saved state
  const savedState = useMemo(() => getVideoState(sourceUrl), [sourceUrl]);

  // State - derive mode from rate
  const initialRate = savedState?.rate ?? 1;
  const initialSemitones = savedState?.semitones ?? 0;
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>(
    getModeFromRate(initialRate, initialSemitones),
  );
  const initialStartAt = 0;
  const [stateLoaded, setStateLoaded] = useState(false);
  const [isRepeat, setIsRepeat] = useState(savedState?.isRepeat ?? repeating ?? false);

  // Per-mode state: remember rate+semitones for each mode independently
  const [slowedRate, setSlowedRate] = useState(0.8);
  const [normalRate, setNormalRate] = useState(1);
  const [speedupRate, setSpeedupRate] = useState(1.25);
  const [customRate, setCustomRate] = useState(initialRate);
  const [customSemitones, setCustomSemitones] = useState(initialSemitones);

  // Lite mode: native playback, default on mobile for reliable background playback
  const os = useOs();
  const isMobileOs = os === "ios" || os === "android";
  const [liteMode, setLiteMode] = useState(isMobileOs);
  const [pitchLockedToSpeed, setPitchLockedToSpeed] = useState(true);

  // Volume UI state (actual volume is managed by useStretchPlayer)
  const [isMuted, setIsMuted] = useState(false);
  const [isVolumeHovered, setIsVolumeHovered] = useState(false);
  const previousVolumeRef = useRef(savedState?.volume ?? 1);

  const [showLyrics, setShowLyrics] = useState(savedState?.showLyrics ?? false);
  const [lyricsSettings, setLyricsSettings] = useState<LyricsSettings | null>(
    savedState?.lyrics ?? null,
  );
  const [lyricsModalOpened, setLyricsModalOpened] = useState(false);

  const dominantColor = useDominantColor(media?.metadata.coverUrl);
  const barColor = useMemo(() => {
    if (dominantColor === "rgba(0,0,0,0)") return theme.colors.violet[5];
    return generateColors(dominantColor)[5];
  }, [dominantColor, theme.colors.violet]);

  // Inlined useToast
  const [toast, setToast] = useState<{
    message: React.ReactNode;
    visible: boolean;
    isCircular?: boolean;
  }>({
    message: null,
    visible: false,
  });
  const toastTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const showToast = useCallback((message: React.ReactNode, isCircular?: boolean) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, visible: true, isCircular });
    toastTimeoutRef.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 1200);
  }, []);

  // Initialize state loaded flag
  useEffect(() => {
    const id = requestAnimationFrame(() => setStateLoaded(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Unified player (audio + DSP processing)
  const {
    audioRef,
    state: stretchState,
    isPlaying,
    currentTime,
    buffered,
    duration,
    rate,
    semitones,
    reverbAmount,
    volume,
    // Controls
    play,
    pause,
    togglePlayback,
    setRate,
    setSemitones,
    setReverbAmount,
    setVolume,
    seek,
  } = useStretchPlayer({
    fileUrl: media?.fileUrl || "",
    liteMode,
    initialRate: initialRate,
    initialSemitones: savedState?.semitones ?? 0,
    initialReverbAmount: savedState?.reverbAmount ?? 0,
    initialVolume: savedState?.volume ?? 1,
    initialPosition: stateLoaded ? initialStartAt : 0,
    isRepeat,
    autoPlay: false,
  });

  // Try autoplay when media and audio are ready
  const autoPlayedRef = useRef(false);
  useEffect(() => {
    if (!media || stretchState !== "ready" || autoPlayedRef.current) return;
    autoPlayedRef.current = true;
    const id = setTimeout(async () => {
      try {
        await play();
      } catch {}
    }, 100);
    return () => clearTimeout(id);
  }, [media, stretchState, play]);

  const onLyricsDiscover = useCallback(
    (d: {
      id: number;
      trackName: string;
      artistName: string;
      albumName?: string;
      syncedLyrics: string;
    }) => {
      const newSettings: LyricsSettings = {
        id: d.id,
        syncedLyrics: d.syncedLyrics,
        trackName: d.trackName,
        artistName: d.artistName,
        albumName: d.albumName,
        offset: 0,
      };
      setLyricsSettings(newSettings);
      saveVideoState(sourceUrl, { lyrics: newSettings });
    },
    [sourceUrl],
  );

  const {
    lyrics,
    state: lyricsState,
    error: lyricsError,
    searchResults,
  } = useLyrics({
    trackName: media?.metadata.title || "",
    artistName: (media?.metadata.artist ?? media?.metadata.author) || "",
    durationSeconds: duration,
    enabled: duration > 0,
    selectedSyncedLyrics: lyricsSettings?.syncedLyrics,
    offsetSeconds: lyricsSettings?.offset ?? 0,
    onDiscover: onLyricsDiscover,
  });

  const hasLyrics = lyricsState === "ready" && lyrics.length > 0;

  const handleOffsetChange = useCallback(
    (offset: number) => {
      setLyricsSettings((prev) => (prev ? { ...prev, offset } : null));
      saveVideoState(sourceUrl, {
        lyrics: lyricsSettings ? { ...lyricsSettings, offset } : null,
      });
    },
    [sourceUrl, lyricsSettings],
  );

  const isLoading = stretchState === "loading";
  const isReady = stretchState === "ready";
  const isEnded =
    stretchState === "ready" &&
    currentTime >= duration - 0.05 &&
    duration > 0 &&
    !isPlaying &&
    !isRepeat;

  const handleLiteModeChange = useCallback((enabled: boolean) => {
    setLiteMode(enabled);
  }, []);

  const handleLockToggle = useCallback(
    (locked: boolean) => {
      setPitchLockedToSpeed(locked);
      if (locked) {
        setSemitones(getSemitonesFromRate(rate));
      }
    },
    [rate, setSemitones],
  );

  const handleReset = useCallback(() => {
    setRate(1);
    setSemitones(0);
    setReverbAmount(0);
    setVolume(1);
    setPitchLockedToSpeed(true);
    setPlaybackMode("normal");
    setSlowedRate(0.8);
    setNormalRate(1);
    setSpeedupRate(1.25);
    setCustomRate(1);
    setCustomSemitones(0);
  }, [setRate, setSemitones, setReverbAmount, setVolume]);

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

  // Inlined useMediaSession
  useEffect(() => {
    if (!media || !("mediaSession" in navigator)) return;

    let highResCover = media.metadata.coverUrl;
    const platform =
      media.sourceUrl?.includes("youtube") || media.sourceUrl?.includes("youtu.be")
        ? "youtube"
        : "";
    if (platform === "youtube") {
      highResCover = toMaxResCoverUrl(media.metadata.coverUrl);
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: media.metadata.title,
      artist: media.metadata.artist ?? media.metadata.author,
      album: media.metadata.album ?? "",
      artwork: [{ src: highResCover, sizes: "512x512", type: "image/jpeg" }],
    });

    navigator.mediaSession.setActionHandler("play", () => play());
    navigator.mediaSession.setActionHandler("pause", () => pause());
    navigator.mediaSession.setActionHandler("seekbackward", () => handleBackward());
    navigator.mediaSession.setActionHandler("seekforward", () => handleForward());
    navigator.mediaSession.setActionHandler("previoustrack", () => handleBackward());
    navigator.mediaSession.setActionHandler("nexttrack", () => handleForward());
    try {
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (details.seekTime !== undefined) seek(details.seekTime);
      });
    } catch {}

    return () => {
      for (const a of [
        "play",
        "pause",
        "seekbackward",
        "seekforward",
        "previoustrack",
        "nexttrack",
      ]) {
        navigator.mediaSession.setActionHandler(a as MediaSessionAction, null);
      }
      try {
        navigator.mediaSession.setActionHandler("seekto", null);
      } catch {}
    };
  }, [media, play, pause, handleBackward, handleForward, seek]);

  // Inlined useVideoStatePersistence
  const lastSaveRef = useRef<number>(0);
  useEffect(() => {
    if (!stateLoaded || !isReady) return;
    const now = Date.now();
    if (now - lastSaveRef.current < 5000) return;
    lastSaveRef.current = now;
    saveVideoState(sourceUrl, {
      rate,
      semitones,
      reverbAmount,
      isRepeat,
      volume,
      showLyrics,
    });
  }, [
    rate,
    semitones,
    reverbAmount,
    isRepeat,
    volume,
    sourceUrl,
    stateLoaded,
    isReady,
    showLyrics,
  ]);

  // Wake Lock API: keep screen on during playback
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  useEffect(() => {
    const acquireWakeLock = async () => {
      try {
        if (wakeLockRef.current) return;
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      } catch {}
    };
    const releaseWakeLock = async () => {
      try {
        await wakeLockRef.current?.release();
      } catch {}
      wakeLockRef.current = null;
    };

    if (isPlaying && stateLoaded) acquireWakeLock();
    else releaseWakeLock();

    return () => {
      releaseWakeLock();
    };
  }, [isPlaying, stateLoaded]);

  useEffect(() => {
    const saveState = () => {
      if (!stateLoaded) return;
      saveVideoState(sourceUrl, {
        rate,
        semitones,
        reverbAmount,
        isRepeat,
        volume,
        showLyrics,
      });
    };
    const handler = () => {
      if (document.hidden) saveState();
    };
    window.addEventListener("beforeunload", saveState);
    document.addEventListener("visibilitychange", handler);
    return () => {
      saveState();
      window.removeEventListener("beforeunload", saveState);
      document.removeEventListener("visibilitychange", handler);
    };
  }, [
    rate,
    semitones,
    reverbAmount,
    isRepeat,
    volume,
    sourceUrl,
    stateLoaded,
    showLyrics,
  ]);

  // Modal controls
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
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
      play(value); // Always resume after seeking, force start at seek time
    },
    [seek, play],
  );

  const handleTogglePlayer = useCallback(() => {
    if (isEnded) {
      seek(0);
      play();
      showToast(<IconPlayerPlayFilled size={40} />, true);
    } else {
      togglePlayback();
      if (isPlaying) {
        showToast(<IconPlayerPauseFilled size={40} />, true);
      } else {
        showToast(<IconPlayerPlayFilled size={40} />, true);
      }
    }
  }, [isEnded, isPlaying, togglePlayback, seek, play, showToast]);

  const handleRateChange = useCallback(
    (newRate: number) => {
      setRate(newRate);
      // Save rate per current mode
      const mode = getModeFromRate(newRate, semitones);
      if (mode === "slowed") setSlowedRate(newRate);
      else if (mode === "normal") setNormalRate(newRate);
      else if (mode === "speedup") setSpeedupRate(newRate);
      else setCustomRate(newRate);
      setPlaybackMode(mode);
    },
    [setRate, semitones],
  );

  const handleSemitonesChange = useCallback(
    (newSemitones: number) => {
      setSemitones(newSemitones);
      if (playbackMode === "custom") setCustomSemitones(newSemitones);
    },
    [setSemitones, playbackMode],
  );

  const handlePlaybackModeChange = useCallback(
    (mode: PlaybackMode) => {
      setPlaybackMode(mode);
      let newRate: number;
      let newSemitones: number;

      if (mode === "slowed") {
        newRate = slowedRate;
        newSemitones = getSemitonesFromRate(newRate);
      } else if (mode === "normal") {
        newRate = normalRate;
        newSemitones = 0;
      } else if (mode === "speedup") {
        newRate = speedupRate;
        newSemitones = getSemitonesFromRate(newRate);
      } else {
        newRate = customRate;
        newSemitones = customSemitones;
      }

      setRate(newRate);
      setSemitones(newSemitones);
      showToast(
        <Flex align="center" gap="xs">
          {PLAYBACK_MODE_ICONS[mode]}
          <Text weight={600}>
            {PLAYBACK_MODE_LABELS[mode]} ({newRate.toFixed(2)}x)
          </Text>
        </Flex>,
      );
    },
    [
      slowedRate,
      normalRate,
      speedupRate,
      customRate,
      customSemitones,
      setRate,
      setSemitones,
      showToast,
    ],
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

  const showRateToast = useCallback(
    (newRate: number, icon: React.ReactNode) => {
      showToast(
        <Flex align="center" gap="xs">
          {icon}
          <Text weight={600}>{newRate.toFixed(2)}x</Text>
        </Flex>,
      );
    },
    [showToast],
  );

  useHotkeys([
    ["ArrowLeft", handleBackward],
    ["ArrowRight", handleForward],
    ["Space", handleTogglePlayer],
    ["k", handleTogglePlayer],
    ["m", handleMuteToggle],
    [
      "shift+<",
      () => {
        const newRate = Math.max(0.5, rate - 0.05);
        handleRateChange(Math.round(newRate * 100) / 100);
        showRateToast(newRate, <IconPlayerTrackPrevFilled size={24} />);
      },
    ],
    [
      "shift+>",
      () => {
        const newRate = Math.min(1.5, rate + 0.05);
        handleRateChange(Math.round(newRate * 100) / 100);
        showRateToast(newRate, <IconPlayerTrackNextFilled size={24} />);
      },
    ],
  ]);

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

  // === Extraction / Error UI (shown before player mounts) ===
  if (isExtracting || streamState.status === "error" || metadataLoadError) {
    const isError = !!(streamState.status === "error" || metadataLoadError);
    const errorMsg = metadataLoadError || streamState.message || "";

    if (isError) {
      return (
        <Flex h="100dvh" direction="column" align="center" justify="center" gap="md">
          <Text fw={600} c="red" size="lg">
            Something went wrong
          </Text>
          <Text
            size="sm"
            c="dimmed"
            style={{ textAlign: "center", whiteSpace: "pre-wrap" }}
          >
            {errorMsg}
          </Text>
          <Flex gap="sm" mt="md">
            <Button variant="light" component={Link} href="/">
              Go home
            </Button>
            <Button
              onClick={() => {
                streamStarted.current = false;
                startStream();
              }}
            >
              Retry
            </Button>
          </Flex>
        </Flex>
      );
    }

    return (
      <Container size="xs">
        <Flex h="100dvh" direction="column" align="center" justify="center" gap="lg">
          <Progress value={100} animate striped w="100%" />
          <Text size="sm" c="dimmed">
            Getting the metadata...
          </Text>
        </Flex>
      </Container>
    );
  }

  if (!media) return null;

  const originalPlatformUrl = getOriginalPlatformUrl(media, currentTime);

  return (
    <MantineProvider theme={dynamicTheme} inherit>
      {/* Blurred cover background */}
      {media.metadata.coverUrl && (
        <Box
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 0,
            backgroundImage: `url(${toMaxResCoverUrl(media.metadata.coverUrl)})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(60px) saturate(1.5)",
            opacity: 0.4,
            transform: "scale(1.1)",
          }}
        />
      )}

      <CustomizePlaybackModal
        opened={modalOpened}
        onClose={closeModal}
        liteMode={liteMode}
        onLiteModeChange={handleLiteModeChange}
        pitchLockedToSpeed={pitchLockedToSpeed}
        onLockToggle={handleLockToggle}
        rate={rate}
        onSpeedChangeEnd={handleRateChange}
        semitones={semitones}
        onPitchChangeEnd={handleSemitonesChange}
        reverbAmount={reverbAmount}
        onReverbChange={setReverbAmount}
        onReset={handleReset}
      />

      <DownloadModal
        opened={downloadModalOpened}
        onClose={closeDownloadModal}
        media={media}
        currentPlaybackRate={rate}
        currentSemitones={semitones}
        currentReverbAmount={reverbAmount}
      />

      <LyricsModal
        opened={lyricsModalOpened}
        onClose={() => setLyricsModalOpened(false)}
        showLyrics={showLyrics}
        onToggleLyrics={setShowLyrics}
        trackDurationSeconds={duration}
        currentLyricsId={lyricsSettings?.id ?? null}
        currentLyricsTrackName={lyricsSettings?.trackName ?? null}
        currentLyricsArtistName={lyricsSettings?.artistName ?? null}
        currentLyricsAlbumName={lyricsSettings?.albumName ?? null}
        currentOffset={lyricsSettings?.offset ?? 0}
        onOffsetChange={handleOffsetChange}
        initialSearchQuery={
          stripVideoTitleFiller(media.metadata.title) || media.metadata.title
        }
        initialSearchResults={searchResults}
        onSelectLyrics={(record) => {
          const newSettings: LyricsSettings = {
            id: record.id,
            syncedLyrics: record.syncedLyrics,
            trackName: record.trackName,
            artistName: record.artistName,
            albumName: record.albumName,
            offset: 0,
          };
          setLyricsSettings(newSettings);
          saveVideoState(sourceUrl, { lyrics: newSettings });
          setLyricsModalOpened(false);
        }}
      />

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
              disabled={isLoading}
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

        {/* Main content: video + lyrics panel */}
        <Box
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        >
          {/* Main layout container */}
          <Flex
            align="center"
            justify="center"
            gap={isMobile ? 0 : 32}
            style={{
              height: "100%",
              width: "100%",
              maxWidth: "100%",
              padding: isMobile ? 0 : "0 24px",
              position: "relative",
            }}
          >
            {/* Video area with toast overlay */}
            <Box
              ref={playerAreaRef}
              data-tap-target
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                cursor: "pointer",
                userSelect: "none",
                WebkitUserSelect: "none",
                WebkitTouchCallout: "none",
              }}
            >
              {/* Toast overlay - centered on video */}
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

              {/* Album art + loading overlay + hidden audio element */}
              <Box
                style={{
                  position: "relative",
                  width: "auto",
                  height: "auto",
                  maxWidth: isMobile ? "calc(100vw - 32px)" : "50vw",
                  maxHeight: isMobile ? "70vh" : "90vh",
                  aspectRatio: "1/1",
                  margin: isMobile ? 16 : 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: isMobile && showLyrics ? 0 : 1,
                  pointerEvents: isMobile && showLyrics ? "none" : "auto",
                  transition: "opacity 0.3s ease-out",
                }}
              >
                <audio
                  ref={audioRef}
                  key={media.fileUrl}
                  style={{ display: "none" }}
                  preload="metadata"
                />
                {media.metadata.coverUrl ? (
                  <Image
                    src={toMaxResCoverUrl(media.metadata.coverUrl)}
                    width="100%"
                    height="100%"
                    radius={theme.radius.md}
                    fit="contain"
                    style={{
                      userSelect: "none",
                      pointerEvents: "none",
                      filter: stretchState === "loading" ? "blur(8px)" : "none",
                      transition: "filter 0.3s ease-out",
                    }}
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
                      filter: stretchState === "loading" ? "blur(8px)" : "none",
                      transition: "filter 0.3s ease-out",
                    }}
                  >
                    <IconMusic size={80} style={{ opacity: 0.5 }} />
                    <Text size="xl" weight={600} align="center">
                      {media.metadata.title}
                    </Text>
                    <Text size="md" color="dimmed" align="center">
                      {media.metadata.artist ?? media.metadata.author}
                      {media.metadata.album && ` · ${media.metadata.album}`}
                    </Text>
                  </Box>
                )}
                {/* Toast-style loading indicator */}
                {stretchState === "loading" && (
                  <Box
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      zIndex: 10,
                      pointerEvents: "none",
                    }}
                  >
                    <Loader size="lg" color="white" />
                  </Box>
                )}
              </Box>
            </Box>

            {/* Desktop: Lyrics panel - slides in/out as sibling */}
            {!isMobile && (
              <Box
                style={{
                  width: 400,
                  maxWidth: "35vw",
                  height: "80vh",
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  opacity: showLyrics ? 1 : 0,
                  transform: showLyrics ? "translateX(0)" : "translateX(40px)",
                  marginRight: showLyrics ? 0 : -432, // -(width + gap) to collapse
                  transition:
                    "opacity 0.3s ease-out, transform 0.35s cubic-bezier(0.32, 0.72, 0, 1), margin-right 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
                  pointerEvents: showLyrics ? "auto" : "none",
                  backgroundColor: "transparent",
                }}
              >
                <LyricsPanel
                  lyrics={lyrics}
                  state={lyricsState}
                  error={lyricsError}
                  currentTimeSeconds={currentTime}
                  onSeek={seek}
                  style={{ flex: 1, minHeight: 0 }}
                />
              </Box>
            )}
          </Flex>

          {/* Mobile: Lyrics overlay */}
          {isMobile && (
            <Transition
              mounted={showLyrics}
              transition="slide-left"
              duration={280}
              exitDuration={220}
              timingFunction="ease-out"
            >
              {(styles) => (
                <Box
                  style={{
                    ...styles,
                    position: "absolute",
                    inset: 0,
                    zIndex: 2,
                    background:
                      "linear-gradient(to bottom, transparent 0%, transparent 15%, rgba(0,0,0,0.75) 40%, rgba(0,0,0,0.75) 60%, transparent 85%, transparent 100%)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                  }}
                >
                  <LyricsPanel
                    lyrics={lyrics}
                    state={lyricsState}
                    error={lyricsError}
                    currentTimeSeconds={currentTime}
                    onSeek={seek}
                    style={{ flex: 1, minHeight: 0 }}
                    isMobile
                  />
                </Box>
              )}
            </Transition>
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
                userSelect: "none",
                WebkitUserSelect: "none",
              }}
            >
              {`${getFormattedTime(isSeeking ? seekPosition : currentTime)} / ${getFormattedTime(duration)}`}
            </Text>
            <Flex gap="xs">
              {showLyrics && hasLyrics && (
                <Button
                  variant="default"
                  leftIcon={<IconMicrophone2 size={18} />}
                  onClick={() => setLyricsModalOpened(true)}
                >
                  Lyrics
                </Button>
              )}
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
                      icon={<SiYoutube size={14} />}
                      component="a"
                      href={originalPlatformUrl}
                      rightSection={<IconExternalLink size={12} />}
                      target="_blank"
                    >
                      YouTube
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
                  <Menu.Divider />
                  <Menu.Label>Display</Menu.Label>
                  <Menu.Item
                    icon={
                      lyricsState === "loading" ? (
                        <Loader size={14} variant="oval" />
                      ) : (
                        <IconFileMusic size={14} />
                      )
                    }
                    onClick={() => setShowLyrics((prev) => !prev)}
                    disabled={lyricsState === "loading"}
                    rightSection={
                      <Text size="xs" color="dimmed">
                        {showLyrics ? "On" : "Off"}
                      </Text>
                    }
                  >
                    Lyrics
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Flex>
          </Flex>

          <Box style={{ paddingRight: 8, position: "relative" }}>
            {duration > 0 && buffered > 0 && (
              <Box
                style={{
                  position: "absolute",
                  top: 0,
                  left: 8,
                  right: 8,
                  height: 4,
                  pointerEvents: "none",
                  zIndex: 0,
                }}
              >
                <Box
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    height: "100%",
                    width: `${(buffered / duration) * 100}%`,
                    backgroundColor: barColor,
                    opacity: 0.25,
                    borderRadius: theme.radius.xs,
                    transition: "width 0.3s ease-out",
                  }}
                />
              </Box>
            )}
            <Slider
              disabled={isLoading}
              value={isSeeking ? seekPosition : currentTime}
              onChange={handleSliderChange}
              onChangeEnd={handleSeekChange}
              min={0}
              step={1}
              radius={0}
              mb={-3}
              showLabelOnHover={false}
              size="xs"
              sx={{
                position: "relative",
                zIndex: 1,
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
                  backgroundColor: "transparent",
                },
                bar: {
                  backgroundColor: barColor,
                },
              }}
              label={(v) => (currentTime >= duration - 5 ? null : getFormattedTime(v))}
              max={duration}
            />
          </Box>

          <Box style={{ backgroundColor: theme.colors.dark[6] }}>
            <Flex gap="sm" px="xs" py="xs" align="center">
              <Flex align="center" gap={4}>
                <ActionIcon
                  size="xl"
                  onClick={handleTogglePlayer}
                  title={isPlaying ? "Pause" : "Play"}
                  variant="transparent"
                  color="gray"
                  disabled={isLoading}
                >
                  {isPlaying ? (
                    <IconPlayerPauseFilled size={30} />
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
                    disabled={isLoading}
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
                      disabled={isLoading}
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
                      disabled={isLoading}
                      size="lg"
                      onClick={handleBackward}
                      title="Backward 5 sec"
                      variant="transparent"
                      color="gray"
                    >
                      <IconRewindBackward5 />
                    </ActionIcon>
                    <ActionIcon
                      disabled={isLoading}
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
                  disabled={isLoading}
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
                    style={{
                      userSelect: "none",
                      WebkitUserSelect: "none",
                      pointerEvents: "none",
                    }}
                  />
                </MediaQuery>
                <Box ml="sm">
                  <Flex align="center" gap={6}>
                    <Text size="sm" weight={600} lineClamp={1}>
                      {media.metadata.title}
                    </Text>
                  </Flex>
                  <Text size="xs" color="dimmed" lineClamp={1}>
                    {media.metadata.artist ?? media.metadata.author}
                    {media.metadata.album && ` · ${media.metadata.album}`}
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
