import { Media } from "@/interfaces";
import { getCookiesToUse } from "@/lib/cookies";
import { getMediaProxyUrl } from "@/lib/mediaProxy";
import {
  getTikTokId,
  getYouTubeId,
  isDirectMediaURL,
  isTikTokURL,
  isYoutubeURL,
} from "@/utils";
import { getMedia, getMeta, setMedia, setMeta } from "@/utils/cache";

export interface DownloadState {
  status: "idle" | "fetching" | "downloading" | "processing" | "complete" | "error";
  percent: number;
  speed?: string;
  eta?: string;
  message?: string;
}

export async function downloadWithProgress(
  url: string,
  preload: Partial<Media["metadata"]>,
  onProgress: (state: DownloadState) => void,
  abortSignal?: AbortSignal,
  videoMode?: boolean,
  quality?: "high" | "low",
): Promise<Media> {
  // Direct MP3/MP4 links: use proxy only when different origin (avoid CORS)
  if (isDirectMediaURL(url)) {
    onProgress({ status: "complete", percent: 100 });
    const fallbackTitle =
      preload.title ||
      (() => {
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
    // Same-origin (path or same host): use URL as-is. Otherwise use proxy.
    let fileUrl: string;
    if (url.startsWith("/")) {
      fileUrl = url;
    } else if (typeof window !== "undefined") {
      try {
        const u = new URL(url);
        if (u.origin === window.location.origin) fileUrl = url;
        else fileUrl = getMediaProxyUrl(url);
      } catch {
        fileUrl = getMediaProxyUrl(url);
      }
    } else {
      fileUrl = getMediaProxyUrl(url);
    }

    const baseMeta: Media["metadata"] = {
      id: null,
      title: preload.title ?? fallbackTitle,
      author: preload.author ?? "Unknown",
      coverUrl: preload.coverUrl ?? "",
      ...(preload.artist != null && { artist: preload.artist }),
      ...(preload.album != null && { album: preload.album }),
    };

    // In browser, try to read embedded ID3 metadata from MP3 (first 128KB)
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
      } catch {
        // Keep base metadata on any error
      }
    }

    return {
      fileUrl,
      sourceUrl: url,
      metadata: baseMeta,
    };
  }

  // For backward compat with YT/TikTok, we can still try to extract IDs
  const isYouTube = isYoutubeURL(url);
  const isTikTok = isTikTokURL(url);

  let id: string | null = null;
  let prefix = "media"; // Default prefix for generic media

  if (isYouTube) {
    id = getYouTubeId(url);
    prefix = "yt";
  } else if (isTikTok) {
    id = getTikTokId(url);
    prefix = "tt";
  }

  // Check cache first
  if (id) {
    const videoKey = `${prefix}:${id}:video`;
    const audioKey = `${prefix}:${id}:audio`;

    // Check video cache first if videoMode is requested or generic check
    const cachedVideo = await getMedia(videoKey);
    if (cachedVideo) {
      const storedMeta = await getMeta<Partial<Media["metadata"]>>(`${prefix}:${id}`);
      const blobUrl = URL.createObjectURL(cachedVideo);
      onProgress({ status: "complete", percent: 100 });
      return {
        fileUrl: blobUrl,
        sourceUrl: url,
        metadata: {
          id,
          title: "",
          author: "",
          coverUrl: "",
          ...(storedMeta || {}),
          ...(preload || {}),
        },
      };
    }

    // Check audio cache
    const cachedAudio = await getMedia(audioKey);
    if (cachedAudio) {
      const storedMeta = await getMeta<Partial<Media["metadata"]>>(`${prefix}:${id}`);
      const audioUrl = URL.createObjectURL(cachedAudio);
      onProgress({ status: "complete", percent: 100 });
      return {
        fileUrl: audioUrl,
        sourceUrl: url,
        metadata: {
          id,
          title: "",
          author: "",
          coverUrl: "",
          ...(storedMeta || {}),
          ...(preload || {}),
        },
      };
    }
  }

  onProgress({
    status: "fetching",
    percent: 0,
    message: "Fetching video info...",
  });

  // Get cookies based on user preference
  const { cookies } = await getCookiesToUse();

  // Unified Download Path (SSE)
  return new Promise((resolve, reject) => {
    const controller = new AbortController();

    // Link external abort signal if provided
    if (abortSignal) {
      abortSignal.addEventListener("abort", () => controller.abort());
    }

    fetch("/api/media/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, cookies, videoMode, quality }),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to start download");
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const decoder = new TextDecoder();
        let buffer = "";

        const processStream = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Process complete SSE messages
            const lines = buffer.split("\n\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));

                  switch (data.type) {
                    case "status":
                      onProgress({
                        status: "fetching",
                        percent: 0,
                        message: data.message,
                      });
                      break;

                    case "progress":
                      onProgress({
                        status:
                          data.status === "processing" ? "processing" : "downloading",
                        percent: data.percent || 0,
                        speed: data.speed,
                        eta: data.eta,
                        message: data.message,
                      });
                      break;

                    case "complete":
                      onProgress({
                        status: "processing",
                        percent: 100,
                        message: "Finalizing download...",
                      });

                      // Yield to allow UI update
                      await new Promise((resolve) => setTimeout(resolve, 100));

                      onProgress({ status: "complete", percent: 100 });

                      let blob: Blob;

                      if (data.downloadUrl) {
                        onProgress({
                          status: "processing",
                          percent: 100,
                          message: "Downloading media file...",
                        });

                        const res = await fetch(data.downloadUrl);
                        if (!res.ok) throw new Error("Failed to retrieve media file");
                        blob = await res.blob();

                        // Set correct type if provided
                        if (data.contentType) {
                          blob = new Blob([blob], { type: data.contentType });
                        }
                      } else if (data.data) {
                        // Legacy base64 support
                        const binaryString = atob(data.data);
                        const bytes = new Uint8Array(binaryString.length);
                        for (let i = 0; i < binaryString.length; i++) {
                          bytes[i] = binaryString.charCodeAt(i);
                        }
                        blob = new Blob([bytes], {
                          type: data.contentType,
                        });
                      } else {
                        throw new Error("No media data received");
                      }
                      const blobUrl = URL.createObjectURL(blob);

                      // Use preload metadata from server-side

                      // Cache the media
                      if (id) {
                        const cacheKey = data.videoMode
                          ? `${prefix}:${id}:video`
                          : `${prefix}:${id}:audio`;
                        setMedia(cacheKey, blob).catch(() => {});
                        setMeta(`${prefix}:${id}`, {
                          id: id || "unknown",
                          title: preload.title || "",
                          author: preload.author || "",
                          ...(preload.artist != null && { artist: preload.artist }),
                          ...(preload.album != null && { album: preload.album }),
                          coverUrl: preload.coverUrl || "",
                        }).catch(() => {});
                      }

                      resolve({
                        fileUrl: blobUrl,
                        sourceUrl: url,
                        metadata: {
                          id: id || "unknown",
                          title: preload.title || "",
                          author: preload.author || "",
                          ...(preload.artist != null && { artist: preload.artist }),
                          ...(preload.album != null && { album: preload.album }),
                          coverUrl: preload.coverUrl || "",
                        },
                      });
                      return;

                    case "error":
                      reject(new Error(data.message));
                      return;
                  }
                } catch (e) {
                  if (
                    e instanceof Error &&
                    (e.message.includes("Failed to retrieve") ||
                      e.message.includes("No media data"))
                  ) {
                    reject(e);
                    return;
                  }
                  console.error("Failed to parse SSE message or process download:", e);
                  reject(e);
                  return;
                }
              }
            }
          }
        };

        processStream().catch(reject);
      })
      .catch((err) => {
        if (err.name === "AbortError") {
          return; // Ignore abort errors
        }
        reject(err);
      });
  });
}
