import { generateColors } from "@mantine/colors-generator";
import { MantineThemeOverride } from "@mantine/core";
import { Media } from "@/interfaces";
import { getPlatform } from "@/utils";

/**
 * Get the original platform URL for the current video.
 */
export function getOriginalPlatformUrl(media: Media, currentTime: number): string | null {
  if (getPlatform(media.sourceUrl) === "youtube" && media.metadata.id) {
    const realSeconds = Math.floor(currentTime);
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
 * Get semitones that correspond to a given rate (for pitch lock).
 */
export function getSemitonesFromRate(rate: number): number {
  return 12 * Math.log2(rate);
}
