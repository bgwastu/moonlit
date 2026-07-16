"use client";

import { Modal, Stack, Text } from "@mantine/core";
import HistoryList from "@/components/HistoryList";

interface HistoryModalProps {
  opened: boolean;
  onClose: () => void;
  onLoadingStart: (loading: boolean) => void;
}

export default function HistoryModal({ opened, onClose }: HistoryModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Text size="lg" weight={700}>
          History
        </Text>
      }
      size="lg"
      radius="md"
      centered
    >
      <Stack spacing="md">
        <HistoryList onPlay={onClose} maxHeight={400} showClear />
      </Stack>
    </Modal>
  );
}
