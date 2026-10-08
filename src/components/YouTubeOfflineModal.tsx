"use client";

import { Box, Button, Group, Modal, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconMusic, IconRefresh, IconWifiOff } from "@tabler/icons-react";
import { useYouTubeStatus } from "@/context/YouTubeStatusContext";

export default function YouTubeOfflineModal() {
  const { modalOpened, checking, connectionOnline, status, refresh, dismissModal } =
    useYouTubeStatus();
  const isAdmin =
    typeof window !== "undefined" && window.location.pathname.startsWith("/admin");
  return (
    <Modal
      opened={modalOpened && !isAdmin}
      onClose={dismissModal}
      title="Local music mode"
      centered
      radius="lg"
      zIndex={400}
    >
      <Stack gap="lg">
        <Group wrap="nowrap" align="flex-start">
          <ThemeIcon variant="light" color="violet" size={48} radius="md">
            <IconWifiOff size={24} stroke={1.6} />
          </ThemeIcon>
          <Box>
            <Text fw={600} c="white">
              {!connectionOnline
                ? "Your device is offline"
                : status.state === "unknown"
                  ? "Online music can't be reached"
                  : "YouTube is unavailable right now"}
            </Text>
            <Text size="sm" c="dimmed" mt={6}>
              Moonlit has switched to local music. Open a music file or play a song
              already saved on this device.
            </Text>
          </Box>
        </Group>
        <Text size="sm" c="dimmed">
          YouTube search will return automatically when the connection is working again.
          Your current music can keep playing.
        </Text>
        <Stack gap="sm">
          <Button leftSection={<IconMusic size={18} />} onClick={dismissModal}>
            Continue with local music
          </Button>
          <Button
            variant="subtle"
            color="gray"
            leftSection={<IconRefresh size={16} />}
            onClick={refresh}
            loading={checking}
          >
            Check YouTube again
          </Button>
        </Stack>
      </Stack>
    </Modal>
  );
}
