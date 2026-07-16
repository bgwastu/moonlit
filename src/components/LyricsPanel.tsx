"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Box, Button, Text } from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import type { LyricsState } from "@/hooks/useLyrics";
import { Lyric, LyricPart } from "@/lib/lyrics";

const SYNC_THRESHOLD_PX = 80;
/** Desktop panel width/transform transition is ~350ms — wait before first sync. */
const OPEN_LAYOUT_MS = 400;

const ACTIVE_COLOR = "#ffffff";
const ACTIVE_BEAT_COLOR = "rgba(255, 255, 255, 0.7)";
const DIM_COLOR = "rgba(255, 255, 255, 0.3)";

interface LyricsPanelProps {
  lyrics: Lyric[];
  state: LyricsState;
  error: string | null;
  currentTimeSeconds: number;
  isPlaying?: boolean;
  onSeek: (timeSeconds: number) => void;
  className?: string;
  style?: React.CSSProperties;
  isMobile?: boolean;
  visible?: boolean;
}

/** Active line: light up whole words that have started (no wipe/slide). */
function paintWordLine(lineEl: HTMLElement, timeMs: number, isActive: boolean): void {
  const words = lineEl.querySelectorAll<HTMLElement>("[data-lyric-word]");
  for (const el of words) {
    const start = Number(el.dataset.start);
    const on = isActive && timeMs >= start;
    const next = on ? "1" : "0";
    if (el.dataset.on === next) continue;
    el.dataset.on = next;
    el.style.color = on ? ACTIVE_COLOR : DIM_COLOR;
  }
}

function splitWordSpacing(raw: string): {
  leading: string;
  core: string;
  trailing: string;
} {
  const leading = raw.match(/^\s*/)?.[0] ?? "";
  const trailing = raw.match(/\s*$/)?.[0] ?? "";
  const core = raw.slice(leading.length, raw.length - trailing.length);
  return { leading, core, trailing };
}

/**
 * Per-word highlight DOM: inline-block tokens + whitespace as text nodes
 * so lines wrap between words.
 */
function WordHighlightLine({ parts }: { parts: LyricPart[] }) {
  return (
    <span style={{ display: "inline" }}>
      {parts.map((part, i) => {
        const { leading, core, trailing } = splitWordSpacing(part.words);
        if (!core) {
          return (
            <Fragment key={`${part.startTimeMs}-${i}`}>
              {leading}
              {trailing}
            </Fragment>
          );
        }
        return (
          <Fragment key={`${part.startTimeMs}-${i}`}>
            {leading}
            <span
              data-lyric-word
              data-start={part.startTimeMs}
              data-on="0"
              style={{
                display: "inline-block",
                whiteSpace: "pre-wrap",
                verticalAlign: "bottom",
                color: DIM_COLOR,
                transition: "color 0.12s ease",
              }}
            >
              {core}
            </span>
            {trailing}
          </Fragment>
        );
      })}
    </span>
  );
}

