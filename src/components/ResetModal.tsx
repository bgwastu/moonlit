"use client";

import { useState } from "react";
import { Button, Modal, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { resetAllData } from "@/utils/reset";

interface ResetModalProps {
  opened: boolean;
  onClose: () => void;
}

export default function ResetModal({ opened, onClose }: ResetModalProps) {
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    setResetting(true);
    const success = await resetAllData({ settings: true });
    if (success) {
      notifications.show({
        title: "Data Reset",
        message: "All data has been cleared.",
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
        <Text size="sm">
          This will delete all configurations, cookies, history, and saved settings. This
          action cannot be undone.
        </Text>

        <Button color="red" onClick={handleReset} loading={resetting} fullWidth>
          Reset Everything
        </Button>
      </Stack>
    </Modal>
  );
}
