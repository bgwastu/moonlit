"use client";

import type { CSSProperties } from "react";
import { Badge, Box, Flex, Paper, Text, rgba, useMantineTheme } from "@mantine/core";
import CoverFallback from "@/components/CoverFallback";
import ShimmerImage from "@/components/ShimmerImage";
import { useStableCoverUrl } from "@/hooks/useStableCoverUrl";
import { toDisplayCoverUrl } from "@/lib/mergePlayerMedia";
import { SEARCH_ACCENT_VAR } from "@/lib/theme";
import { getYouTubeId } from "@/utils";

export interface MediaResultItem {
  id: string;
  title: string;
  author: string;
  thumbnail: string;
  /** Present for saved songs so their on-device artwork can be used offline. */
  sourceUrl?: string;
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
  // Match player cover aspect (1:1)
  const thumbW = compact ? 56 : 64;
  const thumbH = thumbW;
  const durationLabel = item.isLive
    ? "LIVE"
    : item.lengthSeconds
      ? formatDuration(item.lengthSeconds)
      : "";
  const ytId = getYouTubeId(item.id) ?? (/^[\w-]{11}$/.test(item.id) ? item.id : null);
  const thumbSrc = toDisplayCoverUrl(item.thumbnail || undefined, ytId);
  const cachedThumb = useStableCoverUrl(
    item.sourceUrl ? thumbSrc : undefined,
    item.sourceUrl,
    { cacheOnly: true },
  );

  return (
    <Paper
      component="button"
      type="button"
      p={6}
      radius="sm"
      onClick={onClick}
      className="moonlit-media-row moonlit-focusable"
      style={
        {
          display: "block",
          width: "100%",
          textAlign: "left",
          textDecoration: "none",
          color: "inherit",
          cursor: "pointer",
          backgroundColor: rgba(theme.colors.dark[9], 0.36),
          border: "1px solid transparent",
          transition: "border-color 150ms ease, background-color 150ms ease",
          [SEARCH_ACCENT_VAR]: accent(theme, 5),
        } as CSSProperties
      }
    >
      <Flex gap="sm" align="center">
        <Box pos="relative" style={{ flexShrink: 0 }}>
          <ShimmerImage
            src={cachedThumb || thumbSrc || undefined}
            fallback={
              <CoverFallback
                seed={ytId || item.sourceUrl || item.id}
                title={item.title}
                artist={item.author}
              />
            }
            alt=""
            w={thumbW}
            h={thumbH}
            radius="sm"
            fit="cover"
            wrapperStyle={{ width: thumbW, height: thumbH }}
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
        <Box style={{ minWidth: 0, flex: 1 }}>
          <Text c="white" fw={600} size={compact ? "sm" : "md"} lineClamp={2}>
            {item.title}
          </Text>
          <Text c="dimmed" size="sm" mt={4} lineClamp={1}>
            {item.author}
          </Text>
        </Box>
        {item.metaRight ? (
          <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
            {item.metaRight}
          </Text>
        ) : null}
      </Flex>
    </Paper>
  );
}
