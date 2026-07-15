"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/components/ErrorScreen";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Moonlit] app error:", error);
  }, [error]);

  return (
    <ErrorScreen
      title="Something went wrong"
      message={error.message || "An unexpected error occurred."}
      onPrimary={reset}
    />
  );
}
