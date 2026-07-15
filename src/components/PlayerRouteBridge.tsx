"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import LoadingOverlay from "@/components/LoadingOverlay";
import { useAppContext } from "@/context/AppContext";
import { isDirectMediaURL, isYoutubeURL } from "@/utils";

/**
 * Deep-link / rewrite entry for /player and /watch.
 * Hands the URL to the layout PlayerHost, then soft-lands on Home underneath.
 */
export default function PlayerRouteBridge({ url }: { url?: string }) {
  const { openPlayer, media } = useAppContext();
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (url && (isDirectMediaURL(url) || isYoutubeURL(url))) {
      openPlayer({ url, expand: true, syncUrl: true });
      router.replace("/");
      return;
    }

    if (media) {
      openPlayer({ media, expand: true, syncUrl: false });
    }
    router.replace("/");
  }, [url, openPlayer, router, media]);

  return (
    <div style={{ position: "relative", height: "100dvh" }}>
      <LoadingOverlay visible message="Loading player..." />
    </div>
  );
}
