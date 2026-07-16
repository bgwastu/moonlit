import { generateColors } from "@mantine/colors-generator";
import { type MantineThemeOverride, createTheme } from "@mantine/core";
import { Media } from "@/interfaces";
import { getPlatform } from "@/utils";

/**
 * Get the original platform URL for the current video.
 * Audio-track (YouTube Music) songs open on music.youtube.com.
 */
export function getOriginalPlatformUrl(media: Media, currentTime: number): string | null {
  if (getPlatform(media.sourceUrl) === "youtube" && media.metadata.id) {
    const realSeconds = Math.floor(currentTime);
    if (media.isAudioTrackVideo) {
      return `https://music.youtube.com/watch?v=${media.metadata.id}&t=${realSeconds}`;
    }
    return `https://www.youtube.com/watch?v=${media.metadata.id}&t=${realSeconds}s`;
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
  if (!dominantColor) return baseTheme;

  return createTheme({
    ...baseTheme,
    primaryColor: "brand",
    colors: {
      ...baseTheme.colors,
      brand: generateColors(dominantColor),
    },
  });
}

/**
 * Get semitones that correspond to a given rate (for pitch lock).
 */
export function getSemitonesFromRate(rate: number): number {
  return 12 * Math.log2(rate);
}
