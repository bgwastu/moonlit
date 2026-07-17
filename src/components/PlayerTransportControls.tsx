"use client";

import { useEffect, useRef, useState } from "react";
import { ActionIcon, Box, Flex, Slider, Text } from "@mantine/core";
import {
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconVolume,
  IconVolume2,
  IconVolumeOff,
} from "@tabler/icons-react";
import { getFormattedTime } from "@/utils";

export function PlayerTransportControls({
  isMobile,
  isLoading,
  isMediaReady,
  isPlaying,
  volume,
  isMuted,
  displayTime,
  displayDuration,
  onTogglePlay,
  onMuteToggle,
  onVolumeChange,
}: {
  isMobile: boolean;
  isLoading: boolean;
  isMediaReady: boolean;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  displayTime: number;
  displayDuration: number;
  onTogglePlay: () => void;
  onMuteToggle: () => void;
  onVolumeChange: (volume: number) => void;
}) {
  const [isVolumeHovered, setIsVolumeHovered] = useState(false);
  const volumeControlRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMobile || !isVolumeHovered) return;

    const closeVolume = (e: PointerEvent) => {
      if (volumeControlRef.current?.contains(e.target as Node)) return;
      setIsVolumeHovered(false);
    };

    document.addEventListener("pointerdown", closeVolume);
    return () => document.removeEventListener("pointerdown", closeVolume);
  }, [isMobile, isVolumeHovered]);

  const volumeIcon =
    isMuted || volume === 0 ? (
      <IconVolumeOff size={24} />
    ) : volume < 0.66 ? (
      <IconVolume2 size={24} />
    ) : (
      <IconVolume size={24} />
    );

  return (
    <Flex align="center" gap={isMobile ? 2 : 4}>
      <ActionIcon
        size="xl"
        onClick={onTogglePlay}
        title={isPlaying ? "Pause" : "Play"}
        variant="transparent"
        color="gray"
        disabled={isLoading || !isMediaReady}
      >
        {isPlaying ? (
          <IconPlayerPauseFilled size={30} />
        ) : (
          <IconPlayerPlayFilled size={30} />
        )}
      </ActionIcon>
      <Flex
        ref={volumeControlRef}
        align="center"
        onMouseEnter={() => {
          if (!isMobile) setIsVolumeHovered(true);
        }}
        onMouseLeave={() => {
          if (!isMobile) setIsVolumeHovered(false);
        }}
        style={{ position: "relative" }}
      >
        <ActionIcon
          size="lg"
          disabled={isLoading}
          onClick={() => {
            if (isMobile) {
              setIsVolumeHovered((open) => !open);
            } else {
              onMuteToggle();
            }
          }}
          title={isMuted || volume === 0 ? "Unmute" : "Mute"}
          variant="transparent"
          color="gray"
        >
          {volumeIcon}
        </ActionIcon>
        <Box
          style={{
            width: isVolumeHovered ? 80 : 0,
            overflow: "hidden",
            transition: "width 0.2s ease",
          }}
        >
          <Slider
            disabled={isLoading}
            value={isMuted ? 0 : volume}
            onChange={onVolumeChange}
            min={0}
            max={1}
            step={0.01}
            size="sm"
            w={70}
            ml={4}
            styles={{
              thumb: {
                borderWidth: 0,
                borderRadius: "50%",
              },
            }}
          />
        </Box>
      </Flex>
      {!isMobile ? (
        <Text
          size="xs"
          c="dimmed"
          ml={4}
          style={{
            fontVariantNumeric: "tabular-nums",
            width: "13ch",
            flexShrink: 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            userSelect: "none",
            WebkitUserSelect: "none",
            opacity: isMediaReady ? 1 : 0.45,
          }}
        >
          {`${getFormattedTime(displayTime)} / ${getFormattedTime(displayDuration)}`}
        </Text>
      ) : null}
    </Flex>
  );
}
