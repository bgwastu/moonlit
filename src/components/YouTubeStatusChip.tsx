"use client";

import { useEffect, useState } from "react";
import { Badge, Loader, Stack, Text, Tooltip } from "@mantine/core";
import { COOKIES_CHANGED_EVENT, cookieRequestHeaders } from "@/lib/cookies";
import { YOUTUBE_STATUS_CHANGED_EVENT } from "@/lib/youtubeStatus";

type Capability = {
  state: "healthy" | "degraded" | "unknown";
  checkedAt: number;
  expiresAt: number;
};
type Status = {
  state: "healthy" | "degraded" | "offline" | "unknown";
  online: boolean;
  expiresAt: number;
  cookieSource?: "none" | "user" | "system";
  capabilities?: { search: Capability; playback: Capability };
  error?: string;
  lastItemError?: { error: string };
};

const unknown = (): Status => ({ state: "unknown", online: false, expiresAt: 0 });

const capabilityLabel = (state?: string) =>
  state === "healthy" ? "Working" : state === "degraded" ? "Unavailable" : "Not verified";

export default function YouTubeStatusChip() {
  const [status, setStatus] = useState<Status>(unknown);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let stopped = false;
    let controller: AbortController;
    let expiryTimer: number;
    let lastAt = 0;
    const refresh = async (force = false) => {
      if (!force && Date.now() - lastAt < 5000) return;
      lastAt = Date.now();
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      setLoading(true);
      try {
        const response = await fetch("/api/youtube/status", {
          headers: cookieRequestHeaders(),
          cache: "no-store",
          signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
        });
        if (!response.ok) throw new Error("Could not verify YouTube status.");
        const next = (await response.json()) as Status;
        if (stopped || signal.aborted) return;
        window.clearTimeout(expiryTimer);
        setStatus(next.expiresAt > Date.now() ? next : unknown());
        expiryTimer = window.setTimeout(
          () => setStatus(unknown()),
          Math.max(0, next.expiresAt - Date.now()),
        );
      } catch (error) {
        if (stopped || signal.aborted) return;
        setStatus({ ...unknown(), error: "Could not verify playback availability." });
      } finally {
        if (!stopped && !signal.aborted) setLoading(false);
      }
    };
    const changed = () => {
      setStatus(unknown());
      void refresh(true);
    };
    const focused = () => void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 10000);
    window.addEventListener("focus", focused);
    window.addEventListener(COOKIES_CHANGED_EVENT, changed);
    window.addEventListener(YOUTUBE_STATUS_CHANGED_EVENT, changed);
    void refresh(true);
    return () => {
      stopped = true;
      controller?.abort();
      window.clearInterval(interval);
      window.clearTimeout(expiryTimer);
      window.removeEventListener("focus", focused);
      window.removeEventListener(COOKIES_CHANGED_EVENT, changed);
      window.removeEventListener(YOUTUBE_STATUS_CHANGED_EVENT, changed);
    };
  }, []);

  const state = status.state;
  const label =
    state === "healthy"
      ? "Online"
      : state === "degraded"
        ? "Degraded"
        : state === "offline"
          ? "Offline"
          : loading
            ? "Checking"
            : "Unverified";
  const color =
    state === "healthy"
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
        aria-label={`YouTube ${label}. Search: ${search}. Playback: ${playback}.`}
        leftSection={
          loading && state === "unknown" ? <Loader size={10} color="gray" /> : undefined
        }
      >
        {label}
      </Badge>
    </Tooltip>
  );
}
