"use client";

import {
  type CSSProperties,
  type ReactNode,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  Box,
  Image,
  type MantineBreakpoint,
  type MantineRadius,
  type MantineTheme,
  rgba,
  useMantineTheme,
} from "@mantine/core";
import CoverFallback from "@/components/CoverFallback";

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
  fallback?: ReactNode;
  /** Keep the shimmer visible over the bitmap while another resource loads. */
  forceShimmer?: boolean;
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

/** Reset image lifecycle when the resource changes, including after a failed load. */
export default function ShimmerImage(props: ShimmerImageProps) {
  return (
    <ShimmerImageResource
      key={`${props.src || ""}\n${props.fallbackSrc || ""}`}
      {...props}
    />
  );
}

function ShimmerImageResource({
  src,
  alt = "",
  style,
  wrapperStyle,
  radius,
  fallbackSrc,
  fallback,
  forceShimmer = false,
  onLoad,
  onError,
  visibleFrom,
  hiddenFrom,
  w,
  h,
  width,
  height,
  ...rest
}: ShimmerImageProps) {
  const theme = useMantineTheme();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const imageSrc = usingFallback ? fallbackSrc : src;
  const failedCover = !imageSrc || failed;
  const showShimmer = !failed && (forceShimmer || (Boolean(imageSrc) && !loaded));
  const borderRadius = resolveRadius(radius, theme);
  const boxW = w ?? width ?? wrapperStyle?.width;
  const boxH = h ?? height ?? wrapperStyle?.height;

  const handleLoad = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) => {
      setLoaded(true);
      onLoad?.(event);
    },
    [onLoad],
  );

  const markFailed = useCallback(() => {
    setLoaded(false);
    if (fallbackSrc && fallbackSrc !== src && !usingFallback) setUsingFallback(true);
    else setFailed(true);
  }, [fallbackSrc, src, usingFallback]);

  const handleError = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) => {
      markFailed();
      onError?.(event);
    },
    [markFailed, onError],
  );

  useEffect(() => {
    if (!imageSrc || loaded || failed) return;
    const timeout = setTimeout(markFailed, 15000);
    return () => clearTimeout(timeout);
  }, [imageSrc, loaded, failed, markFailed]);

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
      data-cover-state={failedCover ? "fallback" : loaded ? "loaded" : "loading"}
      style={{
        overflow: "hidden",
        borderRadius,
        width: boxW,
        height: boxH,
        flexShrink: 0,
        ...wrapperStyle,
      }}
    >
      {failedCover ? (
        <Box
          style={{
            ...style,
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
          }}
        >
          {fallback ?? <CoverFallback title={alt} />}
        </Box>
      ) : (
        <Image
          key={imageSrc}
          src={imageSrc}
          alt={alt}
          radius={radius}
          w={w}
          h={h}
          width={width}
          height={height}
          style={{
            ...style,
            opacity: loaded ? (Number.isFinite(targetOpacity) ? targetOpacity : 1) : 0,
            transition: style?.transition ?? "opacity 0.2s ease-out",
          }}
          onLoad={handleLoad}
          onError={handleError}
          {...rest}
        />
      )}
      {showShimmer && (
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
      )}
    </Box>
  );
}
