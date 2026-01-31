import { useCallback, useEffect, useRef } from "react";

const DOUBLE_TAP_MS = 300;
const EDGE_FRACTION = 0.25; // 25% on each side for seek zones

interface UsePlayerTapGesturesOptions {
  onBackward: () => void;
  onForward: () => void;
  onTogglePlayback: () => void;
  enabled?: boolean;
  edgeFraction?: number;
}

type TapZone = "left" | "right" | "center";

/**
 * Listens for tap gestures on the player area:
 *
 * Desktop:
 * - Single click anywhere → onTogglePlayback
 *
 * Mobile:
 * - Single tap in CENTER zone → onTogglePlayback (immediate)
 * - Double-tap on LEFT edge → onBackward (seek backward)
 * - Double-tap on RIGHT edge → onForward (seek forward)
 *
 * The hook only listens to events on the containerRef element itself,
 * not on its children. This allows lyrics and other interactive elements
 * to remain clickable.
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
  const lastEdgeTapRef = useRef<{ time: number; zone: TapZone } | null>(null);
  const touchedRecentlyRef = useRef(false);

  const getZone = useCallback(
    (clientX: number): TapZone => {
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

  // Check if the event target is the container itself or a direct child (video wrapper)
  const isValidTarget = useCallback(
    (target: EventTarget | null): boolean => {
      const el = containerRef.current;
      if (!el || !target) return false;
      const targetEl = target as HTMLElement;

      // Accept if target is the container itself
      if (targetEl === el) return true;

      // Accept if target is a child within the video area (not lyrics panel)
      // Check if the target has data-tap-target attribute or is a video/canvas element
      if (
        targetEl.tagName === "VIDEO" ||
        targetEl.tagName === "CANVAS" ||
        targetEl.closest("[data-tap-target]")
      ) {
        return true;
      }

      // Check if the target is inside the container but not in a lyrics panel or interactive element
      if (el.contains(targetEl)) {
        // Reject if it's inside an element with onClick or is inherently interactive
        const isInteractive =
          targetEl.closest("button, a, [role='button'], [data-no-tap]") !== null;
        if (isInteractive) return false;

        // Accept if it's a direct descendant up to 3 levels deep (video container area)
        let parent = targetEl.parentElement;
        let depth = 0;
        while (parent && depth < 5) {
          if (parent === el) return true;
          parent = parent.parentElement;
          depth++;
        }
      }

      return false;
    },
    [containerRef],
  );

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (!enabled || !containerRef.current) return;
      if (!isValidTarget(e.target)) return;

      const touch = e.changedTouches?.[0];
      if (!touch) return;

      // Mark that we just handled a touch (to ignore synthetic click)
      touchedRecentlyRef.current = true;
      setTimeout(() => {
        touchedRecentlyRef.current = false;
      }, 400);

      const zone = getZone(touch.clientX);
      const now = Date.now();

      // CENTER zone: single tap → toggle playback immediately
      if (zone === "center") {
        lastEdgeTapRef.current = null;
        onTogglePlayback();
        return;
      }

      // EDGE zones: double-tap to seek
      const prev = lastEdgeTapRef.current;
      if (prev && prev.zone === zone && now - prev.time <= DOUBLE_TAP_MS) {
        // Double tap on same edge
        lastEdgeTapRef.current = null;
        if (zone === "left") onBackward();
        else if (zone === "right") onForward();
        return;
      }

      // First tap on edge - record it and wait for potential second tap
      lastEdgeTapRef.current = { time: now, zone };

      // Clear the edge tap after the double-tap window expires
      setTimeout(() => {
        if (
          lastEdgeTapRef.current &&
          lastEdgeTapRef.current.time === now &&
          lastEdgeTapRef.current.zone === zone
        ) {
          lastEdgeTapRef.current = null;
        }
      }, DOUBLE_TAP_MS + 50);
    },
    [
      enabled,
      containerRef,
      isValidTarget,
      getZone,
      onBackward,
      onForward,
      onTogglePlayback,
    ],
  );

  const handleClick = useCallback(
    (e: MouseEvent) => {
      if (!enabled || !containerRef.current) return;
      // Ignore if this click follows a touch event (avoid double-firing)
      if (touchedRecentlyRef.current) return;
      if (!isValidTarget(e.target)) return;

      // Desktop: single click toggles playback
      onTogglePlayback();
    },
    [enabled, containerRef, isValidTarget, onTogglePlayback],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;

    el.addEventListener("touchend", handleTouchEnd, { passive: true });
    el.addEventListener("click", handleClick);

    return () => {
      el.removeEventListener("touchend", handleTouchEnd);
      el.removeEventListener("click", handleClick);
    };
  }, [containerRef, enabled, handleTouchEnd, handleClick]);
}
