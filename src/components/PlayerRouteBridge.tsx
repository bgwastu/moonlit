"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import LoadingOverlay from "@/components/LoadingOverlay";
import { useAppContext } from "@/context/AppContext";
import { playerPathForMedia, softReplaceUrl } from "@/lib/playerNavigation";
import { ensureYouTubeLinkMeta } from "@/lib/youtubeOembed";
import { getYouTubeId, isDirectMediaURL, isYoutubeURL } from "@/utils";

/**
 * Deep-link / rewrite entry for /player and /watch.
 * Hands the URL to the layout PlayerHost, then soft-lands on Home underneath
 * while keeping a shareable /watch URL in the address bar.
 */
export default function PlayerRouteBridge({ url }: { url?: string }) {
  const { openPlayer, media } = useAppContext();
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      if (url && (isDirectMediaURL(url) || isYoutubeURL(url))) {
        if (isYoutubeURL(url)) {
          const id = getYouTubeId(url);
          if (id) await ensureYouTubeLinkMeta(id);
        }
        // syncUrl false — router.replace("/") would stomp a soft /watch path.
        openPlayer({ url, expand: true, syncUrl: false });
        router.replace("/");
        // Re-apply shareable URL after Next lands on Home.
        const path = playerPathForMedia(url, null);
        requestAnimationFrame(() => softReplaceUrl(path));
        return;
      }

      if (media) {
        openPlayer({ media, expand: true, syncUrl: false });
        const path = playerPathForMedia(null, media);
        router.replace("/");
        requestAnimationFrame(() => softReplaceUrl(path));
        return;
      }

      router.replace("/");
    })();
  }, [url, openPlayer, router, media]);

  return (
    <div style={{ position: "relative", height: "100dvh" }}>
      <LoadingOverlay visible message="Loading player..." />
    </div>
  );
}
