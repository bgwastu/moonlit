"use client";

import { createContext, useContext, useEffect, useReducer, useRef } from "react";
import { COOKIES_CHANGED_EVENT, cookieRequestHeaders } from "@/lib/cookies";
import {
  YOUTUBE_STATUS_CHANGED_EVENT,
  type YouTubeAvailability,
  type YouTubeStatus,
  initialYouTubeAvailability,
  unknownYouTubeStatus,
  youtubeAvailabilityReducer,
} from "@/lib/youtubeStatus";

interface YouTubeStatusContextValue extends YouTubeAvailability {
  refresh: () => void;
  dismissModal: () => void;
}
const YouTubeStatusContext = createContext<YouTubeStatusContextValue | null>(null);

export function YouTubeStatusProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(
    youtubeAvailabilityReducer,
    initialYouTubeAvailability,
  );
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    let stopped = false;
    let controller: AbortController;
    let pollTimer: ReturnType<typeof setTimeout>;
    let expiryTimer: ReturnType<typeof setTimeout>;
    let lastAt = 0;
    let failures = 0;
    let retryAfter = 0;
    let reachable = false;
    let lastStatus: YouTubeStatus = unknownYouTubeStatus();

    const schedule = () => {
      clearTimeout(pollTimer);
      if (!stopped)
        pollTimer = setTimeout(
          () => void refresh(),
          Math.max(
            lastStatus.state === "healthy" ? 30000 : 10000,
            retryAfter - Date.now(),
          ),
        );
    };
    const refresh = async (force = false) => {
      if (stopped) return;
      if (!navigator.onLine && !reachable && !force) {
        dispatch({ type: "connection", online: false });
        schedule();
        return;
      }
      if (Date.now() < retryAfter) {
        schedule();
        return;
      }
      if (
        !force &&
        (document.visibilityState === "hidden" || Date.now() - lastAt < 5000)
      ) {
        schedule();
        return;
      }
      lastAt = Date.now();
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      dispatch({ type: "checking" });
      try {
        const response = await fetch("/api/youtube/status", {
          headers: cookieRequestHeaders(),
          cache: "no-store",
          signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
        });
        // Rate limiting a status check is not evidence of a YouTube outage.
        if (response.status === 429) {
          if (stopped || signal.aborted) return;
          failures = 0;
          lastStatus = unknownYouTubeStatus();
          retryAfter =
            Date.now() +
            Math.max(1, Number(response.headers.get("Retry-After")) || 30) * 1000;
          dispatch({ type: "unreachable", confirmed: false });
          return;
        }
        if (!response.ok) throw new Error("Status unavailable");
        const next = (await response.json()) as YouTubeStatus;
        if (!["healthy", "degraded", "offline", "unknown"].includes(next.state))
          throw new Error("Invalid status");
        if (stopped || signal.aborted) return;
        failures = 0;
        reachable = true;
        if (!navigator.onLine) dispatch({ type: "connection", online: true });
        lastStatus = next;
        dispatch({ type: "status", status: next, now: Date.now() });
        clearTimeout(expiryTimer);
        expiryTimer = setTimeout(
          () => {
            lastStatus = unknownYouTubeStatus();
            dispatch({ type: "expired" });
            void refresh();
          },
          Math.max(5000, next.expiresAt - Date.now()),
        );
      } catch {
        if (stopped || signal.aborted) return;
        lastStatus = unknownYouTubeStatus();
        dispatch({ type: "unreachable", confirmed: ++failures >= 2 });
      } finally {
        if (!stopped && !signal.aborted) schedule();
      }
    };
    const changed = () => void refresh(true);
    const visible = () => void refresh();
    const connected = () => {
      dispatch({ type: "connection", online: true });
      void refresh(true);
    };
    const disconnected = () => {
      reachable = false;
      controller?.abort();
      clearTimeout(expiryTimer);
      dispatch({ type: "connection", online: false });
      schedule();
    };
    refreshRef.current = changed;
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener(COOKIES_CHANGED_EVENT, changed);
    window.addEventListener(YOUTUBE_STATUS_CHANGED_EVENT, changed);
    dispatch({ type: "connection", online: navigator.onLine });
    void refresh(true);
    return () => {
      stopped = true;
      controller?.abort();
      clearTimeout(pollTimer);
      clearTimeout(expiryTimer);
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", disconnected);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener(COOKIES_CHANGED_EVENT, changed);
      window.removeEventListener(YOUTUBE_STATUS_CHANGED_EVENT, changed);
      refreshRef.current = () => {};
    };
  }, []);

  return (
    <YouTubeStatusContext.Provider
      value={{
        ...state,
        refresh: () => refreshRef.current(),
        dismissModal: () => dispatch({ type: "dismiss" }),
      }}
    >
      {children}
    </YouTubeStatusContext.Provider>
  );
}

export function useYouTubeStatus(): YouTubeStatusContextValue {
  const context = useContext(YouTubeStatusContext);
  if (!context) throw new Error("YouTubeStatusProvider is missing.");
  return context;
}
