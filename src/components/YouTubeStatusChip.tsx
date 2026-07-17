"use client";

import { useEffect, useState } from "react";
import { Badge, Box, Group, Loader, Stack, Text, Tooltip } from "@mantine/core";
import { IconCheck, IconX } from "@tabler/icons-react";
import {
  COOKIES_CHANGED_EVENT,
  cookieRequestHeaders,
  getUserCookies,
  isCustomCookiesEnabled,
  validateCookies,
} from "@/lib/cookies";

type ProbeState = "idle" | "checking" | "online" | "offline";

type StatusResponse = {
  online: boolean;
  searchOk: boolean;
  extractOk: boolean;
  cookieSource?: "user" | "system" | "none";
  persisted?: boolean;
  refreshing?: boolean;
  code?: string;
  error?: string;
};

const POLL_MS = 3 * 60 * 1000;
const USER_LAZY_MS = 1_200;
const MOONLIT_MIN_INTERVAL_MS = 15_000;
const USER_MIN_INTERVAL_MS = 60_000;
const MOONLIT_CACHE_KEY = "moonlit-yt-status-moonlit";

function lineContent(
  label: string,
  state: ProbeState,
  data: StatusResponse | null,
): string {
  if (state === "idle") return `${label}: off`;
  if (state === "checking") return `${label}: checking…`;
  if (!data) return `${label}: unknown`;

  if (data.code === "RATE_LIMITED" && data.refreshing) {
    if (state === "online") return `${label}: online`;
    if (state === "offline") return `${label}: offline`;
    return `${label}: checking…`;
  }

  if (data.code === "INVALID_COOKIES") return `${label}: invalid`;
  if (data.online) return `${label}: online`;
  return `${label}: offline`;
}

function StatusRow({
  label,
  state,
  data,
  active,
  loading,
}: {
  label: string;
  state: ProbeState;
  data: StatusResponse | null;
  active: boolean;
  loading: boolean;
}) {
  const text = lineContent(label, state, data);
  const showLoader = loading || state === "checking" || Boolean(data?.refreshing);
  const isError =
    !showLoader && !active && (state === "offline" || data?.code === "INVALID_COOKIES");

  return (
    <Group gap={6} wrap="nowrap" align="center">
      <Box
        w={14}
        h={14}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {showLoader ? (
          <Loader size={10} color="gray" />
        ) : active ? (
          <IconCheck size={12} stroke={2.5} />
        ) : isError ? (
          <IconX size={12} stroke={2.5} />
        ) : null}
      </Box>
      <Text size="xs" style={{ lineHeight: 1.3 }}>
        {text}
      </Text>
    </Group>
  );
}

function keepKnownState(prev: ProbeState): ProbeState {
  return prev === "online" || prev === "offline" ? prev : "checking";
}

function readMoonlitCache(): StatusResponse | null {
  try {
    const raw = sessionStorage.getItem(MOONLIT_CACHE_KEY);
    if (!raw) return null;
    const body = JSON.parse(raw) as StatusResponse;
    return typeof body.online === "boolean" ? body : null;
  } catch {
    return null;
  }
}

function writeMoonlitCache(body: StatusResponse): void {
  try {
    sessionStorage.setItem(MOONLIT_CACHE_KEY, JSON.stringify(body));
  } catch {
    // ignore quota / private mode
  }
}

async function fetchStatus(
  signal: AbortSignal,
  withUserCookies: boolean,
): Promise<StatusResponse | null> {
  let headers: HeadersInit = {};
  if (withUserCookies) {
    try {
      headers = cookieRequestHeaders();
    } catch {
      return null;
    }
  }

  const res = await fetch("/api/youtube/status", { headers, signal });
  const body = (await res.json()) as StatusResponse & { code?: string };
  if (typeof body.online !== "boolean") return null;
  if (body.code === "RATE_LIMITED") return { ...body, refreshing: true };
  return body;
}

function stateFromCache(cache: StatusResponse | null): ProbeState {
  if (!cache) return "checking";
  return cache.online ? "online" : "offline";
}

