"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { MantineThemeOverride } from "@mantine/core";
import { HistoryItem, Media } from "@/interfaces";
import { MAX_HISTORY_ITEMS } from "@/lib/constants";
import {
  clearHistoryStorage,
  loadHistoryFromStorage,
  saveHistoryToStorage,
} from "@/lib/historyStorage";
import { clearLastSession, loadLastSession, saveLastSession } from "@/lib/lastSession";
import { resolvePlayableMedia } from "@/lib/playFromCache";
import { playerPathForMedia, softReplaceUrl } from "@/lib/playerNavigation";
import { isKnownMetaValue, mergeTrackMetadata, stashSearchMeta } from "@/lib/searchMeta";
import { appTheme } from "@/lib/theme";
import { clearMediaCache } from "@/utils/cache";

/** Captured once on the client before PlayerRouteBridge can replace to `/`. */
let capturedEntryPath: string | null = null;

function getAppEntryPath(): string {
  if (typeof window === "undefined") return "";
  if (capturedEntryPath === null) {
    capturedEntryPath = window.location.pathname;
  }
  return capturedEntryPath;
}

export type PlayerMode = "hidden" | "expanded" | "mini";

export interface OpenPlayerOptions {
  url?: string | null;
  media?: Media | null;
  /** Defaults to true — new tracks auto-expand. */
  expand?: boolean;
  /** Soft-replace the URL to the player/watch path (default true when expanding). */
  syncUrl?: boolean;
  /** Defaults to true — session restore sets false so the mini bar stays paused. */
  autoPlay?: boolean;
  /** Resume playback head (seconds). Used by session restore. */
  resumePosition?: number;
  /** When false, do not resume history writes (session restore). Default true. */
  recordHistory?: boolean;
}

interface AppContextValue {
  // Media state
  media: Media | null;
  setMedia: React.Dispatch<React.SetStateAction<Media | null>>;

  // Persistent player shell
  playerMode: PlayerMode;
  playerUrl: string | null;
  /** Whether the current open should auto-start playback when ready. */
  playerAutoPlay: boolean;
  /** Seconds to seek to when the current open becomes ready (session restore). */
  playerResumeAt: number;
  openPlayer: (options?: OpenPlayerOptions) => void;
  collapsePlayer: () => void;
  expandPlayer: () => void;
  closePlayer: () => void;

  // History state (persisted to localStorage)
  history: HistoryItem[];
  setHistory: React.Dispatch<React.SetStateAction<HistoryItem[]>>;
  clearHistory: () => Promise<void>;
  isHistoryWriteAllowed: () => boolean;

  // Theme state
  theme: MantineThemeOverride;
  setTheme: (theme: MantineThemeOverride) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  // Capture deep-link path before PlayerRouteBridge can replace to `/`.
  getAppEntryPath();

  const [media, setMediaState] = useState<Media | null>(null);
  const [playerMode, setPlayerMode] = useState<PlayerMode>("hidden");
  const [playerUrl, setPlayerUrl] = useState<string | null>(null);
  const [playerAutoPlay, setPlayerAutoPlay] = useState(false);
  const [playerResumeAt, setPlayerResumeAt] = useState(0);
  const [history, setHistoryState] = useState<HistoryItem[]>([]);
  const [theme, setTheme] = useState<MantineThemeOverride>(appTheme);
  const [isHydrated, setIsHydrated] = useState(false);
  const mediaRef = useRef(media);
  const playerUrlRef = useRef(playerUrl);
  const restoredRef = useRef(false);
  const skipHistoryWritesRef = useRef(false);
  /** Bumped by user opens so an in-flight session restore cannot overwrite them. */
  const sessionRestoreGenRef = useRef(0);
  const openingFromSessionRestoreRef = useRef(false);

  useEffect(() => {
    mediaRef.current = media;
    playerUrlRef.current = playerUrl;
  }, [media, playerUrl]);

