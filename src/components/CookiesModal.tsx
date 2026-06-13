"use client";

import { useEffect, useState } from "react";
import { Button, Flex, Modal, Stack, Switch, Text, Textarea } from "@mantine/core";
import {
  getUserCookies,
  isCustomCookiesEnabled,
  setCustomCookiesEnabled,
  setUserCookies,
  validateCookies,
} from "@/lib/cookies";

interface CookiesModalProps {
  opened: boolean;
  onClose: () => void;
}

export default function CookiesModal({ opened, onClose }: CookiesModalProps) {
  const [cookies, setCookiesState] = useState("");
  const [customEnabled, setCustomEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!opened) return;
    const id = requestAnimationFrame(() => {
      setCookiesState(getUserCookies());
      setCustomEnabled(isCustomCookiesEnabled());
    });
    return () => cancelAnimationFrame(id);
  }, [opened]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (customEnabled && cookies.trim()) {
        const validation = validateCookies(cookies);
        if (!validation.valid) {
          setSaving(false);
          return;
        }
      }
      setUserCookies(cookies);
      setCustomCookiesEnabled(customEnabled);
      onClose();
    } catch {
      setSaving(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Cookies" size="md" centered>
      <Stack spacing="md">
        <Text size="sm" c="dimmed">
          Cookies help bypass age restrictions and rate limits for YouTube. Export from
          your browser using{" "}
          <Text
            component="a"
            href="https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc"
            target="_blank"
            underline
            inherit
          >
            Get cookies.txt LOCALLY
          </Text>
          .
        </Text>

        <Switch
          label="Enable custom cookies"
          description="Use your own cookies for downloads"
          checked={customEnabled}
          onChange={(e) => setCustomEnabled(e.currentTarget.checked)}
          size="md"
        />

        {customEnabled && (
          <Textarea
            value={cookies}
            onChange={(e) => setCookiesState(e.currentTarget.value)}
            placeholder="Paste your exported cookies.txt here..."
            minRows={6}
            maxRows={10}
            autosize
            styles={{ input: { fontFamily: "monospace", fontSize: "11px" } }}
          />
        )}

        <Flex gap="sm" justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving}>
            Save
          </Button>
        </Flex>
      </Stack>
    </Modal>
  );
}
