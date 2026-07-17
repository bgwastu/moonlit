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
import { historyItemSourceUrl, resolveCachedMedia } from "@/lib/playFromCache";
import { stashSearchMeta } from "@/lib/searchMeta";
import { getYouTubeId, timeAgo } from "@/utils";

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
  const { history, clearHistory, openPlayer } = useAppContext();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const theme = useMantineTheme();

  const handlePlay = async (item: HistoryItem) => {
    onPlay?.();

    const url = historyItemSourceUrl(item);
    const playUrl = url ?? item.sourceUrl;
    if (!playUrl) return;

    const ytId = getYouTubeId(playUrl) ?? item.metadata?.id;
    if (ytId) stashSearchMeta(String(ytId), item.metadata);

    const cached = await resolveCachedMedia(item);
    if (cached) {
      // Pass url for YouTube so embed id resolves; IDB stays audio-only.
      // Normalize sourceUrl to playUrl so Player same-source checks keep the shell.
      openPlayer({
        media: { ...cached, sourceUrl: playUrl },
        url: playUrl,
        expand: true,
        autoPlay: true,
      });
      return;
    }

    // Seed titles/cover so extract/cache cannot flash Unknown + YT hqdefault.
    openPlayer({
      url: playUrl,
      media: {
        fileUrl: "",
        sourceUrl: playUrl,
        metadata: { ...item.metadata },
        ...(item.isAudioTrackVideo ? { isAudioTrackVideo: true } : {}),
      },
      expand: true,
      autoPlay: true,
    });
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
          This removes all recent plays and cached audio from this device. It cannot be
          undone.
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={() => setConfirmOpen(false)}>
            Cancel
          </Button>
          <Button
            color="red"
            onClick={() => {
              void clearHistory().finally(() => setConfirmOpen(false));
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
                  onClick={() => void handlePlay(item)}
                />
              );
            })}
          </Stack>
        </Box>
      </Stack>
    </>
  );
}
