"use client";

import { type CSSProperties, type SyntheticEvent, useCallback, useState } from "react";
import {
  Box,
  Image,
  type MantineBreakpoint,
  type MantineRadius,
  type MantineTheme,
  rgba,
  useMantineTheme,
} from "@mantine/core";

type ShimmerImageProps = {
  src?: string;
  alt?: string;
  w?: number | string;
  h?: number | string;
  width?: number | string;
  height?: number | string;
  radius?: MantineRadius;
  fit?: CSSProperties["objectFit"];
  style?: CSSProperties;
  wrapperStyle?: CSSProperties;
  visibleFrom?: MantineBreakpoint;
  hiddenFrom?: MantineBreakpoint;
  fallbackSrc?: string;
  onLoad?: (event: SyntheticEvent<HTMLImageElement>) => void;
  onError?: (event: SyntheticEvent<HTMLImageElement>) => void;
};

function resolveRadius(
  radius: MantineRadius | undefined,
  theme: MantineTheme,
): string | number | undefined {
  if (radius == null) return undefined;
  if (typeof radius === "number") return radius;
  if (radius in theme.radius) {
    return theme.radius[radius as keyof typeof theme.radius];
  }
  return radius;
}

/**
 * Mantine Image with a soft shimmer until the bitmap has painted.
 * Resets whenever `src` changes.
 */
export default function ShimmerImage({
  src,
  alt = "",
  style,
  wrapperStyle,
  radius,
  onLoad,
  onError,
  visibleFrom,
  hiddenFrom,
  ...rest
}: ShimmerImageProps) {
  const theme = useMantineTheme();
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const loaded = Boolean(src) && loadedSrc === src;
  const borderRadius = resolveRadius(radius, theme);

  const handleLoad = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) => {
      setLoadedSrc(src || null);
      onLoad?.(event);
    },
    [onLoad, src],
  );

  const handleError = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) => {
      setLoadedSrc(src || null);
      onError?.(event);
    },
    [onError, src],
  );

  if (!src) {
    return (
      <Image
        src={src}
        alt={alt}
        radius={radius}
        style={style}
        visibleFrom={visibleFrom}
        hiddenFrom={hiddenFrom}
        {...rest}
      />
    );
  }

  const targetOpacity =
    typeof style?.opacity === "number"
      ? style.opacity
      : typeof style?.opacity === "string"
        ? Number(style.opacity)
        : 1;

  return (
    <Box
      pos="relative"
      visibleFrom={visibleFrom}
      hiddenFrom={hiddenFrom}
      style={{
        overflow: "hidden",
        borderRadius,
        ...wrapperStyle,
      }}
    >
      {!loaded ? (
        <Box
          className="moonlit-shimmer"
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            overflow: "hidden",
            borderRadius,
            backgroundColor: rgba(theme.colors.dark[5], 0.55),
            pointerEvents: "none",
          }}
        />
      ) : null}
      <Image
        src={src}
        alt={alt}
        radius={radius}
        style={{
          ...style,
          opacity: loaded ? (Number.isFinite(targetOpacity) ? targetOpacity : 1) : 0,
          transition: style?.transition ?? "opacity 0.2s ease-out",
        }}
        onLoad={handleLoad}
        onError={handleError}
        {...rest}
      />
    </Box>
  );
}
