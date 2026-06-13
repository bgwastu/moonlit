import { Metadata } from "next";
import { Player } from "@/components/Player";
import { isDirectMediaURL, isYoutubeURL } from "@/utils";

type SearchParams = { [key: string]: string | string[] | undefined };

export const metadata: Metadata = {
  title: "Moonlit Player",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const url = params.url as string;

  if (!url) return <Player />;

  if (isDirectMediaURL(url) || isYoutubeURL(url)) {
    return <Player url={url} />;
  }

  throw new Error("Invalid URL provided");
}
