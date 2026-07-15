import { ErrorBoundary } from "@/components/ErrorBoundary";
import PlayerRouteBridge from "@/components/PlayerRouteBridge";
import { isDirectMediaURL, isYoutubeURL } from "@/utils";

type SearchParams = { [key: string]: string | string[] | undefined };

export const metadata = {
  title: { absolute: "Moonlit" },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const url = params.url as string | undefined;

  if (!url) {
    return (
      <ErrorBoundary>
        <PlayerRouteBridge />
      </ErrorBoundary>
    );
  }

  if (isDirectMediaURL(url) || isYoutubeURL(url)) {
    return (
      <ErrorBoundary>
        <PlayerRouteBridge url={url} />
      </ErrorBoundary>
    );
  }

  throw new Error("Invalid URL provided");
}
