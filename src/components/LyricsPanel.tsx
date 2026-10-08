"use client";

import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Box, Button, Text } from "@mantine/core";
import { IconArrowUp } from "@tabler/icons-react";
import type { LyricsState } from "@/hooks/useLyrics";
import { useLyricsFollow } from "@/hooks/useLyricsFollow";
import { findActiveLyric, lyricWordProgress } from "@/lib/lyricPlayback";
import type { Lyric, LyricPart } from "@/lib/lyrics";
import { EMPTY_ROMANIZATIONS, getRomanizationLanguage } from "@/lib/romanization";
import styles from "./LyricsPanel.module.css";

interface LyricsPanelProps {
  lyrics: Lyric[];
  showRomanization?: boolean;
  romanizations?: ReadonlyMap<string, string>;
  state: LyricsState;
  error: string | null;
  currentTimeSeconds: number;
  getPlaybackTime?: () => number;
  rate?: number;
  isPlaying?: boolean;
  isWaiting?: boolean;
  onSeek: (timeSeconds: number) => void;
  className?: string;
  style?: React.CSSProperties;
  isMobile?: boolean;
  visible?: boolean;
}

interface WordElement {
  element: HTMLElement;
  start: number;
  duration: number;
  progress: number;
}

function WordHighlightLine({ parts }: { parts: LyricPart[] }) {
  return (
    <span>
      {parts.map((part, index) => {
        const leading = part.words.match(/^\s*/)?.[0] ?? "";
        const trailing = part.words.match(/\s*$/)?.[0] ?? "";
        const core = part.words.trim();
        return (
          <Fragment key={index}>
            {leading}
            {core && (
              <span
                className={styles.word}
                data-lyric-word
                data-start={part.startTimeMs}
                data-duration={part.durationMs}
                data-on="0"
              >
                {core}
              </span>
            )}
            {core && trailing}
          </Fragment>
        );
      })}
    </span>
  );
}

const LyricRow = memo(function LyricRow({
  lyric,
  index,
  active,
  near,
  romanization,
  isMobile,
  register,
  onSeek,
  onFollow,
}: {
  lyric: Lyric;
  index: number;
  active: boolean;
  near: boolean;
  romanization?: string;
  isMobile: boolean;
  register: (index: number, element: HTMLButtonElement | null) => void;
  onSeek: (time: number) => void;
  onFollow: (index?: number) => void;
}) {
  return (
    <button
      type="button"
      className={styles.row}
      data-lyric-line
      data-active={active || undefined}
      data-near={near || undefined}
      data-instrumental={lyric.isInstrumental || undefined}
      data-mobile={isMobile || undefined}
      ref={(element) => register(index, element)}
      aria-label={`Seek to ${lyric.isInstrumental ? "instrumental break" : lyric.words}`}
      aria-current={active ? "true" : undefined}
      onClick={() => {
        onFollow(index);
        onSeek(lyric.startTimeMs / 1000);
      }}
    >
      <span className={styles.rowContent}>
        {lyric.isInstrumental ? (
          "♪"
        ) : lyric.parts?.length ? (
          <WordHighlightLine parts={lyric.parts} />
        ) : (
          lyric.words
        )}
        {romanization && !lyric.isInstrumental && (
          <span
            className={styles.romanization}
            lang={
              lyric.romanizationLanguage ||
              `${getRomanizationLanguage(lyric, true) || "ja"}-Latn`
            }
            data-lyric-romanization
          >
            {lyric.timedRomanization?.length ? (
              <WordHighlightLine parts={lyric.timedRomanization} />
            ) : (
              romanization
            )}
          </span>
        )}
      </span>
    </button>
  );
});

