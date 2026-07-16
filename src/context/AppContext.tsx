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
import { clearLastSession, loadLastSession, saveLastSession } from "@/lib/lastSession";
import { playerPathForMedia, softReplaceUrl } from "@/lib/playerNavigation";

const HISTORY_STORAGE_KEY = "moonlit-history";
const MAX_HISTORY_ITEMS = 50;

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
}

interface AppContextValue {
  // Media state
  media: Media | null;
  setMedia: (media: Media | null) => void;

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
  clearHistory: () => void;

  // Theme state
  theme: MantineThemeOverride;
  setTheme: (theme: MantineThemeOverride) => void;
}

const defaultTheme: MantineThemeOverride = {
  colorScheme: "dark",
  primaryColor: "violet",
  primaryShade: 5,
  white: "#f3f0ff",
  // https://v6.mantine.dev/theming/theme-object/#focusring
  focusRing: "never",
  // https://v6.mantine.dev/styles/global-styles/
  globalStyles: () => ({
    // Non-text chrome: no accidental selection while tapping/dragging
    "img, svg, video, canvas, button, [role='button'], [role='menuitem'], [role='option'], [role='tab'], [role='slider'], [role='switch'], input[type='range'], input[type='checkbox'], input[type='radio']":
      {
        WebkitUserSelect: "none",
        userSelect: "none",
        WebkitTouchCallout: "none",
      },
    "button *, [role='button'] *, [role='menuitem'] *, [role='tab'] *": {
      WebkitUserSelect: "none",
      userSelect: "none",
    },
  }),
};

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
  const [theme, setTheme] = useState<MantineThemeOverride>(defaultTheme);
  const [isHydrated, setIsHydrated] = useState(false);
  const mediaRef = useRef(media);
  const playerUrlRef = useRef(playerUrl);
  const restoredRef = useRef(false);

  useEffect(() => {
    mediaRef.current = media;
    playerUrlRef.current = playerUrl;
  }, [media, playerUrl]);

  // Load history from localStorage on mount
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as HistoryItem[];
          // Drop local uploads — they were never meant to persist
          setHistoryState(
            Array.isArray(parsed)
              ? parsed.filter((item) => !item?.sourceUrl?.startsWith("local:"))
              : [],
          );
        }
      } catch (e) {
        console.error("Failed to load history:", e);
      }
      setIsHydrated(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // Save history to localStorage when it changes
  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch (e) {
      console.error("Failed to save history:", e);
    }
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

  const clearHistory = useCallback(() => {
    setHistoryState([]);
  }, []);

  const setMedia = useCallback((next: Media | null) => {
    setMediaState(next);
  }, []);

  const openPlayer = useCallback((options: OpenPlayerOptions = {}) => {
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
    try {
      if (session.metadata?.id) {
        sessionStorage.setItem(
          `moonlit-search-meta:${session.metadata.id}`,
          JSON.stringify({
            title: session.metadata.title,
            author: session.metadata.author,
            artist: session.metadata.artist,
            album: session.metadata.album,
            coverUrl: session.metadata.coverUrl,
          }),
        );
      }
    } catch {
      // ignore
    }
    const timer = window.setTimeout(() => {
      openPlayer({
        url: session.sourceUrl,
        expand: false,
        autoPlay: false,
        syncUrl: true,
        resumePosition: session.positionSeconds ?? 0,
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isHydrated, openPlayer]);

  // Persist last session while a remote track is active
  useEffect(() => {
    if (!isHydrated) return;
    if (playerMode === "hidden") return;
    const sourceUrl = playerUrl || media?.sourceUrl;
    if (!sourceUrl) return;
    if (sourceUrl.startsWith("local:")) return;
    const metadata = media?.metadata;
    if (!metadata?.title) return;
    const existing = loadLastSession();
    saveLastSession({
      savedAt: Date.now(),
      sourceUrl,
      metadata: { ...metadata },
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
