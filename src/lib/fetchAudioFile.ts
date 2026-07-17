import { parseApiError } from "@/lib/apiError";
import { STREAM_CHUNK_BYTES } from "@/lib/streamConstants";

/** Fetch an audio URL as ArrayBuffer, preferring ranged downloads with progress. */
export async function fetchAudioFile(
  url: string,
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const chunkSize = STREAM_CHUNK_BYTES;
  const firstEnd = chunkSize - 1;
  const firstResponse = await fetch(url, {
    headers: { Range: `bytes=0-${firstEnd}` },
    signal,
  });
  if (!firstResponse.ok) {
    throw new Error(await parseApiError(firstResponse));
  }

  // Some upstreams ignore Range and return the complete file. Use that response
  // directly rather than concatenating duplicate full-file responses.
  if (firstResponse.status === 200) {
    const total = Number(firstResponse.headers.get("content-length")) || 0;
    const buffer = await firstResponse.arrayBuffer();
    onProgress?.(buffer.byteLength, total || buffer.byteLength);
    return buffer;
  }

  const firstRange = firstResponse.headers.get("content-range");
  const firstMatch = firstRange?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
  if (!firstMatch || Number(firstMatch[1]) !== 0) {
    throw new Error("Audio server returned an invalid byte range");
  }

  const total = Number(firstMatch[3]);
  const merged = new Uint8Array(total);
  const firstBuffer = new Uint8Array(await firstResponse.arrayBuffer());
  const firstEndActual = Number(firstMatch[2]);
  if (firstBuffer.byteLength !== firstEndActual + 1) {
    throw new Error("Audio server returned incomplete byte range");
  }
  merged.set(firstBuffer, 0);
  let loaded = firstBuffer.byteLength;
  onProgress?.(loaded, total);

  if (loaded >= total) return merged.buffer;

  let nextStart = loaded;
  const worker = async () => {
    for (;;) {
      const start = nextStart;
      if (start >= total) return;
      nextStart = Math.min(start + chunkSize, total);
      const end = nextStart - 1;
      const response = await fetch(url, {
        headers: { Range: `bytes=${start}-${end}` },
        signal,
      });
      if (response.status !== 206) {
        throw new Error(await parseApiError(response));
      }
      const range = response.headers.get("content-range");
      const match = range?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
      if (!match || Number(match[1]) !== start || Number(match[2]) !== end) {
        throw new Error("Audio server returned an unexpected byte range");
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength !== end - start + 1 || Number(match[3]) !== total) {
        throw new Error("Audio server returned an incomplete byte range");
      }
      merged.set(bytes, start);
      loaded += bytes.byteLength;
      onProgress?.(loaded, total);
    }
  };

  await Promise.all(Array.from({ length: 4 }, () => worker()));
  return merged.buffer;
}
