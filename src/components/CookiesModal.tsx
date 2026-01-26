"use client";

import {
  getUserCookies,
  setUserCookies,
  validateCookies,
  isCustomCookiesEnabled,
  setCustomCookiesEnabled,
} from "@/lib/cookies";
import {
  Anchor,
  Alert,
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
  IconAlertCircle,
  IconCheck,
  IconInfoCircle,
  IconShieldLock,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";

interface CookiesModalProps {
  opened: boolean;
  onClose: () => void;
}

export default function CookiesModal({ opened, onClose }: CookiesModalProps) {
  const [cookies, setCookiesState] = useState("");
  const [customEnabled, setCustomEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Load cookies and preferences when modal opens
  useEffect(() => {
    if (opened) {
      setLoading(true);
      setError(null);
      setSuccess(false);

      Promise.all([getUserCookies(), isCustomCookiesEnabled()])
        .then(([userCookies, isCustom]) => {
          setCookiesState(userCookies);
          setCustomEnabled(isCustom);
        })
        .catch(() => {
          setError("Failed to load settings");
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [opened]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      // Validate format if custom cookies enabled and user provided cookies
      if (customEnabled && cookies.trim()) {
        const validation = validateCookies(cookies);
        if (!validation.valid) {
          setError(validation.error || "Invalid cookie format");
          setSaving(false);
          return;
        }
      }

      // Save user cookies and preference
      await setUserCookies(cookies);
      await setCustomCookiesEnabled(customEnabled);

      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch {
      setError("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="YouTube Cookies"
      size="lg"
      centered
    >
      <Stack spacing="md">
        {/* Privacy Notice */}
        <Alert icon={<IconShieldLock size={16} />} color="gray" variant="light">
          <Text size="sm">
            Moonlit <strong>does not store or log</strong> your cookies. They
            are kept locally in your browser and sent directly for downloads.
            This app is{" "}
            <Anchor
              href="https://github.com/bgwastu/moonlit"
              target="_blank"
              rel="noopener noreferrer"
            >
              open-source
            </Anchor>
            {" — "}you can self-host for full control.
          </Text>
        </Alert>

        {/* Info about cookies */}
        <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
          <Text size="sm">
            Cookies help bypass age restrictions and improve download
            reliability. Export from your browser using{" "}
            <Anchor
              href="https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp"
              target="_blank"
              rel="noopener noreferrer"
            >
              these instructions
            </Anchor>
            .
          </Text>
        </Alert>

        {/* Custom Cookies Toggle */}
        <Switch
          label="Enable custom cookies"
          description="Use your own cookies for YouTube downloads"
          checked={customEnabled}
          onChange={(e) => setCustomEnabled(e.currentTarget.checked)}
          size="md"
        />

        {/* Cookie input - only shown when custom cookies enabled */}
        {customEnabled && (
          <>
            <Text weight={600} size="sm">
              Your Cookies (Netscape Format)
            </Text>

            {loading ? (
              <Flex align="center" justify="center" py="xl">
                <Loader size="sm" />
              </Flex>
            ) : (
              <Textarea
                value={cookies}
                onChange={(e) => setCookiesState(e.currentTarget.value)}
                placeholder={`# Netscape HTTP Cookie File
# Paste your exported cookies here

.youtube.com\tTRUE\t/\tTRUE\t0\tCOOKIE_NAME\tCOOKIE_VALUE`}
                minRows={8}
                maxRows={12}
                autosize
                styles={{
                  input: {
                    fontFamily: "monospace",
                    fontSize: "11px",
                  },
                }}
              />
            )}

            {!cookies.trim() && (
              <Text size="xs" color="orange">
                Custom cookies enabled but no cookies provided. Downloads may
                fail for age-restricted content.
              </Text>
            )}
          </>
        )}

        {error && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            color="red"
            variant="light"
          >
            {error}
          </Alert>
        )}

        {success && (
          <Alert icon={<IconCheck size={16} />} color="green" variant="light">
            Saved successfully!
          </Alert>
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
