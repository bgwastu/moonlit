"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/components/ErrorScreen";

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
    <html lang="en">
      <body style={{ margin: 0 }}>
        <ErrorScreen
          title="Something went wrong"
          message={error.message || "An unexpected error occurred."}
          onPrimary={reset}
        />
      </body>
    </html>
  );
}
