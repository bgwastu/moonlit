"use client";

import { Badge, Loader, Stack, Text, Tooltip } from "@mantine/core";
import { useYouTubeStatus } from "@/context/YouTubeStatusContext";

const capabilityLabel = (state?: string) =>
  state === "healthy" ? "Working" : state === "degraded" ? "Unavailable" : "Not verified";

export default function YouTubeStatusChip() {
  const { status, checking: loading, localOnly, refresh } = useYouTubeStatus();

  const state = status.state;
  const label = localOnly
    ? "Local music"
    : state === "healthy"
      ? "Online"
      : state === "degraded"
        ? "Degraded"
        : state === "offline"
          ? "Offline"
          : loading
            ? "Checking"
            : "Unverified";
  const color = localOnly
    ? "violet"
    : state === "healthy"
      ? "teal"
      : state === "degraded"
        ? "yellow"
        : state === "offline"
          ? "red"
          : "gray";
  const search = capabilityLabel(status.capabilities?.search?.state);
  const playback = capabilityLabel(status.capabilities?.playback?.state);
  const account =
    status.cookieSource === "user"
      ? "Your account"
      : status.cookieSource === "system"
        ? "Server account"
        : "Public playback";

  return (
    <Tooltip
      withArrow
      multiline
      maw={340}
      events={{ hover: true, focus: true, touch: true }}
      label={
        <Stack gap={4}>
          <Text size="xs">{account}</Text>
          <Text size="xs">Search: {search}</Text>
          <Text size="xs">Playback: {playback}</Text>
          {status.error && <Text size="xs">{status.error}</Text>}
          {status.lastItemError && <Text size="xs">{status.lastItemError.error}</Text>}
        </Stack>
      }
    >
      <Badge
        size="sm"
        variant="light"
        color={color}
        component="button"
        type="button"
        style={{ flexShrink: 0, cursor: "pointer", border: "none" }}
        onClick={refresh}
        aria-label={`YouTube ${localOnly ? "unavailable. Local music mode" : label}. Search: ${search}. Playback: ${playback}.`}
        leftSection={
          loading && state === "unknown" ? <Loader size={10} color="gray" /> : undefined
        }
      >
        {label}
      </Badge>
    </Tooltip>
  );
}