export default function YouTubeStatusChip() {
  const [moonlitState, setMoonlitState] = useState<ProbeState>("checking");
  const [moonlitData, setMoonlitData] = useState<StatusResponse | null>(null);
  const [moonlitLoading, setMoonlitLoading] = useState(true);
  const [userState, setUserState] = useState<ProbeState>("idle");
  const [userData, setUserData] = useState<StatusResponse | null>(null);
  const [userLoading, setUserLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const cached = readMoonlitCache();
    if (cached) {
      queueMicrotask(() => {
        if (cancelled) return;
        setMoonlitData(cached);
        setMoonlitState(stateFromCache(cached));
      });
    }

    let moonlitController: AbortController | null = null;
    let userController: AbortController | null = null;
    let userTimer: number | undefined;
    let lastMoonlitAt = 0;
    let lastUserAt = 0;

    const runMoonlit = (force = false) => {
      const now = Date.now();
      if (!force && now - lastMoonlitAt < MOONLIT_MIN_INTERVAL_MS) return;
      lastMoonlitAt = now;

      moonlitController?.abort();
      const controller = new AbortController();
      moonlitController = controller;
      setMoonlitLoading(true);

      fetchStatus(controller.signal, false)
        .then((body) => {
          if (cancelled || controller.signal.aborted) return;
          setMoonlitLoading(false);
          if (!body) {
            setMoonlitState(keepKnownState);
            return;
          }
          if (body.code === "RATE_LIMITED") {
            setMoonlitData((prev) => (prev ? { ...prev, refreshing: true } : body));
            setMoonlitState(keepKnownState);
            return;
          }
          writeMoonlitCache(body);
          setMoonlitData(body);
          setMoonlitState(body.online ? "online" : "offline");
        })
        .catch((error: unknown) => {
          if (cancelled || controller.signal.aborted) return;
          if (error instanceof DOMException && error.name === "AbortError") return;
          setMoonlitLoading(false);
          setMoonlitState(keepKnownState);
        });
    };

    const runUser = (force = false) => {
      window.clearTimeout(userTimer);
      userController?.abort();

      const rawUserCookies = getUserCookies();
      const enabled = isCustomCookiesEnabled() && rawUserCookies.trim().length > 0;

      if (!enabled) {
        setUserLoading(false);
        setUserState("idle");
        setUserData(null);
        return;
      }

      const validation = validateCookies(rawUserCookies);
      if (!validation.valid) {
        setUserLoading(false);
        setUserData({
          online: false,
          searchOk: false,
          extractOk: false,
          cookieSource: "user",
          code: "INVALID_COOKIES",
          error: validation.error || "Invalid YouTube cookies.",
        });
        setUserState("offline");
        return;
      }

      const delay = force ? 0 : USER_LAZY_MS;
      if (force) {
        setUserState("checking");
        setUserLoading(true);
      }

      userTimer = window.setTimeout(() => {
        if (cancelled) return;

        const now = Date.now();
        if (!force && now - lastUserAt < USER_MIN_INTERVAL_MS) return;
        lastUserAt = now;

        const controller = new AbortController();
        userController = controller;
        setUserLoading(true);
        setUserState((prev) =>
          prev === "online" || prev === "offline" ? prev : "checking",
        );

        fetchStatus(controller.signal, true)
          .then((body) => {
            if (cancelled || controller.signal.aborted) return;
            setUserLoading(false);
            if (!body) {
              setUserState(keepKnownState);
              return;
            }
            if (body.code === "RATE_LIMITED") {
              setUserData((prev) => (prev ? { ...prev, refreshing: true } : null));
              setUserState(keepKnownState);
              return;
            }
            // Ignore Moonlit/system payloads accidentally returned without user cookies.
            if (body.cookieSource !== "user") {
              setUserData({
                online: false,
                searchOk: false,
                extractOk: false,
                cookieSource: "user",
                code: "INVALID_COOKIES",
                error: "User cookies were not applied to the status check.",
              });
              setUserState("offline");
              return;
            }
            setUserData(body);
            setUserState(body.online ? "online" : "offline");
          })
          .catch((error: unknown) => {
            if (cancelled || controller.signal.aborted) return;
            if (error instanceof DOMException && error.name === "AbortError") return;
            setUserLoading(false);
            setUserState(keepKnownState);
          });
      }, delay);
    };

    const runAll = (force = false) => {
      runMoonlit(force);
      runUser(force);
    };

    const onFocus = () => runAll(false);
    const onCookiesChanged = () => runAll(true);

    runAll(true);
    const id = window.setInterval(() => runAll(false), POLL_MS);
    window.addEventListener("focus", onFocus);
    window.addEventListener(COOKIES_CHANGED_EVENT, onCookiesChanged);

    return () => {
      cancelled = true;
      moonlitController?.abort();
      userController?.abort();
      window.clearTimeout(userTimer);
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(COOKIES_CHANGED_EVENT, onCookiesChanged);
    };
  }, []);

  const usingMoonlitFallback = userState === "offline" && moonlitState === "online";
  const activeState: ProbeState = (() => {
    if (userState === "online") return "online";
    if (usingMoonlitFallback) return "online";
    if (userState === "offline")
      return moonlitState === "checking" ? "checking" : "offline";
    return moonlitState;
  })();

  const moonlitActive = userState === "idle" || usingMoonlitFallback;
  const userActive = userState === "online";

  const color = usingMoonlitFallback
    ? "yellow"
    : activeState === "online"
      ? "teal"
      : activeState === "offline"
        ? "red"
        : "gray";
  const badgeLoading =
    activeState === "checking" ||
    (moonlitLoading && moonlitState === "checking") ||
    (userLoading && userState === "checking");
  const label = usingMoonlitFallback
    ? "Fallback"
    : activeState === "online"
      ? "Online"
      : activeState === "offline"
        ? "Offline"
        : "Loading";

  const moonlitText = lineContent("Moonlit cookies", moonlitState, moonlitData);
  const userText = lineContent("Your cookies", userState, userData);
  const activeLabel = userActive
    ? "Your cookies"
    : moonlitActive
      ? usingMoonlitFallback
        ? "Moonlit cookies (fallback)"
        : "Moonlit cookies"
      : null;
  const aria = [moonlitText, userText, activeLabel ? `Selected ${activeLabel}` : null]
    .filter(Boolean)
    .join(". ");

  return (
    <Tooltip
      withArrow
      multiline
      maw={320}
      label={
        <Stack gap={4}>
          <StatusRow
            label="Moonlit cookies"
            state={moonlitState}
            data={moonlitData}
            active={moonlitActive}
            loading={moonlitLoading}
          />
          <StatusRow
            label="Your cookies"
            state={userState}
            data={userData}
            active={userActive}
            loading={userLoading}
          />
        </Stack>
      }
    >
      <Badge
        size="sm"
        variant="light"
        color={color}
        style={{ flexShrink: 0, cursor: "default" }}
        aria-label={aria}
        leftSection={badgeLoading ? <Loader size={10} color="gray" /> : undefined}
      >
        {label}
      </Badge>
    </Tooltip>
  );
}
