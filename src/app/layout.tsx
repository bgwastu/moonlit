"use client";

import Dynamic from "@/components/Dynamic";
import { themeAtom } from "@/state";
import {
  Button,
  Dialog,
  MantineProvider,
  Text,
  useMantineTheme,
} from "@mantine/core";
import { useLocalStorage, useOs } from "@mantine/hooks";
import { Notifications } from "@mantine/notifications";
import { useAtom } from "jotai";
import { PostHogProvider } from "posthog-js/react";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = useMantineTheme();
  const [globalTheme, setGlobalTheme] = useAtom(themeAtom);

  const os = useOs();
  const [iosDismissed, setIosDismissed] = useLocalStorage({
    key: "warning-dismissed",
    defaultValue: false,
  });

  return (
    <html lang="en">
      <head>
        <title>Moonlit</title>
        <meta name="description" content="Your melancholy music player" />
        <meta name="theme-color" content="#1A1B1E" />
      </head>
      <body style={{ margin: 0 }}>
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
              theme={globalTheme}
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
                  <Button
                    onClick={() => {
                      setIosDismissed(true);
                    }}
                    variant="default"
                  >
                    I understand
                  </Button>
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
