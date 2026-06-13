import { Media } from "@/interfaces";
import { getCookiesToUse } from "@/lib/cookies";
import { getYouTubeId, isDirectMediaURL, isYoutubeURL } from "@/utils";

export interface StreamState {
  status: "idle" | "extracting" | "ready" | "error";
  message?: string;
}

function buildMetadata(
  id: string | null,
  fallback: Partial<Media["metadata"]> = {},
): Media["metadata"] {
  return {
    id,
    title: fallback.title || "Unknown",
    author: fallback.author || "Unknown",
    ...(fallback.artist != null && { artist: fallback.artist }),
    ...(fallback.album != null && { album: fallback.album }),
    coverUrl: fallback.coverUrl || "",
  };
}

export async function streamWithProgress(
  url: string,
  onState: (state: StreamState) => void,
  abortSignal?: AbortSignal,
): Promise<Media> {
  if (isDirectMediaURL(url)) {
    onState({ status: "ready" });
    const fallbackTitle = (() => {
      try {
        const pathname = url.startsWith("/") ? url : new URL(url, "https://a").pathname;
        const name = pathname.split("/").pop() || "";
        return (
          decodeURIComponent(name).replace(/\.(mp3|m4a|mp4|webm|ogg|wav)$/i, "") ||
          "Unknown"
        );
      } catch {
        return "Unknown";
      }
    })();

    let fileUrl: string;
    if (url.startsWith("/")) {
      fileUrl = url;
    } else if (typeof window !== "undefined") {
      try {
        const u = new URL(url);
        fileUrl = u.origin === window.location.origin ? url : url;
      } catch {
        fileUrl = url;
      }
    } else {
      fileUrl = url;
    }

    const baseMeta = buildMetadata(null, { title: fallbackTitle });

    if (
      typeof window !== "undefined" &&
      /\.mp3(\?|$)/i.test(url.startsWith("/") ? url : new URL(url).pathname)
    ) {
      try {
        const resolvedUrl = fileUrl.startsWith("/")
          ? `${window.location.origin}${fileUrl}`
          : fileUrl;
        const res = await fetch(resolvedUrl, {
          headers: { Range: "bytes=0-131071" },
          signal: abortSignal,
        });
        if (res.ok && res.body) {
          const buf = new Uint8Array(await res.arrayBuffer());
          const parse = (await import("id3-parser")).default;
          const tags = parse(buf);
          if (tags && typeof tags === "object") {
            let coverUrl = baseMeta.coverUrl;
            if (tags.image?.data) {
              const blob = new Blob([new Uint8Array(tags.image.data)], {
                type: tags.image.mime || "image/jpeg",
              });
              coverUrl = URL.createObjectURL(blob);
            }
            return {
              fileUrl,
              sourceUrl: url,
              metadata: {
                ...baseMeta,
                title: (tags.title as string)?.trim() || baseMeta.title,
                author: (tags.artist as string)?.trim() || baseMeta.author,
                ...((tags.artist as string)?.trim() && {
                  artist: (tags.artist as string).trim(),
                }),
                ...((tags.album as string)?.trim() && {
                  album: (tags.album as string).trim(),
                }),
                coverUrl,
              },
            };
          }
        }
      } catch {}
    }

    return {
      fileUrl,
      sourceUrl: url,
      metadata: baseMeta,
    };
  }

  const isYouTube = isYoutubeURL(url);

  onState({ status: "extracting", message: "Extracting stream..." });

  const { cookies } = getCookiesToUse();

  const res = await fetch("/api/stream/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, cookies }),
    signal: abortSignal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Extract failed (${res.status})`);
  }

  const data = await res.json();

  const streamUrl = `/api/stream/${data.token}`;

  let id: string | null = null;
  if (isYouTube) id = getYouTubeId(url);

  const resolvedMetadata = buildMetadata(id || "unknown", {
    title: data.metadata?.title || "",
    author: data.metadata?.author || "",
    artist: data.metadata?.artist,
    album: data.metadata?.album,
    coverUrl: data.metadata?.coverUrl || "",
  });

  onState({ status: "ready" });

  return {
    fileUrl: streamUrl,
    sourceUrl: url,
    metadata: resolvedMetadata,
  };
}
