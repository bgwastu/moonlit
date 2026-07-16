"use client";

import {
  Button,
  Container,
  Flex,
  Paper,
  Text,
  Title,
  useMantineTheme,
} from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { APP_BG } from "@/lib/theme";

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
  const theme = useMantineTheme();
  const bg = theme.colors.dark?.[7] ?? APP_BG;

  return (
    <div
      style={{
        minHeight: fullViewport ? "100dvh" : undefined,
        width: "100%",
        backgroundColor: bg,
        colorScheme: "dark",
      }}
    >
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
            bg={theme.colors.dark[6]}
            style={{ width: "100%", textAlign: "center" }}
          >
            <Flex direction="column" align="center" gap="md">
              <IconAlertTriangle size={48} color={theme.colors.red[5]} />
              <Title order={2} c="gray.0">
                {title}
              </Title>
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
    </div>
  );
}
