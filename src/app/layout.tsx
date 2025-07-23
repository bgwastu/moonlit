import { Metadata } from "next";
import LayoutWrapper from "./LayoutWrapper";

export const metadata: Metadata = {
  title: "Moonlit - Slowed & Nightcore Music Player",
  description:
    "Transform your music experience with customizable playback speed. Play YouTube and TikTok videos with slowed or nightcore effects in real-time.",
  keywords: ["slowed music", "nightcore", "youtube player", "tiktok player", "music remix", "audio effects"],
  authors: [{ name: "Moonlit" }],
  creator: "Moonlit",
  publisher: "Moonlit",
  openGraph: {
    title: "Moonlit - Slowed & Nightcore Music Player",
    description: "Transform your music experience with customizable playback speed. Play YouTube and TikTok videos with slowed or nightcore effects in real-time.",
    url: "https://moonlit.wastu.net",
    siteName: "Moonlit",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Moonlit - Slowed & Nightcore Music Player",
    description: "Transform your music experience with customizable playback speed. Play YouTube and TikTok videos with slowed or nightcore effects."
  },
  verification: {
    google: "pIhibbB-PxDaY9RoagyBKnOOxpT4YT3gV0uCETuKEUU",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <LayoutWrapper>{children}</LayoutWrapper>
      </body>
    </html>
  );
}
