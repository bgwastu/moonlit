"use client";

import Dynamic from "@/components/Dynamic";
import { themeAtom } from "@/state";
import {
  Button,
  Dialog,
  Flex,
  Image,
  MantineProvider,
  Text,
  Title,
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
  const [youtubelitDismissed, setYoutubelitDismissed] = useLocalStorage({
    key: "youtubelit-dismissed",
    defaultValue: false,
  });

  return (
    <html lang="en">
      <head>
        <title>Moonlit</title>
        <meta
          name="description"
          content="Slowed+Reverb & Nightcore Music Generator with YouTube Integration"
        />
        <meta
          name="keywords"
          content="slowed+reverb generator, youtube slowed+reverb generator, nightcore, Moonlit, customizable playback web player"
        />
        <meta name="author" content="Bagas Wastu" />
        <meta name="robots" content="index, follow" />
        <meta
          name="og:title"
          content="Slowed+Reverb & Nightcore Music Generator with YouTube Integration"
        />
        <meta
          name="og:description"
          content="Create custom slowed+reverb and nightcore music with Moonlit's seamless YouTube integration."
        />
        <meta name="og:type" content="website" />
        <meta name="og:site_name" content="Moonlit" />
        <meta
          name="twitter:title"
          content="Slowed+Reverb & Nightcore Music Generator with YouTube Integration"
        />
        <meta
          name="twitter:description"
          content="Create custom slowed+reverb and nightcore music with Moonlit's seamless YouTube integration."
        />
        <meta name="twitter:url" content="https://moonlit.wastu.net" />
        <meta name="google-site-verification" content="pIhibbB-PxDaY9RoagyBKnOOxpT4YT3gV0uCETuKEUU" />
        <title>Moonlit</title>
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
                <Dialog
                  opened={!youtubelitDismissed}
                  withCloseButton
                  onClose={() => {
                    setYoutubelitDismissed(true);
                  }}
                  size="lg"
                  bg={theme.colors.dark[6]}
                  radius="md"
                >
                  <Flex direction="column" gap="md">
                    <Title size="md">Quick tip</Title>
                    <Text size="sm" mb="xs" fw={500}>
                      Use Moonlit faster by adding <b>lit</b> after youtube in
                      the URL.
                    </Text>
                    <video width="100%" height="auto" autoPlay loop>
                      <source src="youtubelit-demo.webm" type="video/webm" />
                      Your browser does not support the video tag.
                    </video>
                    <Flex>
                      <Button
                        onClick={() => {
                          setYoutubelitDismissed(true);
                        }}
                        variant="default"
                      >
                        Dismiss
                      </Button>
                    </Flex>
                  </Flex>
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
