"use client";

import { useEffect, useState } from "react";
import {
  Anchor,
  Button,
  Flex,
  Modal,
  Stack,
  Switch,
  Text,
  Textarea,
} from "@mantine/core";
import {
  getUserCookies,
  isCustomCookiesEnabled,
  notifyCookiesChanged,
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
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    const id = requestAnimationFrame(() => {
      setCookiesState(getUserCookies());
      setCustomEnabled(isCustomCookiesEnabled());
      setValidationError(null);
    });
    return () => cancelAnimationFrame(id);
  }, [opened]);

  const handleSave = async () => {
    setSaving(true);
    setValidationError(null);
    try {
      if (customEnabled && cookies.trim()) {
        const validation = validateCookies(cookies);
        if (!validation.valid) {
          setValidationError(validation.error || "Invalid cookie format.");
          return;
        }
      }
      setUserCookies(cookies);
      setCustomCookiesEnabled(customEnabled);
      notifyCookiesChanged();
      onClose();
    } catch {
      setValidationError("Failed to save cookies. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Cookies" size="md" centered>
      <Stack gap="md">
        <Stack gap={6}>
          <Switch
            labelPosition="left"
            label="Enable custom cookies"
            description="Cookies help bypass age restrictions and rate limits for YouTube."
            checked={customEnabled}
            onChange={(e) => {
              setCustomEnabled(e.currentTarget.checked);
              setValidationError(null);
            }}
          />
          {/* Keep the link outside Switch's <label> so it stays clickable */}
          <Text size="xs" c="dimmed">
            Export a Netscape cookies.txt while signed into YouTube (needs LOGIN_INFO or
            __Secure-1PSID). Extra non-YouTube domains are ignored. Use{" "}
            <Anchor
              href="https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc"
              target="_blank"
              rel="noopener noreferrer"
              size="xs"
            >
              this extension
            </Anchor>
            . Unrelated domains are rejected.
          </Text>
        </Stack>

        {customEnabled && (
          <Textarea
            value={cookies}
            onChange={(e) => {
              setCookiesState(e.currentTarget.value);
              setValidationError(null);
            }}
            error={validationError}
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
