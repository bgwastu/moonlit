"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Text } from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import type { LyricsState } from "@/hooks/useLyrics";
import { Lyric } from "@/lib/lyrics";

const SYNC_THRESHOLD_PX = 80;
/** Desktop panel width/transform transition is ~350ms — wait before first sync. */
const OPEN_LAYOUT_MS = 400;

interface LyricsPanelProps {
  lyrics: Lyric[];
  state: LyricsState;
  error: string | null;
  currentTimeSeconds: number;
  onSeek: (timeSeconds: number) => void;
  className?: string;
  style?: React.CSSProperties;
  isMobile?: boolean;
  /** When false, panel is hidden — skip follow-scroll until shown again. */
  visible?: boolean;
}

export default function LyricsPanel({
  lyrics,
  state,
  error,
  currentTimeSeconds,
  onSeek,
  className,
  style,
  isMobile = false,
  visible = true,
}: LyricsPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const ignoreScrollRef = useRef(false);
  /** When user scrolls away from the active line, pause following playback until resync */
  const followPausedRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wasVisibleRef = useRef(visible);
  const layoutReadyRef = useRef(false);
  const activeIndexRef = useRef(-1);
  const [isOutOfSync, setIsOutOfSync] = useState(false);
  const currentTimeMs = currentTimeSeconds * 1000;

  const activeIndex = useMemo(() => {
    if (lyrics.length === 0) return -1;
    for (let i = lyrics.length - 1; i >= 0; i--) {
      if (currentTimeMs >= lyrics[i].startTimeMs) return i;
    }
    return 0;
  }, [lyrics, currentTimeMs]);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  });

  /**
   * Scroll the lyrics scroller itself via scrollTop.
   * Avoid scrollIntoView — it misbehaves with transformed ancestors (desktop slide-in)
   * and often jumps to the end of the list.
   */
  const scrollToIndex = useCallback(
    (index: number, behavior: ScrollBehavior = "smooth") => {
      if (index < 0) return;
      const container = containerRef.current;
      const line = lineRefs.current[index];
      if (!container || !line) return;

      followPausedRef.current = false;
      ignoreScrollRef.current = true;
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);

      const containerRect = container.getBoundingClientRect();
      const lineRect = line.getBoundingClientRect();
      const lineCenterInContent =
        lineRect.top - containerRect.top + container.scrollTop + lineRect.height / 2;
      const target = Math.max(0, lineCenterInContent - container.clientHeight / 2);
      container.scrollTo({ top: target, behavior });

      scrollTimeoutRef.current = setTimeout(
        () => {
          ignoreScrollRef.current = false;
        },
        behavior === "smooth" ? 1200 : 200,
      );
    },
    [],
  );

  const scrollToActive = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      scrollToIndex(activeIndexRef.current, behavior);
    },
    [scrollToIndex],
  );

  // Jump to the current line once the panel is visible and laid out.
  useEffect(() => {
    const becameVisible = visible && !wasVisibleRef.current;
    wasVisibleRef.current = visible;

    if (!visible) {
      layoutReadyRef.current = false;
      return;
    }

    if (!becameVisible) return;

    followPausedRef.current = false;
    layoutReadyRef.current = false;
    queueMicrotask(() => setIsOutOfSync(false));

    const delay = isMobile ? 80 : OPEN_LAYOUT_MS;
    const t = window.setTimeout(() => {
      layoutReadyRef.current = true;
      scrollToActive("auto");
    }, delay);
    return () => window.clearTimeout(t);
  }, [visible, isMobile, scrollToActive]);

  // When lyrics finish loading while the panel is already open, snap to the active line.
  useEffect(() => {
    if (!visible || lyrics.length === 0) return;
    followPausedRef.current = false;
    queueMicrotask(() => setIsOutOfSync(false));
    const t = window.setTimeout(
      () => {
        if (!visible) return;
        layoutReadyRef.current = true;
        scrollToActive("auto");
      },
      isMobile ? 80 : OPEN_LAYOUT_MS,
    );
    return () => window.clearTimeout(t);
    // Only re-run when the lyric set itself changes, not on every active line tick
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: lyrics identity/length
  }, [lyrics, visible]);

  // Re-sync when returning to this browser tab
  useEffect(() => {
    if (!visible) return;
    const onVisibility = () => {
      if (document.hidden || activeIndexRef.current < 0) return;
      followPausedRef.current = false;
      setIsOutOfSync(false);
      scrollToActive("auto");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [visible, scrollToActive]);

  // Follow the active lyric during playback (once layout is ready)
  useEffect(() => {
    if (!visible || activeIndex < 0) return;
    if (!layoutReadyRef.current || followPausedRef.current) return;
    queueMicrotask(() => setIsOutOfSync(false));
    scrollToIndex(activeIndex, "smooth");
  }, [activeIndex, visible, scrollToIndex]);

  useEffect(() => {
    followPausedRef.current = false;
    queueMicrotask(() => setIsOutOfSync(false));
  }, [lyrics]);

  const handleScroll = useCallback(() => {
    if (ignoreScrollRef.current || !layoutReadyRef.current) return;
    const index = activeIndexRef.current;
    if (index < 0 || !containerRef.current || !lineRefs.current[index]) return;
    const container = containerRef.current.getBoundingClientRect();
    const line = lineRefs.current[index]!.getBoundingClientRect();
    const containerCenter = container.top + container.height / 2;
    const lineCenter = line.top + line.height / 2;
    const distance = Math.abs(containerCenter - lineCenter);
    const outOfSync = distance > SYNC_THRESHOLD_PX;
    if (outOfSync) followPausedRef.current = true;
    else followPausedRef.current = false;
    setIsOutOfSync(outOfSync);
  }, []);

  const handleSyncClick = useCallback(() => {
    setIsOutOfSync(false);
    layoutReadyRef.current = true;
    scrollToActive("smooth");
  }, [scrollToActive]);

  const handleLineClick = useCallback(
    (lyric: Lyric) => onSeek(lyric.startTimeMs / 1000),
    [onSeek],
  );

  const isEmpty = state === "error" || lyrics.length === 0;
  const isLoading = state === "loading" || state === "idle" || state === "not_found";
  const emptyMessage = state === "error" && error ? error : null;

  return (
    <Box
      className={className}
      style={{
        ...style,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        position: "relative",
        backgroundColor: "transparent",
      }}
    >
      {isOutOfSync && !isEmpty && (
        <Box
          style={{
            position: "absolute",
            top: 150,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
          }}
        >
          <Button
            variant="default"
            size="md"
            radius="xl"
            leftIcon={<IconRefresh size={18} />}
            onClick={handleSyncClick}
            styles={{
              root: {
                backgroundColor: "rgba(255, 255, 255, 0.12)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                color: "white",
              },
            }}
          >
            Sync lyrics
          </Button>
        </Box>
      )}
      <Box
        ref={containerRef}
        data-lyrics-scroll
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "42vh 24px 42vh",
          scrollBehavior: "smooth",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          touchAction: "pan-y",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, transparent 12%, black 32%, black 68%, transparent 88%, transparent 100%)",
          maskImage:
            "linear-gradient(to bottom, transparent 0%, transparent 12%, black 32%, black 68%, transparent 88%, transparent 100%)",
        }}
        sx={{ "&::-webkit-scrollbar": { display: "none" } }}
      >
        {isLoading ? null : isEmpty ? (
          emptyMessage ? (
            <Box
              h="100%"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                color: "rgba(255, 255, 255, 0.5)",
                textAlign: "center",
              }}
            >
              <Text size="sm">{emptyMessage}</Text>
            </Box>
          ) : null
        ) : (
          lyrics.map((lyric, i) => {
            const isActive = i === activeIndex;
            return (
              <Box
                key={`${lyric.startTimeMs}-${i}`}
                ref={(el) => {
                  lineRefs.current[i] = el;
                }}
                onClick={() => handleLineClick(lyric)}
                style={{
                  marginBottom: "1.5rem",
                  cursor: "pointer",
                  fontSize: isActive ? "1.925rem" : "1.75rem",
                  fontWeight: isActive ? 700 : 600,
                  color: isActive ? "#fff" : "rgba(255, 255, 255, 0.3)",
                  transformOrigin: isMobile ? "center center" : "left center",
                  transform: `scale(${isActive ? 1 : 0.92})`,
                  lineHeight: 1.3,
                  transition: "transform 0.3s ease, color 0.3s ease",
                  textAlign: isMobile ? "center" : "left",
                }}
              >
                {lyric.words}
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}
