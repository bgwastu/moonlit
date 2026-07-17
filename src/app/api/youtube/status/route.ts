import { after } from "next/server";
import { promises as fs } from "fs";
import { existsSync } from "fs";
import path from "path";
import { youtubeErrorCode } from "@/lib/apiError";
import { readRequestCookiesResult } from "@/lib/cookies";
import {
  enforceYouTubeStatusLimit,
  handleYoutubeGuardError,
} from "@/lib/rateLimitYouTube";
import {
  YoutubeCircuitOpenError,
  assertYoutubeCircuitClosed,
  withYoutubeCircuit,
} from "@/lib/youtubeCircuit";
import {
  extractStreamUrl,
  getYoutubeCookieSource,
  searchMusic,
  searchYouTube,
} from "@/lib/youtubei";

const DATA_DIR = path.join(process.cwd(), "data");
const STATUS_PATH = path.join(DATA_DIR, "status.json");

const PROBE_QUERY = "lofi hip hop";
const CACHE_OK_MS = 2 * 60 * 1000;
const CACHE_FAIL_MS = 45 * 1000;
/** Serve last-known Moonlit status across refreshes while fresh TTL has lapsed. */
const STALE_SERVE_MS = 30 * 60 * 1000;

type StatusPayload = {
  online: boolean;
  searchOk: boolean;
  extractOk: boolean;
  cookieSource: "user" | "system" | "none";
  persisted: boolean;
  refreshing?: boolean;
  code?: string;
  error?: string;
  retryAfter?: number;
};

type StoredStatus = Omit<StatusPayload, "persisted" | "refreshing"> & {
  checkedAt: number;
  expiresAt: number;
};

/** Prevent overlapping Moonlit background probes. */
let moonlitRevalidating = false;

function toResponsePayload(
  stored: StoredStatus,
  extras?: { refreshing?: boolean },
): StatusPayload {
  const { online, searchOk, extractOk, cookieSource, code, error, retryAfter } = stored;
  return {
    online,
    searchOk,
    extractOk,
    cookieSource,
    persisted: true,
    ...(extras?.refreshing ? { refreshing: true } : {}),
    ...(code ? { code } : {}),
    ...(error ? { error } : {}),
    ...(retryAfter !== undefined ? { retryAfter } : {}),
  };
}

async function readStatusFile(options?: {
  /** Return last-known even outside the soft stale window (rate-limit fallback). */
  allowExpired?: boolean;
}): Promise<{
  payload: StatusPayload;
  fresh: boolean;
} | null> {
  try {
    if (!existsSync(STATUS_PATH)) return null;
    const raw = await fs.readFile(STATUS_PATH, "utf-8");
    const stored = JSON.parse(raw) as StoredStatus;
    if (!stored || typeof stored.checkedAt !== "number") return null;
    if (stored.cookieSource === "user") return null;

    const now = Date.now();
    if (now < stored.expiresAt) {
      return { payload: toResponsePayload(stored), fresh: true };
    }
    if (now < stored.checkedAt + STALE_SERVE_MS || options?.allowExpired) {
      return { payload: toResponsePayload(stored), fresh: false };
    }
    return null;
  } catch {
    return null;
  }
}

