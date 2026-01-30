"use client";

import {
  ActionIcon,
  Box,
  Button,
  Divider,
  Flex,
  Modal,
  Switch,
  Text,
  useMantineTheme,
} from "@mantine/core";
import { IconCheck, IconMinus, IconPlus, IconSearch } from "@tabler/icons-react";

interface LyricsSettingsModalProps {
  opened: boolean;
  onClose: () => void;
  showLyrics: boolean;
  onToggleLyrics: (enabled: boolean) => void;
  currentLyricsTrackName: string | null;
  currentLyricsArtistName: string | null;
  currentOffset: number;
  onOffsetChange: (offset: number) => void;
  onChangeLyrics: () => void;
}

export default function LyricsSettingsModal({
  opened,
  onClose,
  showLyrics,
  onToggleLyrics,
  currentLyricsTrackName,
  currentLyricsArtistName,
  currentOffset,
  onOffsetChange,
  onChangeLyrics,
}: LyricsSettingsModalProps) {
  const theme = useMantineTheme();
  const primaryColor = theme.colors[theme.primaryColor]?.[6] ?? theme.colors.blue[6];
  const hasLyrics = !!currentLyricsTrackName;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Lyrics Settings"
      size="md"
      centered
      styles={{
        title: { fontWeight: 600 },
      }}
    >
      {/* Enable/Disable Toggle */}
      <Box mb="md">
        <Flex align="center" justify="space-between">
          <Text size="sm" fw={500}>
            Show Lyrics
          </Text>
          <Switch
            checked={showLyrics}
            onChange={(e) => onToggleLyrics(e.currentTarget.checked)}
            size="md"
          />
        </Flex>
      </Box>

      <Divider mb="md" />

      {hasLyrics ? (
        <>
          {/* Currently Selected Lyrics Info */}
          <Box mb="md">
            <Text size="sm" fw={500} mb="xs">
              Current Lyrics
            </Text>
            <Box
              p="sm"
              style={{
                borderRadius: 8,
                backgroundColor: `color-mix(in srgb, ${primaryColor} 15%, transparent)`,
                border: `1px solid color-mix(in srgb, ${primaryColor} 40%, transparent)`,
              }}
            >
              <Flex align="center" gap="xs">
                <IconCheck size={16} style={{ color: primaryColor }} />
                <Box style={{ flex: 1 }}>
                  <Text size="sm" fw={600} lineClamp={1}>
                    {currentLyricsTrackName}
                  </Text>
                  {currentLyricsArtistName && (
                    <Text size="xs" c="dimmed" lineClamp={1}>
                      {currentLyricsArtistName}
                    </Text>
                  )}
                </Box>
              </Flex>
            </Box>
          </Box>

          {/* Offset Control */}
          <Box mb="md">
            <Text size="sm" fw={500} mb="xs">
              Timing Offset
            </Text>
            <Flex align="center" gap="sm">
              <ActionIcon
                variant="default"
                size="lg"
                onClick={() => onOffsetChange(currentOffset - 1)}
              >
                <IconMinus size={16} />
              </ActionIcon>
              <Text
                size="sm"
                fw={500}
                style={{
                  minWidth: 60,
                  textAlign: "center",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {currentOffset >= 0 ? `+${currentOffset}` : currentOffset}s
              </Text>
              <ActionIcon
                variant="default"
                size="lg"
                onClick={() => onOffsetChange(currentOffset + 1)}
              >
                <IconPlus size={16} />
              </ActionIcon>
              {currentOffset !== 0 && (
                <Button variant="subtle" size="xs" onClick={() => onOffsetChange(0)}>
                  Reset
                </Button>
              )}
            </Flex>
          </Box>

          <Divider mb="md" />

          {/* Change Lyrics Button */}
          <Button
            variant="default"
            fullWidth
            leftIcon={<IconSearch size={16} />}
            onClick={() => {
              onChangeLyrics();
              onClose();
            }}
          >
            Change Lyrics
          </Button>
        </>
      ) : (
        /* No lyrics selected */
        <Flex direction="column" align="center" justify="center" py="xl" gap="md">
          <Text c="dimmed" size="sm">
            No lyrics selected
          </Text>
          <Button
            variant="default"
            leftIcon={<IconSearch size={16} />}
            onClick={() => {
              onChangeLyrics();
              onClose();
            }}
          >
            Search for Lyrics
          </Button>
        </Flex>
      )}
    </Modal>
  );
}
