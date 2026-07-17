/** In-memory decoded AudioBuffer cache for stretch mode (max 2 entries). */

const decodedAudioCache = new Map<string, AudioBuffer>();
const MAX_DECODED_AUDIO_CACHE_ENTRIES = 2;

export function getDecodedAudio(fileUrl: string): AudioBuffer | undefined {
  return decodedAudioCache.get(fileUrl);
}

export function setDecodedAudio(fileUrl: string, buffer: AudioBuffer): void {
  decodedAudioCache.set(fileUrl, buffer);
  while (decodedAudioCache.size > MAX_DECODED_AUDIO_CACHE_ENTRIES) {
    const oldestKey = decodedAudioCache.keys().next().value;
    if (oldestKey === undefined) break;
    decodedAudioCache.delete(oldestKey);
  }
}