export default function LyricsPanel({
  lyrics,
  state,
  error,
  currentTimeSeconds,
  isPlaying = false,
  onSeek,
  className,
  style,
  isMobile = false,
  visible = true,
}: LyricsPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const ignoreScrollRef = useRef(false);
  const followPausedRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wasVisibleRef = useRef(visible);
  const layoutReadyRef = useRef(false);
  const activeIndexRef = useRef(-1);
  const lyricsRef = useRef(lyrics);
  const [isOutOfSync, setIsOutOfSync] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const hasWordParts = useMemo(
    () => lyrics.some((l) => !!l.parts && l.parts.length > 0),
    [lyrics],
  );

  const clockBaseRef = useRef({
    ms: currentTimeSeconds * 1000,
    wall: 0,
  });

  useEffect(() => {
    lyricsRef.current = lyrics;
  }, [lyrics]);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  const resolveActiveIndex = useCallback((timeMs: number, list: Lyric[]): number => {
    if (list.length === 0) return -1;
    for (let i = list.length - 1; i >= 0; i--) {
      if (timeMs >= list[i].startTimeMs) return i;
    }
    return 0;
  }, []);

  const paintAllWordLines = useCallback((timeMs: number, active: number) => {
    const list = lyricsRef.current;
    for (let i = 0; i < list.length; i++) {
      const el = lineRefs.current[i];
      if (!el || !list[i].parts?.length) continue;
      paintWordLine(el, timeMs, i === active);
    }
  }, []);

  useEffect(() => {
    const ms = currentTimeSeconds * 1000;
    clockBaseRef.current = { ms, wall: performance.now() };
    if (!hasWordParts) return;

    const idx = resolveActiveIndex(ms, lyricsRef.current);
    if (idx !== activeIndexRef.current) setActiveIndex(idx);
    else activeIndexRef.current = idx;
    paintAllWordLines(ms, idx);
  }, [
    currentTimeSeconds,
    isPlaying,
    hasWordParts,
    resolveActiveIndex,
    paintAllWordLines,
  ]);

  useLayoutEffect(() => {
    if (!hasWordParts) return;
    const { ms, wall } = clockBaseRef.current;
    const timeMs = isPlaying && wall > 0 ? ms + (performance.now() - wall) : ms;
    paintAllWordLines(timeMs, activeIndex);
  }, [activeIndex, lyrics, hasWordParts, isPlaying, paintAllWordLines]);

  useEffect(() => {
    if (!visible || !hasWordParts || !isPlaying) return;

    let rafId = 0;
    const tick = () => {
      const { ms, wall } = clockBaseRef.current;
      const timeMs = ms + (performance.now() - wall);
      const list = lyricsRef.current;
      const idx = resolveActiveIndex(timeMs, list);

      if (idx !== activeIndexRef.current) {
        activeIndexRef.current = idx;
        setActiveIndex(idx);
      } else {
        paintAllWordLines(timeMs, idx);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [visible, isPlaying, hasWordParts, resolveActiveIndex, paintAllWordLines]);

  const lineOnlyActiveIndex = useMemo(() => {
    if (hasWordParts) return -1;
    return resolveActiveIndex(currentTimeSeconds * 1000, lyrics);
  }, [hasWordParts, currentTimeSeconds, lyrics, resolveActiveIndex]);

  const displayActiveIndex = hasWordParts ? activeIndex : lineOnlyActiveIndex;

  useEffect(() => {
    if (!hasWordParts) activeIndexRef.current = displayActiveIndex;
  }, [hasWordParts, displayActiveIndex]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: lyrics identity/length
  }, [lyrics, visible]);

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

  useEffect(() => {
    if (!visible || displayActiveIndex < 0) return;
    if (!layoutReadyRef.current || followPausedRef.current) return;
    queueMicrotask(() => setIsOutOfSync(false));
    scrollToIndex(displayActiveIndex, "smooth");
  }, [displayActiveIndex, visible, scrollToIndex]);

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
    followPausedRef.current = outOfSync;
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
        minWidth: 0,
        width: "100%",
        maxWidth: "100%",
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
          minWidth: 0,
          width: "100%",
          maxWidth: "100%",
          overflowY: "auto",
          overflowX: "hidden",
          padding: isMobile ? "42vh 20px 42vh" : "42vh 16px 42vh",
          boxSizing: "border-box",
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
            const isActive = i === displayActiveIndex;
            const isBeat = !!lyric.isInstrumental;
            const useWordHighlight =
              hasWordParts && !!lyric.parts && lyric.parts.length > 0 && !isBeat;

            const fontSize = useWordHighlight
              ? "1.85rem"
              : isActive
                ? "1.925rem"
                : "1.75rem";
            const fontWeight = useWordHighlight ? 700 : isActive ? 700 : 600;

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
                  fontSize,
                  fontWeight,
                  color: useWordHighlight
                    ? undefined
                    : isActive
                      ? isBeat
                        ? ACTIVE_BEAT_COLOR
                        : ACTIVE_COLOR
                      : DIM_COLOR,
                  transformOrigin: isMobile ? "center center" : "left center",
                  transform: `scale(${isActive ? 1 : 0.92})`,
                  lineHeight: 1.35,
                  transition: useWordHighlight
                    ? "transform 0.2s ease"
                    : "transform 0.3s ease, color 0.3s ease",
                  textAlign: isMobile ? "center" : "left",
                  letterSpacing: isBeat ? "0.12em" : undefined,
                  minWidth: 0,
                  width: "100%",
                  maxWidth: "100%",
                  overflowWrap: "break-word",
                  wordBreak: "normal",
                }}
              >
                {isBeat ? (
                  "♪"
                ) : useWordHighlight ? (
                  <WordHighlightLine parts={lyric.parts!} />
                ) : (
                  lyric.words
                )}
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}
