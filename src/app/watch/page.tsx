import ytdl from "ytdl-core";
import WatchPage from "./WatchPage";
import { isYoutubeURL } from "@/utils";
import { notFound } from "next/navigation";
import { Metadata } from "next";

type Props = {
  params: { id: string };
  searchParams: { [key: string]: string | string[] | undefined };
};

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const id = searchParams.v as string;

  if (!isYoutubeURL("https://youtube.com/watch?v=" + id)) {
    notFound();
  }

  const info = await ytdl.getBasicInfo(id);
  return {
    title: info.videoDetails.title + " - Moonlit",
    description: "Play music with Slowed+Reverb & Nightcore effects.",
    twitter: {
      title: info.videoDetails.title + " - Moonlit",
      description: "Play music with Slowed+Reverb & Nightcore effects.",
    },
    // TODO: add pretty og image
  };
}

export default function Page({ searchParams }: Props) {
  const id = searchParams.v as string;
  if (!isYoutubeURL("https://youtube.com/watch?v=" + id)) {
    notFound();
  }

  // TODO: pass the url to the page, so it can fetch the song immediately
  return <WatchPage id={id} />;
}
