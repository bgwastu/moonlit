import InitialPlayer from "@/components/InitialPlayer";
import { isYoutubeURL } from "@/utils";
import { Metadata } from "next";
import { notFound } from "next/navigation";

type Props = {
  params: { id: string };
  searchParams: { [key: string]: string | string[] | undefined };
};

async function fetchVideoDetails(id: string) {
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?id=${id}&part=snippet&key=${process.env.YOUTUBE_API_KEY}`
  );
  const data = await response.json();
  if (!response.ok || !data.items || data.items.length === 0) {
    throw new Error("Video not found");
  }
  return data.items[0].snippet;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = params.id;

  if (!isYoutubeURL("https://youtube.com/shorts/" + id)) {
    notFound();
  }

  const videoDetails = await fetchVideoDetails(id);
  const title = `${videoDetails.title} - Moonlit Shorts`;
  const description = `Watch "${videoDetails.title}" by ${videoDetails.channelTitle} with customizable slowed and nightcore effects on Moonlit.`;
  const imageUrl = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
  const url = `https://moonlit.wastu.net/shorts/${id}`;

  return {
    title,
    description,
    keywords: ["slowed music", "nightcore", "youtube shorts", videoDetails.title, videoDetails.channelTitle],
    authors: [{ name: "Moonlit" }],
    creator: "Moonlit",
    publisher: "Moonlit",
    openGraph: {
      title,
      description,
      url,
      siteName: "Moonlit",
      type: "video.other",
      locale: "en_US",
      images: [
        {
          url: imageUrl,
          width: 1280,
          height: 720,
          alt: `${videoDetails.title} - ${videoDetails.channelTitle}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      creator: "@moonlitapp",
      site: "@moonlitapp",
      images: [imageUrl],
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function Page({ params }: Props) {
  const id = params.id;
  if (!isYoutubeURL("https://youtube.com/shorts/" + id)) {
    notFound();
  }
  const metadata = await fetchVideoDetails(id);

  return (
    <InitialPlayer
      youtubeId={id}
      isShorts={true}
      metadata={{
        title: metadata.title,
        author: metadata.channelTitle,
        coverUrl: metadata.thumbnails.default.url,
      }}
    />
  );
}
