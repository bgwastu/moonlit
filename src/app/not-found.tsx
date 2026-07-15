"use client";

import Link from "next/link";
import { Button, Container, Flex, Paper, Text, Title } from "@mantine/core";
import { IconMapSearch } from "@tabler/icons-react";

export default function NotFound() {
  return (
    <Container size="xs">
      <Flex h="100dvh" align="center" justify="center" direction="column" gap="xl">
        <Paper
          p="xl"
          radius="md"
          withBorder
          style={{ width: "100%", textAlign: "center" }}
        >
          <Flex direction="column" align="center" gap="md">
            <IconMapSearch size={48} color="gray" />
            <Title order={2}>Page not found</Title>
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
  );
}
