import { Metadata } from "next";
import InitialPlayer from "@/components/InitialPlayer";
import LocalInitialPlayer from "@/components/LocalInitialPlayer";
import { readId3FromPublicPath } from "@/lib/id3Server";
import { getVideoInfo, hasSystemCookies } from "@/lib/yt-dlp";
import { isDirectMediaURL, isTikTokURL, isYoutubeURL } from "@/utils";

type SearchParams = { [key: string]: string | string[] | undefined };

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const params = await searchParams;
  const url = params.url as string;

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
    if (hasSystemCookies()) {
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
          twitter: {
            card: "summary_large_image",
            title,
            description,
            images: [imageUrl],
          },
        };
      } catch {
        /* yt-dlp metadata unavailable — return basic title */
      }
    }
    return { title: isTikTokURL(url) ? "TikTok Video - Moonlit" : "Moonlit Player" };
  }

  return { title: "Moonlit Player" };
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const url = params.url as string;

  // Local File Player (No URL)
  if (!url) {
    return <LocalInitialPlayer />;
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

  // YouTube and TikTok metadata is resolved by the client download stream so this
  // page can render immediately instead of blocking on yt-dlp during SSR.
  if (isYoutubeURL(url) || isTikTokURL(url)) {
    return <InitialPlayer url={url} metadata={{}} />;
  }

  throw new Error("Invalid URL provided");
}
