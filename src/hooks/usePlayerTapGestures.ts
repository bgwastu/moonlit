import { useCallback, useEffect, useRef } from "react";

const DOUBLE_TAP_MS = 400;
const EDGE_FRACTION = 0.2;
const CLICK_IGNORE_AFTER_TOUCH_MS = 500;

interface UsePlayerTapGesturesOptions {
  onBackward: () => void;
  onForward: () => void;
  onTogglePlayback: () => void;
  enabled?: boolean;
  edgeFraction?: number;
}

/**
 * Listens for tap gestures on the player area:
 * - Single tap (or click on desktop) → onTogglePlayback
 * - Double-tap on left edge → onBackward
 * - Double-tap on right edge → onForward
 * Use for the main video/player container so play/pause and seek gestures are in one place.
 */
export function usePlayerTapGestures(
  containerRef: React.RefObject<HTMLElement | null>,
  {
    onBackward,
    onForward,
    onTogglePlayback,
    enabled = true,
    edgeFraction = EDGE_FRACTION,
  }: UsePlayerTapGesturesOptions,
): void {
  const lastTapRef = useRef<{ time: number; side: "left" | "right" | "center" } | null>(
    null,
  );
  const playPauseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchedRecentlyRef = useRef(false);

  const clearPlayPauseTimeout = useCallback(() => {
    if (playPauseTimeoutRef.current !== null) {
      clearTimeout(playPauseTimeoutRef.current);
      playPauseTimeoutRef.current = null;
    }
  }, []);

  const getSide = useCallback(
    (clientX: number): "left" | "right" | "center" => {
      const el = containerRef.current;
      if (!el) return "center";
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left;
      const width = rect.width;
      const leftEdge = width * edgeFraction;
      const rightEdge = width * (1 - edgeFraction);
      if (x <= leftEdge) return "left";
      if (x >= rightEdge) return "right";
      return "center";
    },
    [containerRef, edgeFraction],
  );

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (!enabled || !containerRef.current) return;
      const touch = e.changedTouches?.[0];
      if (!touch) return;

      touchedRecentlyRef.current = true;
      setTimeout(() => {
        touchedRecentlyRef.current = false;
      }, CLICK_IGNORE_AFTER_TOUCH_MS);

      const side = getSide(touch.clientX);
      const now = Date.now();
      const prev = lastTapRef.current;

      if (prev && prev.side === side && now - prev.time <= DOUBLE_TAP_MS) {
        clearPlayPauseTimeout();
        lastTapRef.current = null;
        if (side === "left") onBackward();
        else if (side === "right") onForward();
        else onTogglePlayback();
        return;
      }

      clearPlayPauseTimeout();
      lastTapRef.current = { time: now, side };
      playPauseTimeoutRef.current = setTimeout(() => {
        playPauseTimeoutRef.current = null;
        lastTapRef.current = null;
        onTogglePlayback();
      }, DOUBLE_TAP_MS);
    },
    [
      enabled,
      containerRef,
      getSide,
      clearPlayPauseTimeout,
      onBackward,
      onForward,
      onTogglePlayback,
    ],
  );

  const handleClick = useCallback(
    (e: MouseEvent) => {
      if (!enabled || !containerRef.current) return;
      if (touchedRecentlyRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      onTogglePlayback();
    },
    [enabled, containerRef, onTogglePlayback],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;
    el.addEventListener("touchend", handleTouchEnd, { passive: true });
    el.addEventListener("click", handleClick, { capture: true });
    return () => {
      el.removeEventListener("touchend", handleTouchEnd);
      el.removeEventListener("click", handleClick, { capture: true });
      clearPlayPauseTimeout();
    };
  }, [containerRef, enabled, handleTouchEnd, handleClick, clearPlayPauseTimeout]);
}
