import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Player } from "@/components/Player";
import { isDirectMediaURL, isYoutubeURL } from "@/utils";

type SearchParams = { [key: string]: string | string[] | undefined };

export const metadata = {
  title: "Moonlit",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const url = params.url as string;

  if (!url)
    return (
      <ErrorBoundary>
        <Player />
      </ErrorBoundary>
    );

  if (isDirectMediaURL(url) || isYoutubeURL(url)) {
    return (
      <ErrorBoundary>
        <Player url={url} />
      </ErrorBoundary>
    );
  }

  throw new Error("Invalid URL provided");
}
