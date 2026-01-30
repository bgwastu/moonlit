"use client";

import LoadingOverlay from "@/components/LoadingOverlay";

export default function Loading() {
  return <LoadingOverlay visible={true} message="Fetching the metadata..." />;
}
