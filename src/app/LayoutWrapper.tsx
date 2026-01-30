"use client";

import { useEffect, useState } from "react";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { PostHogProvider } from "posthog-js/react";
import { AppProvider, useAppContext } from "@/context/AppContext";

function LayoutContent({ children }: { children: React.ReactNode }) {
  const { theme } = useAppContext();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <div style={{ backgroundColor: "#1A1B1E", height: "100dvh", width: "100%" }} />
    );
  }

  return (
    <MantineProvider withGlobalStyles withNormalizeCSS theme={theme}>
      <Notifications />
      {children}
    </MantineProvider>
  );
}

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <PostHogProvider
      apiKey={process.env.NEXT_PUBLIC_POSTHOG_API_KEY}
      options={{
        api_host: "/ev",
        ui_host: "https://us.i.posthog.com",
      }}
    >
      <AppProvider>
        <LayoutContent>{children}</LayoutContent>
      </AppProvider>
    </PostHogProvider>
  );
}
