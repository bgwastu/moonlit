import { Metadata } from "next";
import InitialPlayer from "@/components/InitialPlayer";
import { readId3FromPublicPath } from "@/lib/id3Server";
import { fetchYoutubeDetails } from "@/lib/youtube";
import { getVideoInfo } from "@/lib/yt-dlp";
import {
  getYouTubeId,
  isDirectMediaURL,
  isTikTokURL,
  isYoutubeURL,
  parseISO8601Duration,
} from "@/utils";

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

  if (isDirectMediaURL(url)) {
    const pathname = url.startsWith("/") ? url : new URL(url).pathname;
    const fallbackName =
      decodeURIComponent(pathname.split("/").pop() || "").replace(
        /\.(mp3|m4a|mp4|webm|ogg|wav)$/i,
        "",
      ) || "Direct media";
    const id3 = url.startsWith("/") ? readId3FromPublicPath(pathname) : null;
    const title = id3?.title || fallbackName;
    const description =
      id3?.artist || id3?.album
        ? `Listen to "${title}"${id3?.artist ? ` by ${id3.artist}` : ""}${id3?.album ? ` from ${id3.album}` : ""} on Moonlit.`
        : undefined;
    return {
      title: `${title} - Moonlit`,
      ...(description && { description }),
    };
  }

  if (isYoutubeURL(url) || isTikTokURL(url)) {
    try {
      const info = await getVideoInfo(url);
      const title = `${info.title} - Moonlit`;
      const description =
        info.artist || info.author
          ? `Listen to "${info.title}"${info.artist ? ` by ${info.artist}` : ""}${info.album ? ` from ${info.album}` : ""} on Moonlit.`
          : `Watch "${info.title}" on Moonlit.`;
      const imageUrl = `https://moonlit.wastu.net/api/og?title=${encodeURIComponent(
        info.title,
      )}&cover=${encodeURIComponent(info.thumbnail)}`;

      return {
        title,
        description,
        openGraph: { title, description, type: "website", images: [{ url: imageUrl }] },
        twitter: { card: "summary_large_image", title, description, images: [imageUrl] },
      };
    } catch {
      if (isYoutubeURL(url)) {
        const id = getYouTubeId(url);
        if (id) {
          try {
            const videoDetails = await fetchYoutubeDetails(id);
            const title = `${videoDetails.title} - Moonlit`;
            return { title };
          } catch {
            // ignore
          }
        }
      }
      return { title: isTikTokURL(url) ? "TikTok Video - Moonlit" : "Moonlit Player" };
    }
  }

  return { title: "Moonlit Player" };
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const url = searchParams.url as string;

  // Local File Player (No URL)
  if (!url) {
    return <InitialPlayer isLocalFile />;
  }

  // Direct MP3/MP4: use URL as source, minimal metadata
  if (isDirectMediaURL(url)) {
    const pathname = url.startsWith("/") ? url : new URL(url).pathname;
    const name = pathname.split("/").pop() || "";
    const title =
      decodeURIComponent(name).replace(/\.(mp3|m4a|mp4|webm|ogg|wav)$/i, "") ||
      "Direct media";
    return (
      <InitialPlayer url={url} metadata={{ title, author: "Unknown", coverUrl: "" }} />
    );
  }

  // YouTube and TikTok: use getVideoInfo for metadata (includes music: title, artist, album)
  if (isYoutubeURL(url) || isTikTokURL(url)) {
    try {
      const info = await getVideoInfo(url);
      const metadata: Parameters<typeof InitialPlayer>[0]["metadata"] = {
        title: info.title,
        author: info.author,
        coverUrl: info.thumbnail,
      };
      if (info.artist) metadata.artist = info.artist;
      if (info.album) metadata.album = info.album;

      return (
        <InitialPlayer url={url} metadata={metadata} duration={info.lengthSeconds} />
      );
    } catch (e) {
      if (isYoutubeURL(url)) {
        const id = getYouTubeId(url);
        if (id) {
          try {
            const details = await fetchYoutubeDetails(id);
            const duration = parseISO8601Duration(details.duration);
            return (
              <InitialPlayer
                url={url}
                metadata={{
                  title: details.title,
                  author: details.channelTitle,
                  coverUrl: details.thumbnails.default.url,
                }}
                duration={duration}
              />
            );
          } catch {
            // fallthrough
          }
        }
        throw new Error(`Video not found or private (YouTube)`);
      }
      console.error("Metadata fetch error:", e);
      return <InitialPlayer url={url} metadata={{}} />;
    }
  }

  throw new Error("Invalid URL provided");
}
