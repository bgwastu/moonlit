"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Slider } from "@mantine/core";
import type { BufferedRange } from "@/hooks/useStretchPlayer";
import { getFormattedTime } from "@/utils";

export function PlayerSeekBar({
  currentTime,
  duration,
  buffered,
  isMediaReady,
  disabled,
  isPlaying,
  isEnded,
  barColor,
  resetKey,
  seek,
  play,
  onDisplayTimeChange,
}: {
  currentTime: number;
  duration: number;
  buffered: BufferedRange[];
  isMediaReady: boolean;
  disabled: boolean;
  isPlaying: boolean;
  isEnded: boolean;
  barColor: string;
  resetKey: string;
  seek: (timeSeconds: number) => void;
  play: () => void | Promise<unknown>;
  onDisplayTimeChange?: (displayTime: number, displayDuration: number) => void;
}) {
  const [seekPosition, setSeekPosition] = useState<number | null>(null);
  const seekPositionRef = useRef<number | null>(null);
  const wasPlayingOnSeekRef = useRef(false);
  const [isSeekTrackHovered, setIsSeekTrackHovered] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const seekTrackRef = useRef<HTMLDivElement>(null);

  const showSeekChrome = isSeekTrackHovered || isSeeking;
  const seekSlotHeight = 5;
  const seekTrackHeight = showSeekChrome ? 5 : 2;
  const seekThumbSize = 17;

  useEffect(() => {
    seekPositionRef.current = null;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setSeekPosition(null);
      setIsSeeking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [resetKey]);

  const displayTime = isMediaReady ? (seekPosition ?? currentTime) : 0;
  const displayDuration = isMediaReady ? duration : 0;

  useEffect(() => {
    onDisplayTimeChange?.(displayTime, displayDuration);
  }, [displayTime, displayDuration, onDisplayTimeChange]);

  const handleSliderChange = useCallback((value: number) => {
    setIsSeeking(true);
    seekPositionRef.current = value;
    setSeekPosition(value);
  }, []);

  const handleSeekEnd = useCallback(
    (value: number) => {
      const finalPosition = seekPositionRef.current ?? value;
      const resumeAfterEnd = isEnded;
      seek(finalPosition);
      seekPositionRef.current = null;
      setSeekPosition(null);
      setIsSeeking(false);
      if (wasPlayingOnSeekRef.current || resumeAfterEnd) {
        void play();
      }
    },
    [seek, play, isEnded],
  );

  const handleTrackPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || duration <= 0 || !isMediaReady) return;
      const track = seekTrackRef.current;
      if (!track) return;

      event.preventDefault();
      event.stopPropagation();
      wasPlayingOnSeekRef.current = isPlaying || isEnded;
      track.setPointerCapture?.(event.pointerId);

      const updatePosition = (clientX: number) => {
        const rect = track.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const value = Math.round(ratio * duration * 10) / 10;
        handleSliderChange(value);
        return value;
      };

      updatePosition(event.clientX);
      const onMove = (moveEvent: PointerEvent) => {
        updatePosition(moveEvent.clientX);
      };
      const onUp = (upEvent: PointerEvent) => {
        const value = updatePosition(upEvent.clientX);
        handleSeekEnd(value);
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp, { once: true });
    },
    [duration, handleSeekEnd, handleSliderChange, isPlaying, isEnded, isMediaReady],
  );

  return (
    <Box
      style={{
        position: "relative",
        width: "100%",
        height: 0,
        flexShrink: 0,
        overflow: "visible",
        zIndex: 5,
      }}
    >
      <Box
        ref={seekTrackRef}
        onPointerDown={handleTrackPointerDown}
        onMouseEnter={() => setIsSeekTrackHovered(true)}
        onMouseLeave={() => setIsSeekTrackHovered(false)}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: -12,
          height: 24,
          touchAction: "none",
          cursor: "pointer",
          zIndex: 3,
        }}
      />
      {displayDuration > 0
        ? buffered.map((range, i) => (
            <Box
              key={i}
              style={{
                position: "absolute",
                left: `${(range.start / displayDuration) * 100}%`,
                width: `${((range.end - range.start) / displayDuration) * 100}%`,
                height: seekTrackHeight,
                top: 0,
                backgroundColor: "rgba(255, 255, 255, 0.12)",
                borderRadius: 0,
                pointerEvents: "none",
                zIndex: 0,
                transition: "height 0.15s",
              }}
            />
          ))
        : null}
      <Slider
        style={{
          pointerEvents: "none",
          width: "100%",
          height: seekSlotHeight,
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
        }}
        disabled={disabled}
        value={displayTime}
        onChange={handleSliderChange}
        onChangeEnd={handleSeekEnd}
        min={0}
        step={0.1}
        radius={0}
        showLabelOnHover={false}
        size="xs"
        thumbSize={seekThumbSize}
        styles={{
          root: { width: "100%", height: seekSlotHeight },
          trackContainer: {
            overflow: "visible",
            height: seekSlotHeight,
          },
          track: {
            height: seekTrackHeight,
            backgroundColor: "rgba(255, 255, 255, 0.12)",
            transition: "height 0.15s",
          },
          bar: {
            backgroundColor: barColor,
            transition: "height 0.15s",
          },
          thumb: {
            border: "none",
            borderWidth: 0,
            boxShadow: "none",
            backgroundColor: barColor,
            borderRadius: "50%",
            boxSizing: "border-box",
            padding: 0,
            opacity: showSeekChrome ? 1 : 0,
            transition: "opacity 0.12s ease",
            pointerEvents: "none",
          },
        }}
        label={(v) => (displayTime >= displayDuration - 5 ? null : getFormattedTime(v))}
        max={Math.max(displayDuration, 0.1)}
      />
    </Box>
  );
}
