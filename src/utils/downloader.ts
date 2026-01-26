import { Song } from "@/interfaces";
import { getCookiesToUse } from "@/lib/cookies";
import { getYouTubeId } from "@/utils";
import { getMedia, getMeta, setMedia, setMeta } from "@/utils/cache";

export interface DownloadState {
  status:
    | "idle"
    | "fetching"
    | "downloading"
    | "processing"
    | "complete"
    | "error";
  percent: number;
  speed?: string;
  eta?: string;
  message?: string;
}

export async function downloadWithProgress(
  url: string,
  preload: Partial<Song["metadata"]>,
  onProgress: (state: DownloadState) => void,
  abortSignal?: AbortSignal,
  videoMode?: boolean,
  quality?: "high" | "low",
): Promise<Song> {
  const id = getYouTubeId(url);

  // Check cache first
  if (id) {
    const videoKey = `yt:${id}:video`;
    const audioKey = `yt:${id}:audio`;
    const cachedVideo = await getMedia(videoKey);
    if (cachedVideo) {
      const storedMeta = await getMeta<Partial<Song["metadata"]>>(`yt:${id}`);
      const blobUrl = URL.createObjectURL(cachedVideo);
      onProgress({ status: "complete", percent: 100 });
      return {
        fileUrl: blobUrl,
        videoUrl: blobUrl,
        metadata: {
          id,
          title: "Loading...",
          author: "Loading...",
          coverUrl: "",
          platform: "youtube",
          ...(storedMeta || {}),
          ...(preload || {}),
        },
      };
    }
    const cachedAudio = await getMedia(audioKey);
    if (cachedAudio) {
      const storedMeta = await getMeta<Partial<Song["metadata"]>>(`yt:${id}`);
      const audioUrl = URL.createObjectURL(cachedAudio);
      onProgress({ status: "complete", percent: 100 });
      return {
        fileUrl: audioUrl,
        metadata: {
          id,
          title: "Loading...",
          author: "Loading...",
          coverUrl: "",
          platform: "youtube",
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

  return new Promise((resolve, reject) => {
    const controller = new AbortController();

    // Link external abort signal if provided
    if (abortSignal) {
      abortSignal.addEventListener("abort", () => controller.abort());
    }

    fetch("/api/yt/stream", {
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

                    case "metadata":
                      // Update metadata but keep downloading
                      break;

                    case "progress":
                      onProgress({
                        status:
                          data.status === "processing"
                            ? "processing"
                            : "downloading",
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
                        if (!res.ok)
                          throw new Error("Failed to retrieve media file");
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

                      const metadata = {
                        id: getYouTubeId(url),
                        title: data.title,
                        author: data.author,
                        coverUrl: data.thumbnail,
                        platform: "youtube" as const,
                      };

                      // Cache the media
                      if (metadata.id) {
                        const cacheKey = data.videoMode
                          ? `yt:${metadata.id}:video`
                          : `yt:${metadata.id}:audio`;
                        setMedia(cacheKey, blob).catch(() => {});
                        setMeta(`yt:${metadata.id}`, metadata).catch(() => {});
                      }

                      resolve({
                        fileUrl: blobUrl,
                        videoUrl: data.videoMode ? blobUrl : undefined,
                        metadata,
                      });
                      return;

                    case "error":
                      reject(new Error(data.message));
                      return;
                  }
                } catch (e) {
                  console.error("Failed to parse SSE message:", e);
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
