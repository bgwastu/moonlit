import { Metadata } from "next";
import InitialPlayer from "@/components/InitialPlayer";
import { isDirectMediaURL, isTikTokURL, isYoutubeURL } from "@/utils";

type SearchParams = { [key: string]: string | string[] | undefined };

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const params = await searchParams;
  const url = params.url as string;

  if (!url) return { title: "Moonlit Player" };
  if (isDirectMediaURL(url)) {
    return { title: "Local File - Moonlit" };
  }
  if (isTikTokURL(url)) return { title: "TikTok Video - Moonlit" };
  if (isYoutubeURL(url)) return { title: "YouTube Video - Moonlit" };

  return { title: "Moonlit Player" };
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const url = params.url as string;

  if (!url) return <InitialPlayer />;

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

  if (isYoutubeURL(url) || isTikTokURL(url)) {
    return <InitialPlayer url={url} metadata={{}} />;
  }

  throw new Error("Invalid URL provided");
}
