import { generateColors } from "@mantine/colors-generator";
import { MantineThemeOverride } from "@mantine/core";
import { Song } from "@/interfaces";

/**
 * Get the original platform URL for the current video.
 */
export function getOriginalPlatformUrl(song: Song, currentTime: number): string | null {
  if (song.metadata.platform === "youtube" && song.metadata.id) {
    const realSeconds = Math.floor(currentTime);
    return `https://www.youtube.com/watch?v=${song.metadata.id}&t=${realSeconds}s`;
  }
  if (song.metadata.platform === "tiktok" && song.metadata.id) {
    const currentUrl = typeof window !== "undefined" ? window.location.pathname : "";
    const match = currentUrl.match(/\/(@[^/]+)\/video\/(\d+)/);
    if (match) {
      const [, creator, videoId] = match;
      return `https://www.tiktok.com/${creator}/video/${videoId}`;
    }
  }
  return null;
}

/**
 * Create a dynamic theme based on the dominant color.
 */
export function createDynamicTheme(
  dominantColor: string,
  baseTheme: MantineThemeOverride,
): MantineThemeOverride {
  if (dominantColor === "rgba(0,0,0,0)") return baseTheme;

  return {
    ...baseTheme,
    primaryColor: "brand",
    colors: {
      ...baseTheme.colors,
      brand: generateColors(dominantColor) as any,
    },
  };
}

/**
 * Calculate effective playback rate combining speed and pitch.
 */
export function getEffectiveRate(rate: number, semitones: number): number {
  return rate * Math.pow(2, semitones / 12);
}

/**
 * Get high-resolution cover URL.
 */
export function getHighResCoverUrl(coverUrl: string, platform?: string): string {
  if (!coverUrl) return coverUrl;
  if (platform === "youtube") {
    return coverUrl.replace(/(hq|mq|sd)?default/, "maxresdefault");
  }
  return coverUrl;
}

/**
 * Get semitones that correspond to a given rate (for pitch lock).
 */
export function getSemitonesFromRate(rate: number): number {
  return 12 * Math.log2(rate);
}
