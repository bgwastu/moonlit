"use client";

import { useState } from "react";
import { Button, Checkbox, Flex, Modal, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { resetAllData } from "@/utils/reset";

interface ResetModalProps {
  opened: boolean;
  onClose: () => void;
}

export default function ResetModal({ opened, onClose }: ResetModalProps) {
  const [resetting, setResetting] = useState(false);
  const [options, setOptions] = useState({
    media: true,
    settings: true,
  });

  const handleReset = async () => {
    if (!options.media && !options.settings) {
      notifications.show({
        title: "No selection",
        message: "Please select at least one item to delete.",
        color: "yellow",
      });
      return;
    }

    setResetting(true);
    const success = await resetAllData(options);
    if (success) {
      notifications.show({
        title: "Data Reset",
        message: "The selected data has been cleared.",
        color: "green",
      });
      onClose();
      window.location.reload();
    } else {
      notifications.show({
        title: "Error",
        message: "Failed to clear data. Please try again.",
        color: "red",
      });
    }
    setResetting(false);
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Reset Data" centered>
      <Stack spacing="md">
        <Text size="sm">Select the data you want to delete:</Text>

        <Stack spacing="xs">
          <Checkbox
            label="Delete all of the cached media"
            description="Removes downloaded YouTube/TikTok videos and local uploads"
            checked={options.media}
            onChange={(event) =>
              setOptions({ ...options, media: event.currentTarget.checked })
            }
          />
          <Checkbox
            label="Delete configurations & history"
            description="Clears YouTube cookies, playback history, and saved settings"
            checked={options.settings}
            onChange={(event) =>
              setOptions({ ...options, settings: event.currentTarget.checked })
            }
          />
        </Stack>

        <Text size="xs" color="dimmed" mt="sm">
          This action cannot be undone.
        </Text>

        <Flex justify="flex-end" gap="sm">
          <Button variant="subtle" onClick={onClose} disabled={resetting}>
            Cancel
          </Button>
          <Button
            color="red"
            onClick={handleReset}
            loading={resetting}
            disabled={!options.media && !options.settings}
          >
            Clear Selected Data
          </Button>
        </Flex>
      </Stack>
    </Modal>
  );
}
