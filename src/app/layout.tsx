"use client";
export const dynamic = "force-dynamic";

import Dynamic from "@/components/Dynamic";
import {
  Flex,
  MantineProvider,
  Text,
  useMantineTheme
} from "@mantine/core";
import { useOs } from "@mantine/hooks";
import { Notifications } from "@mantine/notifications";
import { PostHogProvider } from "posthog-js/react";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = useMantineTheme();
  const os = useOs();

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
              api_host: "https://app.posthog.com",
              opt_in_site_apps: true,
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
              {os === "ios" ? (
                <Flex h="100dvh" align="center" justify="center">
                  <Text>
                    Sorry, IOS is not currently supported at the moment.
                  </Text>
                </Flex>
              ) : (
                <>
                  <Notifications />
                  {children}
                </>
              )}
            </MantineProvider>
          </PostHogProvider>
        </Dynamic>
      </body>
    </html>
  );
}