  // Load history from localStorage on mount
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setHistoryState(loadHistoryFromStorage());
      setIsHydrated(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // Save history to localStorage when it changes
  useEffect(() => {
    if (!isHydrated) return;
    saveHistoryToStorage(history);
  }, [history, isHydrated]);

  const setHistory: React.Dispatch<React.SetStateAction<HistoryItem[]>> = useCallback(
    (action) => {
      setHistoryState((prev) => {
        const newHistory = typeof action === "function" ? action(prev) : action;
        return newHistory.slice(0, MAX_HISTORY_ITEMS);
      });
    },
    [],
  );

  const clearHistory = useCallback(async () => {
    skipHistoryWritesRef.current = true;
    setHistoryState([]);
    clearHistoryStorage();
    clearLastSession();
    await clearMediaCache();
  }, []);

  const isHistoryWriteAllowed = useCallback(() => !skipHistoryWritesRef.current, []);

  const setMedia: React.Dispatch<React.SetStateAction<Media | null>> = useCallback(
    (action) => {
      setMediaState(action);
    },
    [],
  );

  const openPlayer = useCallback((options: OpenPlayerOptions = {}) => {
    if (!openingFromSessionRestoreRef.current) {
      sessionRestoreGenRef.current += 1;
    }
    openingFromSessionRestoreRef.current = false;

    if (options.recordHistory === false) {
      skipHistoryWritesRef.current = true;
    } else {
      skipHistoryWritesRef.current = false;
    }
    const expand = options.expand !== false;
    setPlayerAutoPlay(options.autoPlay !== false);
    setPlayerResumeAt(
      typeof options.resumePosition === "number" &&
        Number.isFinite(options.resumePosition)
        ? Math.max(0, options.resumePosition)
        : 0,
    );
    if (options.media !== undefined) {
      setMediaState(options.media);
    }
    if (options.url !== undefined) {
      setPlayerUrl(options.url);
      if (options.url && options.media === undefined) {
        setMediaState(null);
      }
    } else if (options.media) {
      setPlayerUrl(null);
    }

    setPlayerMode(expand ? "expanded" : "mini");

    const syncUrl = options.syncUrl ?? expand;
    if (syncUrl) {
      if (expand) {
        softReplaceUrl(playerPathForMedia(options.url ?? null, options.media ?? null));
      } else {
        softReplaceUrl("/");
      }
    }
  }, []);

  const collapsePlayer = useCallback(() => {
    setPlayerMode((prev) => (prev === "hidden" ? prev : "mini"));
    softReplaceUrl("/");
  }, []);

  const expandPlayer = useCallback(() => {
    // Session restore opens mini + paused (autoPlay false). Expanding is an
    // intentional listen action — start playback once the player is ready.
    setPlayerAutoPlay(true);
    setPlayerMode((prev) => (prev === "hidden" ? prev : "expanded"));
    softReplaceUrl(playerPathForMedia(playerUrlRef.current, mediaRef.current));
  }, []);

  const closePlayer = useCallback(() => {
    sessionRestoreGenRef.current += 1;
    setPlayerMode("hidden");
    setPlayerUrl(null);
    setPlayerAutoPlay(false);
    setPlayerResumeAt(0);
    setMediaState(null);
    clearLastSession();
    softReplaceUrl("/");
  }, []);

  // Restore last session (≤3 days) once after hydration — always mini + paused.
  // Skip when the app was entered via a player deep link (/watch, /player, /shorts).
  useEffect(() => {
    if (!isHydrated || restoredRef.current) return;
    restoredRef.current = true;

    const entry = getAppEntryPath();
    const isDeepLinkEntry =
      entry === "/watch" || entry === "/player" || entry.startsWith("/shorts");
    if (isDeepLinkEntry) return;
    // Belt-and-suspenders: bridge may have already opened a track.
    if (playerUrlRef.current || mediaRef.current) return;

    const session = loadLastSession();
    if (!session) return;

    const historyMatch = history.find((item) => item.sourceUrl === session.sourceUrl);
    const seedMeta = mergeTrackMetadata(session.metadata, historyMatch?.metadata);
    if (seedMeta.id) {
      stashSearchMeta(String(seedMeta.id), seedMeta);
    }

    const restoreGen = ++sessionRestoreGenRef.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        const cached = await resolvePlayableMedia({
          sourceUrl: session.sourceUrl,
          metadata: seedMeta,
        });
        if (restoreGen !== sessionRestoreGenRef.current) return;
        if (playerUrlRef.current || mediaRef.current) return;

        openingFromSessionRestoreRef.current = true;
        if (cached) {
          openPlayer({
            url: session.sourceUrl,
            media: {
              ...cached,
              metadata: mergeTrackMetadata(cached.metadata, seedMeta),
            },
            expand: false,
            autoPlay: false,
            syncUrl: true,
            resumePosition: session.positionSeconds ?? 0,
            recordHistory: false,
          });
          return;
        }

        // Keep metadata shell while re-extracting so titles survive long idle restores.
        openPlayer({
          url: session.sourceUrl,
          media: {
            fileUrl: "",
            sourceUrl: session.sourceUrl,
            metadata: seedMeta,
          },
          expand: false,
          autoPlay: false,
          syncUrl: true,
          resumePosition: session.positionSeconds ?? 0,
          recordHistory: false,
        });
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isHydrated, openPlayer, history]);

  // Persist last session while a remote track is active
  useEffect(() => {
    if (!isHydrated) return;
    if (skipHistoryWritesRef.current) return;
    if (playerMode === "hidden") return;
    const sourceUrl = playerUrl || media?.sourceUrl;
    if (!sourceUrl) return;
    if (sourceUrl.startsWith("local:")) return;

    const existing = loadLastSession();
    const mergedMeta = mergeTrackMetadata(
      media?.metadata,
      existing?.sourceUrl === sourceUrl ? existing.metadata : undefined,
    );
    // Never persist placeholder titles — that is how "Unknown" sticks after idle restore.
    if (!isKnownMetaValue(mergedMeta.title)) return;

    saveLastSession({
      savedAt: Date.now(),
      sourceUrl,
      metadata: mergedMeta,
      mode: "mini",
      positionSeconds:
        existing?.sourceUrl === sourceUrl ? (existing.positionSeconds ?? 0) : 0,
    });
  }, [isHydrated, playerMode, playerUrl, media]);

  return (
    <AppContext.Provider
      value={{
        media,
        setMedia,
        playerMode,
        playerUrl,
        playerAutoPlay,
        playerResumeAt,
        openPlayer,
        collapsePlayer,
        expandPlayer,
        closePlayer,
        history,
        setHistory,
        clearHistory,
        isHistoryWriteAllowed,
        theme,
        setTheme,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within an AppProvider");
  }
  return context;
}
