"use client";

import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <title>Moonlit</title>
        <meta name="description" content="Your melancholy music player" />
      </head>
      <body>
        <MantineProvider
          withGlobalStyles
          withNormalizeCSS
          theme={{
            colorScheme: "dark",
            primaryColor: "violet",
            primaryShade: 4,
          }}
        >
          <Notifications />
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}
