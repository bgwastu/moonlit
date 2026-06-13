"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Flex,
  Loader,
  Modal,
  Stack,
  Switch,
  Text,
  Textarea,
} from "@mantine/core";
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
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!opened) return;
    const load = async () => {
      setLoading(true);
      try {
        const [userCookies, isCustom] = await Promise.all([
          getUserCookies(),
          isCustomCookiesEnabled(),
        ]);
        setCookiesState(userCookies);
        setCustomEnabled(isCustom);
      } catch {}
      setLoading(false);
    };
    load();
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
      await setUserCookies(cookies);
      await setCustomCookiesEnabled(customEnabled);
      onClose();
    } catch {
      setSaving(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Cookies" size="md" centered>
      <Stack spacing="md">
        <Text size="sm" c="dimmed">
          Cookies help bypass age restrictions and rate limits for YouTube and TikTok.
          Export from your browser using{" "}
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
          <>
            {loading ? (
              <Flex align="center" justify="center" py="xl">
                <Loader size="sm" />
              </Flex>
            ) : (
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
          </>
        )}

        <Flex gap="sm" justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving} disabled={loading}>
            Save
          </Button>
        </Flex>
      </Stack>
    </Modal>
  );
}
