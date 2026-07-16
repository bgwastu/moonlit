"use client";

import Link from "next/link";
import {
  Button,
  Container,
  Flex,
  Paper,
  Text,
  Title,
  useMantineTheme,
} from "@mantine/core";
import { IconMapSearch } from "@tabler/icons-react";
import { APP_BG } from "@/lib/theme";

export default function NotFound() {
  const theme = useMantineTheme();
  const bg = theme.colors.dark?.[7] ?? APP_BG;

  return (
    <div
      style={{
        minHeight: "100dvh",
        width: "100%",
        backgroundColor: bg,
        colorScheme: "dark",
      }}
    >
      <Container size="xs">
        <Flex h="100dvh" align="center" justify="center" direction="column" gap="xl">
          <Paper
            p="xl"
            radius="md"
            withBorder
            bg={theme.colors.dark[6]}
            style={{ width: "100%", textAlign: "center" }}
          >
            <Flex direction="column" align="center" gap="md">
              <IconMapSearch size={48} color={theme.colors.gray[5]} />
              <Title order={2} c="gray.0">
                Page not found
              </Title>
              <Text c="dimmed" size="sm">
                The page you are looking for does not exist or was moved.
              </Text>
              <Button component={Link} href="/" variant="light" fullWidth mt="md">
                Go home
              </Button>
            </Flex>
          </Paper>
        </Flex>
      </Container>
    </div>
  );
}
