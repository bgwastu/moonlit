import { LocalFilePlayer } from "@/components/LocalFilePlayer";
import UnifiedPlayer from "@/components/UnifiedPlayer";
import { getVideoInfo } from "@/lib/yt-dlp";
import { fetchYoutubeDetails } from "@/lib/youtube";
import {
  getYouTubeId,
  isTikTokURL,
  isYoutubeURL,
  parseISO8601Duration,
} from "@/utils";
import { Metadata } from "next";
import { notFound } from "next/navigation";

type SearchParams = { [key: string]: string | string[] | undefined };

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const url = searchParams.url as string;

  if (!url) {
    return { title: "Moonlit Player" };
  }

  // YouTube Metadata
  if (isYoutubeURL(url)) {
    const id = getYouTubeId(url);
    if (!id) return { title: "Moonlit" };

    try {
      const videoDetails = await fetchYoutubeDetails(id);
      const isShorts = url.includes("/shorts/");
      const title = `${videoDetails.title} - Moonlit${isShorts ? " Shorts" : ""}`;
      const description = `Watch "${videoDetails.title}" by ${videoDetails.channelTitle} with customizable slowed and nightcore effects on Moonlit.`;

      const imageUrl = isShorts
        ? `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`
        : `https://moonlit.wastu.net/api/og?title=${encodeURIComponent(
            videoDetails.title,
          )}&cover=${encodeURIComponent(
            videoDetails.thumbnails.maxres?.url ||
              videoDetails.thumbnails.high?.url ||
              videoDetails.thumbnails.default.url,
          )}`;

      return {
        title,
        description,
        openGraph: {
          title,
          description,
          type: isShorts ? "video.other" : "website",
          images: [{ url: imageUrl }],
        },
        twitter: {
          card: "summary_large_image",
          title,
          description,
          images: [imageUrl],
        },
      };
    } catch {
      return { title: "Moonlit" };
    }
  }

  // TikTok Metadata
  if (isTikTokURL(url)) {
    try {
      // Use yt-dlp for TikTok metadata (Server Side)
      const info = await getVideoInfo(url);
      const title = `${info.title} - Moonlit`;

      return {
        title,
        description: `Watch tiktok by ${info.author} on Moonlit.`,
        openGraph: {
          title,
          images: [{ url: info.thumbnail }],
        },
      };
    } catch {
      return { title: "TikTok Video - Moonlit" };
    }
  }

  return { title: "Moonlit Player" };
}

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const url = searchParams.url as string;

  // Local File Player (No URL)
  if (!url) {
    return <LocalFilePlayer />;
  }

  // YouTube
  if (isYoutubeURL(url)) {
    const id = getYouTubeId(url);
    if (!id) notFound();

    try {
      const metadata = await fetchYoutubeDetails(id);
      const duration = parseISO8601Duration(metadata.duration);

      return (
        <UnifiedPlayer
          url={url}
          metadata={{
            title: metadata.title,
            author: metadata.channelTitle,
            coverUrl: metadata.thumbnails.default.url,
          }}
          duration={duration}
        />
      );
    } catch {
      // Don't show custom error div, throw so error.tsx handles it
      throw new Error(`Video not found or private (YouTube)`);
    }
  }

  // TikTok
  if (isTikTokURL(url)) {
    try {
      const info = await getVideoInfo(url);

      return (
        <UnifiedPlayer
          url={url}
          metadata={{
            title: info.title,
            author: info.author,
            coverUrl: info.thumbnail,
          }}
          duration={info.lengthSeconds}
        />
      );
    } catch (e) {
      console.error("TikTok metadata fetch error:", e);
      // Fallback: Return player with minimal metadata - stream will provide actual data
      return (
        <UnifiedPlayer
          url={url}
          metadata={{
            platform: "tiktok",
          }}
        />
      );
    }
  }

  // Fallback / Invalid URL
  throw new Error("Invalid URL provided");
}
