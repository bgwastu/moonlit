"use client";
export const dynamic = "force-dynamic";

import Dynamic from "@/components/Dynamic";
import {
  Button,
  Dialog,
  MantineProvider,
  Text,
  useMantineTheme
} from "@mantine/core";
import { useDisclosure, useLocalStorage, useOs } from "@mantine/hooks";
import { Notifications } from "@mantine/notifications";
import { PostHogProvider } from "posthog-js/react";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = useMantineTheme();

  const os = useOs();
  const [iosDismissed, setIosDismissed] = useLocalStorage({
    key: "warning-dismissed",
    defaultValue: false,
  });
  const [opened, { toggle, close }] = useDisclosure(true);

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
              <>
                <Notifications />
                <Dialog
                  opened={os === "ios" && !iosDismissed}
                  withCloseButton
                  onClose={() => {
                    setIosDismissed(true);
                  }}
                  size="lg"
                  bg={theme.colors.dark[6]}
                  radius="md"
                >
                  <Text size="sm" mb="xs" fw={500}>
                    Moonlit is not yet optimized for IOS devices
                  </Text>
                  <Button onClick={() => {
                    setIosDismissed(true);
                  }} variant="default">I understand</Button>
                </Dialog>
                {children}
              </>
            </MantineProvider>
          </PostHogProvider>
        </Dynamic>
      </body>
    </html>
  );
}
