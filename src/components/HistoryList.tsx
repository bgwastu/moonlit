"use client";

import { useState } from "react";
import {
  Box,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  rem,
  rgba,
  useMantineTheme,
} from "@mantine/core";
import { IconHistory, IconTrash } from "@tabler/icons-react";
import MediaResultRow from "@/components/MediaResultRow";
import { useAppContext } from "@/context/AppContext";
import type { HistoryItem } from "@/interfaces";
import { timeAgo } from "@/utils";

interface HistoryListProps {
  onPlay?: () => void;
  maxHeight?: number | string;
  showClear?: boolean;
}

export default function HistoryList({
  onPlay,
  maxHeight,
  showClear = true,
}: HistoryListProps) {
  const { history, setHistory, openPlayer } = useAppContext();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const theme = useMantineTheme();

  const handlePlay = (item: HistoryItem) => {
    onPlay?.();
    if (item.sourceUrl.startsWith("local:")) {
      openPlayer({ media: item, expand: true });
      return;
    }

    const youtubeId = item.metadata.id;
    const url = item.sourceUrl.startsWith("http")
      ? item.sourceUrl
      : youtubeId
        ? `https://www.youtube.com/watch?v=${youtubeId}`
        : null;

    if (!url) return;
    openPlayer({ url, expand: true });
  };

  const sorted = [...history].sort((a, b) => b.playedAt - a.playedAt);

  if (sorted.length === 0) {
    return (
      <Box
        py="xl"
        px="md"
        style={{
          borderRadius: theme.radius.md,
          border: `${rem(1)} dashed ${rgba(theme.colors.gray[6], 0.35)}`,
          backgroundColor: rgba(theme.colors.dark[8], 0.28),
        }}
      >
        <Stack gap="sm" align="flex-start">
          <IconHistory size={28} stroke={1.5} opacity={0.55} />
          <Box>
            <Text size="sm" fw={600} c="white">
              No recent plays
            </Text>
            <Text size="sm" c="dimmed" mt={4} maw={360}>
              Play a song to get started — then tweak speed, pitch, or reverb.
            </Text>
          </Box>
        </Stack>
      </Box>
    );
  }

  return (
    <>
      <Modal
        opened={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Clear recent history?"
        centered
        radius="md"
      >
        <Text size="sm" c="dimmed" mb="md">
          This removes all recent plays from this device. It cannot be undone.
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={() => setConfirmOpen(false)}>
            Cancel
          </Button>
          <Button
            color="red"
            onClick={() => {
              setHistory([]);
              setConfirmOpen(false);
            }}
          >
            Clear all
          </Button>
        </Group>
      </Modal>

      <Stack gap="xs">
        <Group justify="space-between" px={4} style={{ flexShrink: 0 }}>
          <Text size="sm" fw={600} c="dimmed">
            Recent
          </Text>
          {showClear && (
            <Button
              variant="subtle"
              color="red"
              size="compact-xs"
              leftSection={<IconTrash size={12} />}
              onClick={() => setConfirmOpen(true)}
            >
              Clear
            </Button>
          )}
        </Group>
        <Box
          style={{
            maxHeight: maxHeight ?? rem(420),
            overflowY: "auto",
          }}
        >
          <Stack gap={4}>
            {sorted.map((item) => {
              const meta = item.metadata ?? ({} as HistoryItem["metadata"]);
              return (
                <MediaResultRow
                  key={item.sourceUrl}
                  compact
                  item={{
                    id: meta.id || item.sourceUrl,
                    title: meta.title || "Unknown",
                    author: meta.artist ?? meta.author ?? "Unknown",
                    thumbnail: meta.coverUrl || "",
                    metaRight: timeAgo(item.playedAt),
                  }}
                  onClick={() => handlePlay(item)}
                />
              );
            })}
          </Stack>
        </Box>
      </Stack>
    </>
  );
}
