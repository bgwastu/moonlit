"use client";

import { useState } from "react";
import { Box, Button, Group, Modal, Stack, Text, rem } from "@mantine/core";
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
        sx={(t) => ({
          borderRadius: t.radius.md,
          border: `${rem(1)} dashed ${t.fn.rgba(t.colors.gray[6], 0.35)}`,
          backgroundColor: t.fn.rgba(t.colors.dark[8], 0.28),
        })}
      >
        <Stack spacing="sm" align="flex-start">
          <IconHistory size={28} stroke={1.5} opacity={0.55} />
          <Box>
            <Text size="sm" weight={600} color="white">
              No recent plays
            </Text>
            <Text size="sm" color="dimmed" mt={4} maw={360}>
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
        <Text size="sm" color="dimmed" mb="md">
          This removes all recent plays from this device. It cannot be undone.
        </Text>
        <Group position="right" spacing="sm">
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

      <Stack spacing="xs">
        <Group position="apart" px={4} sx={{ flexShrink: 0 }}>
          <Text size="sm" weight={600} color="dimmed">
            Recent
          </Text>
          {showClear && (
            <Button
              variant="subtle"
              color="red"
              size="xs"
              compact
              leftIcon={<IconTrash size={12} />}
              onClick={() => setConfirmOpen(true)}
            >
              Clear
            </Button>
          )}
        </Group>
        <Box
          sx={{
            maxHeight: maxHeight ?? rem(420),
            overflowY: "auto",
          }}
        >
          <Stack spacing={4}>
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
