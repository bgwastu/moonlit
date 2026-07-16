"use client";

import {
  Badge,
  Box,
  Center,
  Flex,
  Image,
  Paper,
  Text,
  rem,
  useMantineTheme,
} from "@mantine/core";
import { IconMusic } from "@tabler/icons-react";

export interface MediaResultItem {
  id: string;
  title: string;
  author: string;
  thumbnail: string;
  lengthSeconds?: number;
  isLive?: boolean;
  /** Right-side meta (e.g. relative time for history). */
  metaRight?: string;
}

function formatDuration(seconds: number) {
  if (!seconds) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
    : `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function accent(t: ReturnType<typeof useMantineTheme>, shade: number) {
  const key = t.primaryColor;
  return (t.colors[key] ?? t.colors.violet)[shade];
}

interface MediaResultRowProps {
  item: MediaResultItem;
  onClick: () => void;
  compact?: boolean;
}

export default function MediaResultRow({
  item,
  onClick,
  compact = false,
}: MediaResultRowProps) {
  const theme = useMantineTheme();
  const thumbW = compact ? 72 : 100;
  const thumbH = compact ? 48 : 60;
  const durationLabel = item.isLive
    ? "LIVE"
    : item.lengthSeconds
      ? formatDuration(item.lengthSeconds)
      : "";

  return (
    <Paper
      component="button"
      type="button"
      p={6}
      radius="sm"
      onClick={onClick}
      sx={(th) => ({
        display: "block",
        width: "100%",
        textAlign: "left",
        textDecoration: "none",
        color: "inherit",
        cursor: "pointer",
        backgroundColor: th.fn.rgba(th.colors.dark[9], 0.36),
        border: `${rem(1)} solid transparent`,
        transition: "border-color 150ms ease, background-color 150ms ease",
        "&:hover": {
          borderColor: th.fn.rgba(accent(th, 5), 0.45),
          backgroundColor: th.fn.rgba(th.colors.dark[8], 0.5),
        },
        "&:focus-visible": {
          outline: `${rem(2)} solid ${accent(th, 5)}`,
          outlineOffset: rem(2),
        },
      })}
    >
      <Flex gap="sm" align="center">
        <Box pos="relative" sx={{ flexShrink: 0 }}>
          <Image
            src={item.thumbnail || undefined}
            alt=""
            width={thumbW}
            height={thumbH}
            radius="sm"
            fit="cover"
            withPlaceholder
            placeholder={
              <Center h="100%">
                <IconMusic size={22} />
              </Center>
            }
          />
          {durationLabel ? (
            <Badge
              pos="absolute"
              right={6}
              bottom={6}
              color={item.isLive ? "red" : "dark"}
              variant="filled"
              radius="sm"
              size="sm"
            >
              {durationLabel}
            </Badge>
          ) : null}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Text color="white" weight={600} size={compact ? "sm" : "md"} lineClamp={2}>
            {item.title}
          </Text>
          <Text color="dimmed" size="sm" mt={4} lineClamp={1}>
            {item.author}
          </Text>
        </Box>
        {item.metaRight ? (
          <Text size="xs" color="dimmed" style={{ flexShrink: 0 }}>
            {item.metaRight}
          </Text>
        ) : null}
      </Flex>
    </Paper>
  );
}
