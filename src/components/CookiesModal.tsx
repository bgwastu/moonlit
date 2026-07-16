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
        <Switch
          labelPosition="left"
          label="Enable custom cookies"
          description={
            <Text component="span" size="xs" c="dimmed">
              Cookies help bypass age restrictions and rate limits for YouTube. Export
              from your browser using{" "}
              <Text
                component="a"
                href="https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc"
                target="_blank"
                td="underline"
                inherit
              >
                This extension
              </Text>
              .
            </Text>
          }
          checked={customEnabled}
          onChange={(e) => {
            setCustomEnabled(e.currentTarget.checked);
            setValidationError(null);
          }}
        />

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
