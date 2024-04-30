import { Metadata } from "next";
import LayoutWrapper from "./LayoutWrapper";

export const metadata: Metadata = {
  title: "Moonlit",
  description:
    "Slowed+Reverb & Nightcore Music Generator with YouTube Integration",
  verification: {
    google: "pIhibbB-PxDaY9RoagyBKnOOxpT4YT3gV0uCETuKEUU",
  },
  // TODO: add pretty og image
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
