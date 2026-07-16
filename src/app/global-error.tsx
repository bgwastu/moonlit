"use client";

import { useEffect } from "react";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import { ErrorScreen } from "@/components/ErrorScreen";
import { APP_BG, appTheme } from "@/lib/theme";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Moonlit] global error:", error);
  }, [error]);

  return (
    <html lang="en" style={{ colorScheme: "dark", backgroundColor: APP_BG }}>
      <body style={{ margin: 0, backgroundColor: APP_BG, colorScheme: "dark" }}>
        <MantineProvider theme={appTheme} forceColorScheme="dark">
          <ErrorScreen
            title="Something went wrong"
            message={error.message || "An unexpected error occurred."}
            onPrimary={reset}
          />
        </MantineProvider>
      </body>
    </html>
  );
}
