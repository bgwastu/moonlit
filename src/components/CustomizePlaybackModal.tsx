"use client";

import { useEffect, useState } from "react";
import { Button, Flex, Modal, Slider, Stack, Switch, Text } from "@mantine/core";

export interface CustomizePlaybackModalProps {
  opened: boolean;
  onClose: () => void;
  /** Advanced stretch mode: enables pitch shifting and reverb via signalsmith-stretch pipeline */
  advancedStretch: boolean;
  onAdvancedStretchChange: (enabled: boolean) => void;
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
  advancedStretch,
  onAdvancedStretchChange,
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
    if (!opened) return;
    const id = requestAnimationFrame(() => {
      setSpeedSliderValue(rate);
      setPitchSliderValue(semitones);
    });
    return () => cancelAnimationFrame(id);
  }, [opened, rate, semitones]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      overlayProps={{ opacity: 0.5 }}
      title="Customize Playback"
      keepMounted
    >
      <Stack>
        <Switch
          labelPosition="left"
          label="Advanced Stretch"
          description="Enables pitch shifting and reverb. Uses more processing power."
          checked={advancedStretch}
          onChange={(e) => onAdvancedStretchChange(e.currentTarget.checked)}
        />

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
              { value: 0.8, label: "Slowed" },
              { value: 1, label: "1x" },
              { value: 1.25, label: "Speed Up" },
              { value: 1.5, label: "1.5x" },
            ]}
            value={speedSliderValue}
            onChange={setSpeedSliderValue}
            onChangeEnd={(v) => onSpeedChangeEnd(v)}
          />
        </Flex>

        {advancedStretch && (
          <>
            <Flex direction="column" mb={22} gap={2}>
              <Text size="sm">
                Pitch: {pitchSliderValue >= 0 ? "+" : ""}
                {pitchSliderValue.toFixed(1)} semitones
              </Text>
              <Slider
                min={-12}
                max={12}
                step={0.1}
                thumbSize={20}
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
                value={pitchSliderValue}
                onChange={setPitchSliderValue}
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