async function writeStatusFile(payload: StatusPayload): Promise<void> {
  if (payload.cookieSource === "user" || !payload.persisted) return;

  const ttl = payload.online ? CACHE_OK_MS : CACHE_FAIL_MS;
  const checkedAt = Date.now();
  const stored: StoredStatus = {
    online: payload.online,
    searchOk: payload.searchOk,
    extractOk: payload.extractOk,
    cookieSource: payload.cookieSource,
    checkedAt,
    expiresAt: checkedAt + ttl,
    ...(payload.code ? { code: payload.code } : {}),
    ...(payload.error ? { error: payload.error } : {}),
    ...(payload.retryAfter !== undefined ? { retryAfter: payload.retryAfter } : {}),
  };

  if (!existsSync(DATA_DIR)) {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
  await fs.writeFile(STATUS_PATH, `${JSON.stringify(stored, null, 2)}\n`, "utf-8");
}

async function probeSearch(cookies?: string): Promise<string | null> {
  const music = await withYoutubeCircuit(() =>
    searchMusic(PROBE_QUERY, { limit: 1, cookies }),
  );
  if (music[0]?.url) return music[0].url;

  const videos = await withYoutubeCircuit(() =>
    searchYouTube(PROBE_QUERY, { limit: 1, cookies }),
  );
  return videos[0]?.url ?? null;
}

async function runProbe(
  cookies: string | undefined,
  signal?: AbortSignal,
): Promise<{
  searchOk: boolean;
  extractOk: boolean;
  errorMessage?: string;
  code?: string;
}> {
  const songUrl = await probeSearch(cookies);
  const searchOk = Boolean(songUrl);

  if (!songUrl) {
    return {
      searchOk,
      extractOk: false,
      errorMessage: "YouTube search returned no results.",
      code: "YOUTUBE_UNAVAILABLE",
    };
  }

  const stream = await withYoutubeCircuit(() =>
    extractStreamUrl(songUrl, { cookies, signal }),
  );
  const extractOk = Boolean(stream.url);
  if (!extractOk) {
    return {
      searchOk,
      extractOk,
      errorMessage: "Stream extract returned no URL.",
      code: "STREAM_UNAVAILABLE",
    };
  }

  return { searchOk, extractOk };
}

async function revalidateMoonlitStatus(): Promise<void> {
  if (moonlitRevalidating) return;
  moonlitRevalidating = true;
  try {
    assertYoutubeCircuitClosed();
    const cookieSource = await getYoutubeCookieSource(undefined);
    const result = await runProbe(undefined);
    const online = result.searchOk && result.extractOk;
    await writeStatusFile({
      online,
      searchOk: result.searchOk,
      extractOk: result.extractOk,
      cookieSource,
      persisted: true,
      ...(result.code ? { code: result.code } : {}),
      ...(result.errorMessage && !online ? { error: result.errorMessage } : {}),
    });
  } catch (error) {
    if (error instanceof YoutubeCircuitOpenError) {
      try {
        await writeStatusFile({
          online: false,
          searchOk: false,
          extractOk: false,
          cookieSource: await getYoutubeCookieSource(undefined),
          persisted: true,
          code: "YOUTUBE_UNAVAILABLE",
          error: error.message,
          retryAfter: error.retryAfterSec,
        });
      } catch {
        // ignore write failures in background
      }
      return;
    }

    const guard = handleYoutubeGuardError(error);
    if (guard) return;

    const errorMessage =
      error instanceof Error ? error.message : "YouTube status check failed.";
    console.error("[Moonlit] Background YouTube status error:", errorMessage);
    try {
      await writeStatusFile({
        online: false,
        searchOk: false,
        extractOk: false,
        cookieSource: await getYoutubeCookieSource(undefined),
        persisted: true,
        code: youtubeErrorCode(errorMessage),
        error: errorMessage,
      });
    } catch {
      // ignore write failures in background
    }
  } finally {
    moonlitRevalidating = false;
  }
}

function scheduleMoonlitRevalidate(): void {
  after(() => {
    void revalidateMoonlitStatus();
  });
}

async function respondUser(
  payload: StatusPayload,
  status = payload.online ? 200 : 503,
  headers?: HeadersInit,
): Promise<Response> {
  return Response.json({ ...payload, persisted: false }, { status, headers });
}

export async function GET(request: Request) {
  const userCookieResult = readRequestCookiesResult(request);
  const ephemeralUser =
    userCookieResult.status === "ok" || userCookieResult.status === "invalid";

  // User-cookie checks are ephemeral and never touch data/status.json.
  if (ephemeralUser) {
    if (userCookieResult.status === "invalid") {
      return respondUser({
        online: false,
        searchOk: false,
        extractOk: false,
        cookieSource: "user",
        persisted: false,
        code: "INVALID_COOKIES",
        error: userCookieResult.error,
      });
    }

    const limited = enforceYouTubeStatusLimit(request, "user");
    if (limited) {
      // Soft-block: don't hard-fail the chip; client keeps last known user status.
      return Response.json(
        {
          online: false,
          searchOk: false,
          extractOk: false,
          cookieSource: "user",
          persisted: false,
          refreshing: true,
          code: "RATE_LIMITED",
          error: "Status check rate limited. Showing last known result.",
        } satisfies StatusPayload,
        {
          status: 200,
          headers: { "Retry-After": limited.headers.get("Retry-After") || "60" },
        },
      );
    }

    const userCookies = userCookieResult.cookies;
    const cookieSource = await getYoutubeCookieSource(userCookies);
    try {
      assertYoutubeCircuitClosed();
      // Static validation already required LOGIN_INFO / __Secure-*PSID.
      // account.getInfo() is too flaky with cookies and caused false "invalid".
      const result = await runProbe(userCookies, request.signal);
      const online = result.searchOk && result.extractOk;
      return respondUser({
        online,
        searchOk: result.searchOk,
        extractOk: result.extractOk,
        cookieSource,
        persisted: false,
        ...(result.code ? { code: result.code } : {}),
        ...(result.errorMessage && !online ? { error: result.errorMessage } : {}),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return respondUser(
          {
            online: false,
            searchOk: false,
            extractOk: false,
            cookieSource,
            persisted: false,
            error: "Request cancelled",
          },
          499,
        );
      }

      const circuit = handleYoutubeGuardError(error);
      if (circuit || error instanceof YoutubeCircuitOpenError) {
        const retryAfter =
          error instanceof YoutubeCircuitOpenError
            ? error.retryAfterSec
            : Number(circuit?.headers.get("Retry-After") || "60");
        return respondUser(
          {
            online: false,
            searchOk: false,
            extractOk: false,
            cookieSource,
            persisted: false,
            code: "YOUTUBE_UNAVAILABLE",
            error:
              error instanceof Error
                ? error.message
                : "YouTube is temporarily unavailable. Please try again shortly.",
            retryAfter,
          },
          503,
          { "Retry-After": String(retryAfter) },
        );
      }

      const errorMessage =
        error instanceof Error ? error.message : "YouTube status check failed.";
      console.error("[Moonlit] YouTube user status error:", errorMessage);
      return respondUser({
        online: false,
        searchOk: false,
        extractOk: false,
        cookieSource,
        persisted: false,
        code: youtubeErrorCode(errorMessage),
        error: errorMessage,
      });
    }
  }

  // Moonlit path: return status.json immediately; re-probe in the background when stale.
  const cached = await readStatusFile();
  if (cached) {
    if (!cached.fresh) {
      scheduleMoonlitRevalidate();
    }
    return Response.json(
      {
        ...cached.payload,
        ...(cached.fresh ? {} : { refreshing: true }),
      },
      { status: cached.payload.online ? 200 : 503 },
    );
  }

  // Cold start / fully expired: probe once in-request, then keep future checks backgrounded.
  const limited = enforceYouTubeStatusLimit(request, "system");
  if (limited) {
    const expired = await readStatusFile({ allowExpired: true });
    if (expired) {
      scheduleMoonlitRevalidate();
      return Response.json(
        { ...expired.payload, refreshing: true },
        { status: expired.payload.online ? 200 : 503 },
      );
    }
    scheduleMoonlitRevalidate();
    return Response.json(
      {
        online: false,
        searchOk: false,
        extractOk: false,
        cookieSource: "system",
        persisted: false,
        refreshing: true,
        code: "RATE_LIMITED",
        error: "Status check rate limited. Refreshing in the background.",
      } satisfies StatusPayload,
      {
        status: 200,
        headers: { "Retry-After": limited.headers.get("Retry-After") || "60" },
      },
    );
  }

  const cookieSource = await getYoutubeCookieSource(undefined);
  try {
    assertYoutubeCircuitClosed();
    const result = await runProbe(undefined, request.signal);
    const online = result.searchOk && result.extractOk;
    const payload: StatusPayload = {
      online,
      searchOk: result.searchOk,
      extractOk: result.extractOk,
      cookieSource,
      persisted: true,
      ...(result.code ? { code: result.code } : {}),
      ...(result.errorMessage && !online ? { error: result.errorMessage } : {}),
    };
    await writeStatusFile(payload);
    return Response.json(payload, { status: online ? 200 : 503 });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      // Still kick a background probe for the next visitor.
      scheduleMoonlitRevalidate();
      return Response.json(
        {
          online: false,
          searchOk: false,
          extractOk: false,
          cookieSource,
          persisted: false,
          refreshing: true,
          error: "Request cancelled",
        } satisfies StatusPayload,
        { status: 499 },
      );
    }

    const retryAfter =
      error instanceof YoutubeCircuitOpenError ? error.retryAfterSec : undefined;
    const errorMessage =
      error instanceof Error ? error.message : "YouTube status check failed.";
    console.error("[Moonlit] YouTube status error:", errorMessage);

    const payload: StatusPayload = {
      online: false,
      searchOk: false,
      extractOk: false,
      cookieSource,
      persisted: true,
      code: youtubeErrorCode(errorMessage) ?? "YOUTUBE_UNAVAILABLE",
      error: errorMessage,
      ...(retryAfter !== undefined ? { retryAfter } : {}),
    };
    try {
      await writeStatusFile(payload);
    } catch {
      // ignore
    }
    return Response.json(payload, {
      status: 503,
      ...(retryAfter !== undefined
        ? { headers: { "Retry-After": String(retryAfter) } }
        : {}),
    });
  }
}
