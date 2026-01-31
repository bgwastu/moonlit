"use client";

import { useEffect, useState } from "react";
import { Button, Flex, Modal, Slider, Stack, Switch, Text } from "@mantine/core";
import { IconLock, IconLockOpen } from "@tabler/icons-react";

export interface CustomizePlaybackModalProps {
  opened: boolean;
  onClose: () => void;
  /** Lite mode: native playback only (speed); no pitch/reverb. Much more stable. */
  liteMode: boolean;
  onLiteModeChange: (enabled: boolean) => void;
  pitchLockedToSpeed: boolean;
  onLockToggle: (locked: boolean) => void;
  rate: number;
  onSpeedChangeEnd: (value: number) => void;
  semitones: number;
  onPitchChangeEnd: (value: number) => void;
  reverbAmount: number;
  onReverbChange: (value: number) => void;
  onReset: () => void;
}

export default function CustomizePlaybackModal({
  opened,
  onClose,
  liteMode,
  onLiteModeChange,
  pitchLockedToSpeed,
  onLockToggle,
  rate,
  onSpeedChangeEnd,
  semitones,
  onPitchChangeEnd,
  reverbAmount,
  onReverbChange,
  onReset,
}: CustomizePlaybackModalProps) {
  const [speedSliderValue, setSpeedSliderValue] = useState(rate);
  const [pitchSliderValue, setPitchSliderValue] = useState(semitones);

  // Sync slider state from player when modal opens
  useEffect(() => {
    if (opened) {
      setSpeedSliderValue(rate);
      setPitchSliderValue(semitones);
    }
  }, [opened, rate, semitones]);

  const effectiveLocked = pitchLockedToSpeed;
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      overlayProps={{ opacity: 0.5 }}
      title="Customize Playback"
      keepMounted
    >
      <Stack>
        <Flex align="center" justify="space-between" mb="md" gap="md" wrap="wrap">
          <Flex direction="column" gap={2}>
            <Text size="sm" fw={500}>
              Lite mode
            </Text>
            <Text size="xs" c="dimmed">
              Much more stable. Disables custom pitch and reverb.
            </Text>
          </Flex>
          <Switch
            size="md"
            checked={liteMode}
            onChange={(e) => onLiteModeChange(e.currentTarget.checked)}
          />
        </Flex>

        {!liteMode && (
          <>
            <Flex align="center" justify="space-between" mb="sm" gap="md" wrap="wrap">
              <Flex align="center" gap="xs">
                {effectiveLocked ? (
                  <IconLock size={18} style={{ opacity: 0.8 }} />
                ) : (
                  <IconLockOpen size={18} style={{ opacity: 0.8 }} />
                )}
                <Text size="sm" fw={500}>
                  Lock pitch to speed
                </Text>
              </Flex>
              <Switch
                size="md"
                checked={effectiveLocked}
                onChange={(e) => onLockToggle(e.currentTarget.checked)}
              />
            </Flex>
          </>
        )}

        <Flex direction="column" mb={22} gap={2}>
          <Text size="sm">Speed: {speedSliderValue.toFixed(2)}x</Text>
          <Slider
            min={0.5}
            max={1.5}
            label={(v) =>
              v < 0.7 ? `who hurt u? 😭 (${v.toFixed(2)}x)` : `${v.toFixed(2)}x`
            }
            step={0.01}
            thumbSize={20}
            styles={{
              thumb: { borderWidth: 0 },
            }}
            marks={[
              { value: 0.5, label: "0.5x" },
              { value: 0.8, label: "Slow" },
              { value: 1, label: "1x" },
              { value: 1.25, label: "Fast" },
              { value: 1.5, label: "1.5x" },
            ]}
            value={speedSliderValue}
            onChange={setSpeedSliderValue}
            onChangeEnd={(v) => onSpeedChangeEnd(v)}
          />
        </Flex>

        {!liteMode && (
          <>
            <Flex direction="column" mb={22} gap={2}>
              <Text size="sm">
                Pitch: {(effectiveLocked ? semitones : pitchSliderValue) >= 0 ? "+" : ""}
                {(effectiveLocked ? semitones : pitchSliderValue).toFixed(1)} semitones
                {effectiveLocked && (
                  <Text component="span" size="xs" c="dimmed" ml={6}>
                    (synced to speed)
                  </Text>
                )}
              </Text>
              <Slider
                min={-12}
                max={12}
                step={0.1}
                thumbSize={20}
                disabled={effectiveLocked}
                styles={{
                  thumb: { borderWidth: 0 },
                }}
                marks={[
                  { value: -12, label: "-12" },
                  { value: -6, label: "-6" },
                  { value: 0, label: "0" },
                  { value: 6, label: "+6" },
                  { value: 12, label: "+12" },
                ]}
                label={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}`}
                value={effectiveLocked ? semitones : pitchSliderValue}
                onChange={effectiveLocked ? () => {} : setPitchSliderValue}
                onChangeEnd={(v) => onPitchChangeEnd(v)}
              />
            </Flex>

            <Flex direction="column" mb={22} gap={2}>
              <Text size="sm">Reverb: {Math.round(reverbAmount * 100)}%</Text>
              <Slider
                min={0}
                max={1}
                step={0.01}
                thumbSize={20}
                styles={{
                  thumb: { borderWidth: 0 },
                }}
                marks={[
                  { value: 0, label: "0" },
                  { value: 0.25, label: "25" },
                  { value: 0.5, label: "50" },
                  { value: 0.75, label: "75" },
                  { value: 1, label: "100" },
                ]}
                label={(v) => `${Math.round(v * 100)}%`}
                value={reverbAmount}
                onChange={onReverbChange}
              />
            </Flex>
          </>
        )}

        <Button variant="light" onClick={onReset}>
          Reset to Default
        </Button>
      </Stack>
    </Modal>
  );
}
