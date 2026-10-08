"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, WheelEvent } from "react";
import { useReducedMotion } from "@mantine/hooks";

interface LyricsFollowOptions {
  activeIndex: number;
  lyricsKey: string;
  visible: boolean;
}

/** Native browsing, with an interruptible, damped scroll while following playback. */
export function useLyricsFollow({
  activeIndex,
  lyricsKey,
  visible,
}: LyricsFollowOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeRef = useRef(activeIndex);
  const visibleRef = useRef(visible);
  const pausedRef = useRef(false);
  const reducedMotion = useReducedMotion();
  const reducedMotionRef = useRef(reducedMotion);
  const frameRef = useRef(0);
  const targetRef = useRef(0);
  const velocityRef = useRef(0);
  const lastAppliedRef = useRef(0);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const [following, setFollowing] = useState(true);

  const registerRow = useCallback((index: number, element: HTMLButtonElement | null) => {
    lineRefs.current[index] = element;
  }, []);

  useLayoutEffect(() => {
    activeRef.current = activeIndex;
    visibleRef.current = visible;
    reducedMotionRef.current = reducedMotion;
  }, [activeIndex, visible, reducedMotion]);

  const cancelScroll = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    velocityRef.current = 0;
  }, []);

  const scrollToActive = useCallback(
    (instant = false) => {
      const container = containerRef.current;
      const line = lineRefs.current[activeRef.current];
      if (!container || !line || !container.clientHeight || !container.clientWidth)
        return;
      const target = Math.max(
        0,
        Math.min(
          line.offsetTop + line.offsetHeight / 2 - container.clientHeight * 0.43,
          container.scrollHeight - container.clientHeight,
        ),
      );
      targetRef.current = target;
      if (instant || reducedMotionRef.current) {
        cancelScroll();
        container.scrollTop = target;
        lastAppliedRef.current = container.scrollTop;
        return;
      }
      if (frameRef.current) return;

      let previous = performance.now();
      const tick = (now: number) => {
        if (pausedRef.current || !visibleRef.current) {
          cancelScroll();
          return;
        }
        const dt = Math.min(0.064, Math.max(0.001, (now - previous) / 1000));
        previous = now;
        const distance = container.scrollTop - targetRef.current;
        const velocity = velocityRef.current;
        // Exact critically damped spring: stable at both 60Hz and high refresh rates.
        const frequency = 18;
        const decay = Math.exp(-frequency * dt);
        const nextDistance = (distance + (velocity + frequency * distance) * dt) * decay;
        velocityRef.current =
          (velocity - frequency * (velocity + frequency * distance) * dt) * decay;
        const settled = Math.abs(nextDistance) < 0.5 && Math.abs(velocityRef.current) < 2;
        container.scrollTop = settled
          ? targetRef.current
          : targetRef.current + nextDistance;
        lastAppliedRef.current = container.scrollTop;
        if (settled) {
          frameRef.current = 0;
          velocityRef.current = 0;
        } else {
          frameRef.current = requestAnimationFrame(tick);
        }
      };
      frameRef.current = requestAnimationFrame(tick);
    },
    [cancelScroll],
  );

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container || !visibleRef.current) return;
    if (container.clientHeight) {
      container.style.setProperty("--lyrics-padding", `${container.clientHeight / 2}px`);
    }
    if (!pausedRef.current) scrollToActive(true);
  }, [scrollToActive]);

  useLayoutEffect(() => {
    if (!visible) {
      cancelScroll();
      return;
    }
    pausedRef.current = false;
    measure();
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setFollowing(true);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, lyricsKey, measure, cancelScroll]);

  useLayoutEffect(() => {
    if (!visible) return;
    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    if (listRef.current) observer.observe(listRef.current);
    return () => observer.disconnect();
  }, [visible, measure]);

  useEffect(() => {
    if (visible && !pausedRef.current) scrollToActive();
  }, [activeIndex, visible, scrollToActive]);

  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) measure();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      cancelScroll();
    };
  }, [measure, cancelScroll]);

  const pauseFollow = useCallback(() => {
    if (!visibleRef.current) return;
    cancelScroll();
    pausedRef.current = true;
    setFollowing(false);
  }, [cancelScroll]);

  const resumeFollow = useCallback(
    (index?: number) => {
      if (typeof index === "number") activeRef.current = index;
      pausedRef.current = false;
      setFollowing(true);
      scrollToActive();
    },
    [scrollToActive],
  );

  const onPointerDown = useCallback((event: PointerEvent) => {
    pointerRef.current = { x: event.clientX, y: event.clientY };
  }, []);
  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.buttons === 0) {
        pointerRef.current = null;
        return;
      }
      const start = pointerRef.current;
      if (!start) return;
      const dx = Math.abs(event.clientX - start.x);
      const dy = Math.abs(event.clientY - start.y);
      if (dy > 6 && dy > dx) pauseFollow();
    },
    [pauseFollow],
  );
  const onPointerEnd = useCallback(() => {
    pointerRef.current = null;
  }, []);
  const onWheel = useCallback(
    (event: WheelEvent) => {
      if (event.deltaY !== 0) pauseFollow();
    },
    [pauseFollow],
  );
  const onScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container || frameRef.current || pausedRef.current) return;
    if (Math.abs(container.scrollTop - lastAppliedRef.current) > 2) pauseFollow();
  }, [pauseFollow]);
  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (
        ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(
          event.key,
        ) ||
        (event.key === " " && event.target === containerRef.current)
      )
        pauseFollow();
    },
    [pauseFollow],
  );

  return {
    containerRef,
    listRef,
    lineRefs,
    registerRow,
    following,
    measure,
    resumeFollow,
    scrollProps: {
      onScroll,
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onPointerLeave: onPointerEnd,
      onKeyDown,
      onWheel,
    },
  };
}
