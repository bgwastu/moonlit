"use client";

import { Badge, Loader, Tooltip } from "@mantine/core";
import { useYouTubeStatus } from "@/context/YouTubeStatusContext";

export default function YouTubeStatusChip() {
  const { status, checking, localOnly, refresh } = useYouTubeStatus();

  const online = !localOnly && status.state === "healthy";
  const label = online ? "Online" : localOnly ? "Offline" : "Checking";
  const color = online ? "teal" : localOnly ? "red" : "gray";
  const detail = online
    ? "YouTube is working."
    : localOnly
      ? status.error || "YouTube can't be reached right now."
      : "Checking YouTube.";

  return (
    <Tooltip
      withArrow
      multiline
      maw={280}
      events={{ hover: true, focus: true, touch: true }}
      label={localOnly ? `${detail} Click to try again.` : detail}
    >
      <Badge
        size="sm"
        variant="light"
        color={color}
        component="button"
        type="button"
        style={{ flexShrink: 0, cursor: "pointer", border: "none" }}
        onClick={refresh}
        aria-label={`YouTube ${label.toLowerCase()}. ${detail}`}
        leftSection={checking && !online ? <Loader size={10} color="gray" /> : undefined}
      >
        {label}
      </Badge>
    </Tooltip>
  );
}
