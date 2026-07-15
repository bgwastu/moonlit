"use client";

import { useSyncExternalStore } from "react";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { PlayerHost } from "@/components/PlayerHost";
import { AppProvider, useAppContext } from "@/context/AppContext";

/** 0 until first client microtask; keeps SSR/hydration first paint identical (placeholder). */
let layoutHydrationBeacon = 0;
const layoutHydrationListeners = new Set<() => void>();

function subscribeLayoutHydrated(onStoreChange: () => void) {
  layoutHydrationListeners.add(onStoreChange);
  if (typeof window !== "undefined") {
    queueMicrotask(() => {
      if (layoutHydrationBeacon === 0) {
        layoutHydrationBeacon = 1;
        layoutHydrationListeners.forEach((listener) => listener());
      }
    });
  }
  return () => {
    layoutHydrationListeners.delete(onStoreChange);
  };
}

function LayoutContent({ children }: { children: React.ReactNode }) {
  const { theme } = useAppContext();
  const ready =
    useSyncExternalStore(
      subscribeLayoutHydrated,
      () => layoutHydrationBeacon,
      () => 0,
    ) > 0;

  if (!ready) {
    return (
      <div style={{ backgroundColor: "#1A1B1E", height: "100dvh", width: "100%" }} />
    );
  }

  return (
    <MantineProvider withGlobalStyles withNormalizeCSS theme={theme}>
      <Notifications />
      {children}
      <PlayerHost />
    </MantineProvider>
  );
}

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <LayoutContent>{children}</LayoutContent>
    </AppProvider>
  );
}
