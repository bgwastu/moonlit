import { Metadata } from "next";
import LayoutWrapper from "./LayoutWrapper";

export const metadata: Metadata = {
  metadataBase: new URL("https://moonlit.wastu.net"),
  title: {
    default: "Moonlit - Slowed & Nightcore Music Player",
    template: "%s | Moonlit",
  },
  description:
    "Transform your music with real-time slowed + reverb and nightcore effects.",
  applicationName: "Moonlit",
  keywords: [
    "slowed music",
    "nightcore",
    "youtube player",
    "tiktok player",
    "music remix",
    "audio effects",
    "speed control",
    "pitch control",
  ],
  authors: [{ name: "Moonlit", url: "https://moonlit.wastu.net" }],
  creator: "Moonlit",
  publisher: "Moonlit",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "Moonlit - Slowed & Nightcore Music Player",
    description:
      "Transform your music with real-time slowed + reverb and nightcore effects.",
    url: "https://moonlit.wastu.net",
    siteName: "Moonlit",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Moonlit - Slowed & Nightcore Music Player",
    description:
      "Transform your music experience with customizable playback speed. Play YouTube and TikTok videos with slowed or nightcore effects.",
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
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <LayoutWrapper>{children}</LayoutWrapper>
      </body>
    </html>
  );
}
