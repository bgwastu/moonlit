"use client";
export const dynamic = "force-dynamic";

import Dynamic from "@/components/Dynamic";
import { MantineProvider, useMantineTheme } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { PostHogProvider } from "posthog-js/react";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = useMantineTheme();
  return (
    <html lang="en">
      <head>
        <title>Moonlit</title>
        <meta name="description" content="Your melancholy music player" />
      </head>
      <body>
        <Dynamic>
          <PostHogProvider
            apiKey={process.env.NEXT_PUBLIC_POSTHOG_API_KEY}
            options={{
              api_host: "/phog",
            }}
          >
            <MantineProvider
              withGlobalStyles
              withNormalizeCSS
              theme={{
                focusRing: "never",
                colorScheme: "dark",
                primaryColor: "violet",
                primaryShade: 5,
                white: theme.colors.violet[0],
              }}
            >
              <Notifications />
              {children}
            </MantineProvider>
          </PostHogProvider>
        </Dynamic>
      </body>
    </html>
  );
}
