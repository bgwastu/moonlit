"use client";

import type { ReactNode } from "react";
import {
  Box,
  Button,
  Center,
  Flex,
  SegmentedControl,
  useMantineTheme,
} from "@mantine/core";
import { IconAdjustments } from "@tabler/icons-react";

export type PlaybackMode = "slowed" | "normal" | "speedup" | "custom";

export function PlayerModeSelector({
  playbackMode,
  disabled,
  onModeChange,
  onOpenCustomize,
}: {
  playbackMode: PlaybackMode;
  disabled: boolean;
  onModeChange: (mode: PlaybackMode) => void;
  onOpenCustomize: () => void;
}): ReactNode {
  const theme = useMantineTheme();

  return (
    <Flex
      style={{
        position: "absolute",
        top: 28,
        left: 0,
        right: 0,
        zIndex: 2,
      }}
      gap="sm"
      wrap="wrap"
      px="lg"
    >
      <Flex
        style={{ flex: 1 }}
        justify="center"
        align="center"
        direction="column"
        gap="sm"
      >
        <SegmentedControl
          disabled={disabled}
          tabIndex={-1}
          bg={theme.colors.dark[6]}
          color="brand"
          style={{ boxShadow: "0px 0px 0px 1px #383A3F" }}
          size="sm"
          onChange={(value) => onModeChange(value as PlaybackMode)}
          value={playbackMode}
          data={[
            { label: "Slowed", value: "slowed" },
            { label: "Normal", value: "normal" },
            { label: "Speed Up", value: "speedup" },
            {
              label: (
                <Center>
                  <IconAdjustments size={18} />
                  <Box ml={10}>Custom</Box>
                </Center>
              ),
              value: "custom",
            },
          ]}
        />
        {playbackMode === "custom" ? (
          <Button variant="default" onClick={onOpenCustomize}>
            Customize Playback
          </Button>
        ) : null}
      </Flex>
    </Flex>
  );
}
