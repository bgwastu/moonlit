"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const AXIS_LOCK_PX = 10;
const COLLAPSE_THRESHOLD_PX = 120;
const COLLAPSE_VELOCITY = 0.65; // px/ms
const LYRICS_THRESHOLD = 0.28; // fraction of width
const LYRICS_VELOCITY = 0.55; // px/ms

export interface UsePlayerSheetGesturesOptions {
  enabled: boolean;
  lyricsOpen: boolean;
  canToggleLyrics: boolean;
  onCollapse: () => void;
  onOpenLyrics: () => void;
  onCloseLyrics: () => void;
}

export interface UsePlayerSheetGesturesResult {
  /** Vertical drag offset while pulling the sheet down (0 when idle). */
  dragY: number;
  /**
   * Lyrics panel closed-amount 0..1 while dragging (0 = fully open / on screen,
   * 1 = fully closed / off to the right). null when not dragging horizontally.
   */
  lyricsDrag: number | null;
  isDragging: boolean;
  /** Attach to the expandable player stage. */
  stageRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Mobile sheet gestures for the expanded player:
 * - Vertical drag down follows the finger; release past threshold collapses
 * - Horizontal drag follows the finger to reveal/dismiss the lyrics pane
 */
export function usePlayerSheetGestures({
  enabled,
  lyricsOpen,
  canToggleLyrics,
  onCollapse,
  onOpenLyrics,
  onCloseLyrics,
}: UsePlayerSheetGesturesOptions): UsePlayerSheetGesturesResult {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [dragY, setDragY] = useState(0);
  const [lyricsDrag, setLyricsDrag] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const startRef = useRef<{
    x: number;
    y: number;
    t: number;
    onLyricsScroll: boolean;
    width: number;
    open: boolean;
  } | null>(null);
  const axisRef = useRef<"none" | "vertical" | "horizontal">("none");
  const dragYRef = useRef(0);
  const lyricsDragRef = useRef(0);
  const lyricsOpenRef = useRef(lyricsOpen);
  const canToggleRef = useRef(canToggleLyrics);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    lyricsOpenRef.current = lyricsOpen;
    canToggleRef.current = canToggleLyrics;
    enabledRef.current = enabled;
  });

  const resetDrag = useCallback(() => {
    startRef.current = null;
    axisRef.current = "none";
    dragYRef.current = 0;
    lyricsDragRef.current = 0;
    setDragY(0);
    setLyricsDrag(null);
    setIsDragging(false);
  }, []);

  const isBlockedTarget = useCallback((target: EventTarget | null) => {
    if (!target || !(target instanceof Element)) return true;
    return (
      target.closest(
        "button, a, input, textarea, [role='button'], [role='slider'], [data-no-sheet-gesture]",
      ) !== null
    );
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!enabledRef.current) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (isBlockedTarget(e.target)) return;

      const target = e.target instanceof Element ? e.target : null;
      startRef.current = {
        x: e.clientX,
        y: e.clientY,
        t: e.timeStamp,
        onLyricsScroll: Boolean(target?.closest("[data-lyrics-scroll]")),
        width: el.clientWidth || window.innerWidth,
        open: lyricsOpenRef.current,
      };
      axisRef.current = "none";
      dragYRef.current = 0;
      lyricsDragRef.current = lyricsOpenRef.current ? 0 : 1;
    };

    const onPointerMove = (e: PointerEvent) => {
      const start = startRef.current;
      if (!start || !enabledRef.current) return;

      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;

      if (axisRef.current === "none") {
        if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
        axisRef.current = Math.abs(dy) >= Math.abs(dx) ? "vertical" : "horizontal";

        if (axisRef.current === "vertical" && start.onLyricsScroll) {
          resetDrag();
          return;
        }

        if (axisRef.current === "horizontal" && !canToggleRef.current) {
          resetDrag();
          return;
        }

        setIsDragging(true);
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }

      if (axisRef.current === "vertical") {
        const next = Math.max(0, dy);
        dragYRef.current = next;
        setDragY(next);
        e.preventDefault();
        return;
      }

      if (axisRef.current === "horizontal") {
        const w = Math.max(1, start.width);
        // 0 = open (on screen), 1 = closed (off to the right)
        const next = start.open
          ? Math.max(0, Math.min(1, dx / w))
          : Math.max(0, Math.min(1, 1 + dx / w));
        lyricsDragRef.current = next;
        setLyricsDrag(next);
        e.preventDefault();
      }
    };

    const finish = (e: PointerEvent) => {
      const start = startRef.current;
      if (!start) return;

      const dx = e.clientX - start.x;
      const dt = Math.max(1, e.timeStamp - start.t);
      const axis = axisRef.current;
      const y = dragYRef.current;
      const closedAmt = lyricsDragRef.current;

      try {
        if (el.hasPointerCapture?.(e.pointerId)) {
          el.releasePointerCapture(e.pointerId);
        }
      } catch {
        // ignore
      }

      if (axis === "vertical") {
        const velocity = y / dt;
        const shouldCollapse =
          y >= COLLAPSE_THRESHOLD_PX || velocity >= COLLAPSE_VELOCITY;
        resetDrag();
        if (shouldCollapse) onCollapse();
        return;
      }

      if (axis === "horizontal" && canToggleRef.current) {
        const velocityX = dx / dt;
        let shouldOpen = start.open;
        if (start.open) {
          // Closing: enough closed amount or fast swipe right
          shouldOpen = !(closedAmt >= LYRICS_THRESHOLD || velocityX >= LYRICS_VELOCITY);
        } else {
          // Opening: enough open amount or fast swipe left
          shouldOpen = closedAmt <= 1 - LYRICS_THRESHOLD || velocityX <= -LYRICS_VELOCITY;
        }
        resetDrag();
        if (shouldOpen) onOpenLyrics();
        else onCloseLyrics();
        return;
      }

      resetDrag();
    };

    const onPointerUp = (e: PointerEvent) => finish(e);
    const onPointerCancel = () => resetDrag();

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerCancel);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [isBlockedTarget, onCollapse, onOpenLyrics, onCloseLyrics, resetDrag]);

  return { dragY, lyricsDrag, isDragging, stageRef };
}
