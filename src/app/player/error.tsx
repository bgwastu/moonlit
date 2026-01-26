"use client";

import { useEffect } from "react";
import { Button, Container, Flex, Text, Title, Paper } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <Container size="xs">
      <Flex
        h="100dvh"
        align="center"
        justify="center"
        direction="column"
        gap="xl"
      >
        <Paper
          p="xl"
          radius="md"
          withBorder
          style={{ width: "100%", textAlign: "center" }}
        >
          <Flex direction="column" align="center" gap="md">
            <IconAlertTriangle size={48} color="red" />

            <Title order={2}>Something went wrong!</Title>

            <Text color="dimmed" size="sm">
              {error.message ||
                "An unexpected error occurred while loading the player."}
            </Text>

            <Button
              onClick={reset}
              variant="light"
              color="red"
              fullWidth
              mt="md"
            >
              Try again
            </Button>

            <Button
              component="a"
              href="/"
              variant="subtle"
              color="gray"
              fullWidth
            >
              Go Home
            </Button>
          </Flex>
        </Paper>
      </Flex>
    </Container>
  );
}
