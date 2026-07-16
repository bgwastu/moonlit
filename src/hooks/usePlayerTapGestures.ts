"use client";

import { useCallback, useEffect, useRef } from "react";

const DOUBLE_TAP_MS = 300;
const EDGE_FRACTION = 0.25; // 25% on each side for seek zones
const TAP_SLOP_PX = 12;

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
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchMovedRef = useRef(false);

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

  const isValidTarget = useCallback(
    (target: EventTarget | null): boolean => {
      const el = containerRef.current;
      if (!el || !target) return false;
      const targetEl = target as HTMLElement;

      if (targetEl === el) return true;

      if (
        targetEl.tagName === "VIDEO" ||
        targetEl.tagName === "CANVAS" ||
        targetEl.closest("[data-tap-target]")
      ) {
        return true;
      }

      if (el.contains(targetEl)) {
        const isInteractive =
          targetEl.closest("button, a, [role='button'], [data-no-tap]") !== null;
        if (isInteractive) return false;

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

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches?.[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    touchMovedRef.current = false;
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    const start = touchStartRef.current;
    const touch = e.touches?.[0];
    if (!start || !touch) return;
    if (
      Math.abs(touch.clientX - start.x) > TAP_SLOP_PX ||
      Math.abs(touch.clientY - start.y) > TAP_SLOP_PX
    ) {
      touchMovedRef.current = true;
    }
  }, []);

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (!enabled || !containerRef.current) return;
      if (!isValidTarget(e.target)) return;

      // Swipes are handled elsewhere — don't treat them as taps
      if (touchMovedRef.current) {
        touchStartRef.current = null;
        touchMovedRef.current = false;
        return;
      }

      const touch = e.changedTouches?.[0];
      if (!touch) return;

      touchedRecentlyRef.current = true;
      setTimeout(() => {
        touchedRecentlyRef.current = false;
      }, 400);

      const zone = getZone(touch.clientX);
      const now = Date.now();

      if (zone === "center") {
        lastEdgeTapRef.current = null;
        onTogglePlayback();
        return;
      }

      const prev = lastEdgeTapRef.current;
      if (prev && prev.zone === zone && now - prev.time <= DOUBLE_TAP_MS) {
        lastEdgeTapRef.current = null;
        if (zone === "left") onBackward();
        else if (zone === "right") onForward();
        return;
      }

      lastEdgeTapRef.current = { time: now, zone };

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
      if (touchedRecentlyRef.current) return;
      if (!isValidTarget(e.target)) return;
      onTogglePlayback();
    },
    [enabled, containerRef, isValidTarget, onTogglePlayback],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });
    el.addEventListener("click", handleClick);

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
      el.removeEventListener("click", handleClick);
    };
  }, [
    containerRef,
    enabled,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleClick,
  ]);
}
