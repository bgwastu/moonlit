"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Text } from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import type { LyricsState } from "@/hooks/useLyrics";
import { Lyric } from "@/lib/lyrics";

const SYNC_THRESHOLD_PX = 80;

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
  const [isOutOfSync, setIsOutOfSync] = useState(false);
  const currentTimeMs = currentTimeSeconds * 1000;

  const activeIndex = useMemo(() => {
    if (lyrics.length === 0) return -1;
    for (let i = lyrics.length - 1; i >= 0; i--) {
      if (currentTimeMs >= lyrics[i].startTimeMs) return i;
    }
    return 0;
  }, [lyrics, currentTimeMs]);

  const scrollToActive = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      if (activeIndex < 0) return;
      followPausedRef.current = false;
      ignoreScrollRef.current = true;
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      lineRefs.current[activeIndex]?.scrollIntoView({
        behavior,
        block: "center",
      });
      scrollTimeoutRef.current = setTimeout(
        () => {
          ignoreScrollRef.current = false;
        },
        behavior === "smooth" ? 1200 : 200,
      );
    },
    [activeIndex],
  );

  // Jump to the current line when the panel becomes visible.
  useEffect(() => {
    const becameVisible = visible && !wasVisibleRef.current;
    wasVisibleRef.current = visible;
    if (!becameVisible || activeIndex < 0) return;

    followPausedRef.current = false;
    const syncId = requestAnimationFrame(() => setIsOutOfSync(false));
    const t = window.setTimeout(() => scrollToActive("auto"), 100);
    return () => {
      cancelAnimationFrame(syncId);
      window.clearTimeout(t);
    };
  }, [visible, activeIndex, scrollToActive]);

  useEffect(() => {
    if (!visible || activeIndex < 0 || followPausedRef.current) return;
    const syncId = requestAnimationFrame(() => {
      setIsOutOfSync(false);
    });
    ignoreScrollRef.current = true;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    lineRefs.current[activeIndex]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    scrollTimeoutRef.current = setTimeout(() => {
      ignoreScrollRef.current = false;
    }, 1200);
    return () => {
      cancelAnimationFrame(syncId);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, [activeIndex, visible]);

  useEffect(() => {
    followPausedRef.current = false;
    queueMicrotask(() => setIsOutOfSync(false));
  }, [lyrics]);

  const handleScroll = useCallback(() => {
    if (ignoreScrollRef.current) return;
    if (activeIndex < 0 || !containerRef.current || !lineRefs.current[activeIndex])
      return;
    const container = containerRef.current.getBoundingClientRect();
    const line = lineRefs.current[activeIndex]!.getBoundingClientRect();
    const containerCenter = container.top + container.height / 2;
    const lineCenter = line.top + line.height / 2;
    const distance = Math.abs(containerCenter - lineCenter);
    const outOfSync = distance > SYNC_THRESHOLD_PX;
    if (outOfSync) followPausedRef.current = true;
    else followPausedRef.current = false;
    setIsOutOfSync(outOfSync);
  }, [activeIndex]);

  const handleSyncClick = useCallback(() => {
    setIsOutOfSync(false);
    scrollToActive("smooth");
  }, [scrollToActive]);

  const handleLineClick = useCallback(
    (lyric: Lyric) => onSeek(lyric.startTimeMs / 1000),
    [onSeek],
  );

  const isEmpty = state === "error" || state === "not_found" || lyrics.length === 0;
  const isLoading = state === "loading" || state === "idle";
  const emptyMessage =
    state === "error" && error ? error : "No synced lyrics found for this track.";

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
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "42vh 24px 42vh",
          scrollBehavior: "smooth",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, transparent 15%, black 40%, black 60%, transparent 85%, transparent 100%)",
          maskImage:
            "linear-gradient(to bottom, transparent 0%, transparent 15%, black 40%, black 60%, transparent 85%, transparent 100%)",
        }}
        sx={{ "&::-webkit-scrollbar": { display: "none" } }}
      >
        {isLoading ? null : isEmpty ? (
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
