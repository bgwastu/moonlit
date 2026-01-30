"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Text,
  TextInput,
  useMantineTheme,
} from "@mantine/core";
import { IconCheck, IconMusic, IconSearch } from "@tabler/icons-react";
import { useLyricsSearch } from "@/hooks/useLyricsSearch";
import { LyricsSearchRecord } from "@/lib/lyrics";
import { getFormattedTime } from "@/utils";

interface LyricsSearchModalProps {
  opened: boolean;
  onClose: () => void;
  initialSearchQuery: string;
  trackDurationSeconds: number;
  currentLyricsId: number | null;
  onSelectLyrics: (lyrics: LyricsSearchRecord) => void;
}

export default function LyricsSearchModal({
  opened,
  onClose,
  initialSearchQuery,
  trackDurationSeconds,
  currentLyricsId,
  onSelectLyrics,
}: LyricsSearchModalProps) {
  const theme = useMantineTheme();
  const primaryColor = theme.colors[theme.primaryColor]?.[6] ?? theme.colors.blue[6];
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const { results, state, error, search } = useLyricsSearch();

  useEffect(() => {
    if (opened) {
      setSearchQuery(initialSearchQuery);
    }
  }, [opened, initialSearchQuery]);

  const handleSearch = useCallback(() => {
    if (searchQuery.trim()) {
      search({ q: searchQuery.trim() });
    }
  }, [searchQuery, search]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSearch();
      }
    },
    [handleSearch],
  );

  // Filter out results without synced lyrics, then sort by duration match
  const filteredAndSortedResults = useMemo(() => {
    return results
      .filter((r) => !!r.syncedLyrics)
      .sort((a, b) => {
        const aDiff = Math.abs((a.duration || 0) - trackDurationSeconds);
        const bDiff = Math.abs((b.duration || 0) - trackDurationSeconds);
        const aMatches = aDiff <= 1;
        const bMatches = bDiff <= 1;
        if (aMatches && !bMatches) return -1;
        if (!aMatches && bMatches) return 1;
        return aDiff - bDiff;
      });
  }, [results, trackDurationSeconds]);

  const formatDuration = (seconds: number) => getFormattedTime(seconds);

  const isDurationMatch = (recordDuration: number) =>
    Math.abs(recordDuration - trackDurationSeconds) <= 1;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Select Lyrics"
      size="lg"
      centered
      styles={{
        title: { fontWeight: 600 },
      }}
    >
      {/* Search Section */}
      <Box mb="md">
        <Flex gap="sm">
          <TextInput
            placeholder="Search by song title, artist..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            style={{ flex: 1 }}
          />
          <Button
            onClick={handleSearch}
            loading={state === "loading"}
            leftIcon={<IconSearch size={16} />}
          >
            Search
          </Button>
        </Flex>
        {error && (
          <Text size="xs" c="red" mt="xs">
            {error}
          </Text>
        )}
      </Box>

      {/* Results */}
      <ScrollArea h={350}>
        {state === "loading" && (
          <Flex justify="center" align="center" h={280} gap="xs">
            <Loader size="sm" />
            <Text size="sm" c="dimmed">
              Searching for lyrics...
            </Text>
          </Flex>
        )}
        {state === "ready" && filteredAndSortedResults.length === 0 && (
          <Flex justify="center" align="center" h={280} direction="column" gap="sm">
            <IconMusic size={48} style={{ opacity: 0.3 }} />
            <Text c="dimmed" size="sm">
              No synced lyrics found
            </Text>
            <Text c="dimmed" size="xs">
              Try different search terms
            </Text>
          </Flex>
        )}
        {state === "ready" && filteredAndSortedResults.length > 0 && (
          <Box>
            {filteredAndSortedResults.map((record) => {
              const isMatch = isDurationMatch(record.duration);
              const isSelected = record.id === currentLyricsId;

              return (
                <Box
                  key={record.id}
                  p="sm"
                  mb="xs"
                  style={{
                    borderRadius: 8,
                    backgroundColor: isSelected
                      ? `color-mix(in srgb, ${primaryColor} 15%, transparent)`
                      : "rgba(255, 255, 255, 0.05)",
                    border: isSelected
                      ? `1px solid color-mix(in srgb, ${primaryColor} 50%, transparent)`
                      : "1px solid transparent",
                    cursor: "pointer",
                    transition: "background-color 0.15s ease",
                  }}
                  onClick={() => {
                    onSelectLyrics(record);
                    onClose();
                  }}
                >
                  <Flex justify="space-between" align="start">
                    <Box style={{ flex: 1 }}>
                      <Flex align="center" gap="xs" mb={4}>
                        <Text size="sm" fw={600} lineClamp={1}>
                          {record.trackName}
                        </Text>
                        {isSelected && (
                          <IconCheck size={16} style={{ color: primaryColor }} />
                        )}
                      </Flex>
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {record.artistName}
                        {record.albumName && ` · ${record.albumName}`}
                      </Text>
                    </Box>
                    <Group spacing={4}>
                      <Badge
                        size="sm"
                        color={isMatch ? theme.primaryColor : "gray"}
                        variant={isMatch ? "filled" : "outline"}
                      >
                        {formatDuration(record.duration)}
                      </Badge>
                    </Group>
                  </Flex>
                </Box>
              );
            })}
          </Box>
        )}
        {state === "idle" && (
          <Flex justify="center" align="center" h={280} direction="column" gap="md">
            <IconSearch size={48} style={{ opacity: 0.3 }} />
            <Box style={{ textAlign: "center" }}>
              <Text c="dimmed" size="sm" mb={4}>
                Search for lyrics by song title or artist
              </Text>
              <Text c="dimmed" size="xs">
                Track duration: {formatDuration(trackDurationSeconds)}
              </Text>
            </Box>
          </Flex>
        )}
      </ScrollArea>
    </Modal>
  );
}
