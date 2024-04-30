import ytdl from "ytdl-core";
import ShortsPage from "./ShortsPage";

type Props = {
  params: { id: string };
  searchParams: { [key: string]: string | string[] | undefined };
};

export async function generateMetadata({ params }: Props) {
  const id = params.id;

  const info = await ytdl.getBasicInfo(id);
  return {
    title: info.videoDetails.title + " - Moonlit",
    description: "Play music with Slowed+Reverb & Nightcore effects.",
    // TODO: add pretty og image
  };
}

export default function Page({ params }: Props) {
  // TODO: pass the url to the page, so it can fetch the song immediately
  return <ShortsPage id={params.id} />;
}
