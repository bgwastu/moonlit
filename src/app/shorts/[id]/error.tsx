"use client";

import { useEffect } from "react";
import { Button, Container, Flex, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error(error);
    notifications.show({
      title: "Error",
      message: error.message || "Something went wrong loading the short.",
      color: "red",
    });
  }, [error]);

  return (
    <Container size="sm">
      <Flex
        justify="center"
        align="center"
        h="100vh"
        direction="column"
        gap="md"
        ta="center"
      >
        <Title order={2}>Error Loading Short</Title>
        <Text color="red">{error.message || "Something went wrong"}</Text>
        <Button onClick={() => router.push("/")}>Go Home</Button>
        <Button variant="subtle" onClick={() => reset()}>
          Try again
        </Button>
      </Flex>
    </Container>
  );
}