export default function LyricsPanel({
  lyrics,
  showRomanization = false,
  romanizations = EMPTY_ROMANIZATIONS,
  state,
  error,
  currentTimeSeconds,
  getPlaybackTime,
  rate = 1,
  isPlaying = false,
  isWaiting = false,
  onSeek,
  className,
  style,
  isMobile = false,
  visible = true,
}: LyricsPanelProps) {
  const [activeIndex, setActiveIndex] = useState(() =>
    findActiveLyric(lyrics, currentTimeSeconds * 1000),
  );
  const activeRef = useRef(activeIndex);
  const lyricsRef = useRef(lyrics);
  const wordsRef = useRef<WordElement[][]>([]);
  const paintedIndexRef = useRef(-1);
  const clockRef = useRef({
    ms: currentTimeSeconds * 1000,
    wall: 0,
    rate,
    running: isPlaying && !isWaiting,
    read: getPlaybackTime,
  });
  const lyricsKey = useMemo(
    () => lyrics.map((line) => line.words).join("\u0000"),
    [lyrics],
  );
  const {
    containerRef,
    listRef,
    lineRefs,
    registerRow,
    following,
    measure,
    resumeFollow,
    scrollProps,
  } = useLyricsFollow({ activeIndex, lyricsKey, visible });

  const readTime = useCallback(() => {
    const clock = clockRef.current;
    const actual = clock.read?.();
    if (Number.isFinite(actual)) return actual * 1000;
    return (
      clock.ms +
      (clock.running && clock.wall ? (performance.now() - clock.wall) * clock.rate : 0)
    );
  }, []);

  const paintLine = useCallback((index: number, timeMs: number, active: boolean) => {
    for (const word of wordsRef.current[index] || []) {
      const progress = active ? lyricWordProgress(timeMs, word.start, word.duration) : 0;
      const on = active && timeMs >= word.start;
      word.element.dataset.on = on ? "1" : "0";
      word.element.dataset.singing = on && progress < 1 ? "true" : "false";
      if (progress === word.progress) continue;
      word.progress = progress;
      word.element.style.setProperty(
        "--lyric-fill",
        `${Math.round(progress * 1000) / 10}%`,
      );
    }
  }, []);

  const paintFrame = useCallback(
    (timeMs: number, index: number) => {
      if (paintedIndexRef.current !== index)
        paintLine(paintedIndexRef.current, timeMs, false);
      paintLine(index, timeMs, true);
      paintedIndexRef.current = index;
    },
    [paintLine],
  );

  useLayoutEffect(() => {
    lyricsRef.current = lyrics;
    wordsRef.current = lyrics.map((_, index) =>
      Array.from(
        lineRefs.current[index]?.querySelectorAll<HTMLElement>("[data-lyric-word]") || [],
        (element) => ({
          element,
          start: Number(element.dataset.start),
          duration: Number(element.dataset.duration),
          progress: -1,
        }),
      ),
    );
    for (let index = 0; index < lyrics.length; index += 1) paintLine(index, 0, false);
    paintedIndexRef.current = -1;
    measure();
  }, [lyrics, showRomanization, romanizations, lineRefs, measure, paintLine]);

  useLayoutEffect(() => {
    clockRef.current = {
      ms: currentTimeSeconds * 1000,
      wall: performance.now(),
      rate,
      running: isPlaying && !isWaiting,
      read: getPlaybackTime,
    };
    const time = readTime();
    const index = findActiveLyric(lyrics, time);
    paintFrame(time, index);
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled && index !== activeRef.current) {
        activeRef.current = index;
        setActiveIndex(index);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    lyrics,
    currentTimeSeconds,
    getPlaybackTime,
    rate,
    isPlaying,
    isWaiting,
    showRomanization,
    romanizations,
    readTime,
    paintFrame,
  ]);

  useEffect(() => {
    if (!visible || !isPlaying || isWaiting) return;
    let frame = 0;
    const tick = () => {
      const time = readTime();
      const index = findActiveLyric(lyricsRef.current, time);
      if (index !== activeRef.current) {
        activeRef.current = index;
        setActiveIndex(index);
      }
      paintFrame(time, index);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visible, isPlaying, isWaiting, readTime, paintFrame]);

  return (
    <Box
      className={[styles.panel, className].filter(Boolean).join(" ")}
      inert={!visible}
      aria-hidden={!visible || undefined}
      style={style}
      data-mobile={isMobile || undefined}
    >
      {!following && lyrics.length > 0 && (
        <div className={styles.followPrompt}>
          <Button
            variant="default"
            size="sm"
            radius="xl"
            leftSection={<IconArrowUp size={16} aria-hidden />}
            aria-label="Back to current line"
            onClick={() => resumeFollow()}
            className={styles.followButton}
          >
            Back
          </Button>
        </div>
      )}
      <div
        ref={containerRef}
        data-lyrics-scroll
        className={`${styles.scroll} moonlit-hide-scrollbar`}
        tabIndex={visible ? 0 : -1}
        aria-label="Synced lyrics"
        {...scrollProps}
      >
        <div ref={listRef}>
          {lyrics.length > 0 ? (
            lyrics.map((lyric, index) => (
              <LyricRow
                key={index}
                lyric={lyric}
                index={index}
                active={index === activeIndex}
                near={Math.abs(index - activeIndex) === 1}
                isMobile={isMobile}
                romanization={
                  showRomanization
                    ? lyric.romanization || romanizations.get(lyric.words)
                    : undefined
                }
                register={registerRow}
                onSeek={onSeek}
                onFollow={resumeFollow}
              />
            ))
          ) : (
            <Text className={styles.empty} size="sm" c="dimmed">
              {state === "error"
                ? error || "Lyrics are unavailable"
                : state === "not_found"
                  ? "No lyrics found"
                  : "Finding lyrics…"}
            </Text>
          )}
        </div>
      </div>
    </Box>
  );
}
