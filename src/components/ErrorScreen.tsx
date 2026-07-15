"use client";

import { Button, Container, Flex, Paper, Text, Title } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";

interface ErrorScreenProps {
  title?: string;
  message: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  secondaryHref?: string;
  fullViewport?: boolean;
}

export function ErrorScreen({
  title = "Something went wrong",
  message,
  primaryLabel = "Try again",
  onPrimary,
  secondaryLabel = "Go home",
  onSecondary,
  secondaryHref = "/",
  fullViewport = true,
}: ErrorScreenProps) {
  return (
    <Container size="xs">
      <Flex
        h={fullViewport ? "100dvh" : undefined}
        py={fullViewport ? undefined : "xl"}
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
            <Title order={2}>{title}</Title>
            <Text c="dimmed" size="sm">
              {message}
            </Text>
            {onPrimary && (
              <Button onClick={onPrimary} variant="light" color="red" fullWidth mt="md">
                {primaryLabel}
              </Button>
            )}
            {(onSecondary || secondaryHref) && (
              <Button
                onClick={onSecondary}
                component={onSecondary ? "button" : "a"}
                href={onSecondary ? undefined : secondaryHref}
                variant="subtle"
                color="gray"
                fullWidth
              >
                {secondaryLabel}
              </Button>
            )}
          </Flex>
        </Paper>
      </Flex>
    </Container>
  );
}
