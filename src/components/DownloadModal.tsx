"use client";

import { useRef, useState } from "react";
import { Alert, Button, Group, Modal, Progress, Radio, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconDownload, IconInfoCircle } from "@tabler/icons-react";
import { Song } from "@/interfaces";

interface DownloadModalProps {
  opened: boolean;
  onClose: () => void;
  song: Song;
  currentPlaybackRate: number;
}

// Helper to write WAV header
function writeWavHeader(sampleRate: number, numChannels: number, dataLength: number) {
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);

  return buffer;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const samples = buffer.getChannelData(0).length;

  const left = buffer.getChannelData(0);
  const right = numChannels === 2 ? buffer.getChannelData(1) : left;
  const interleaved = new Float32Array(samples * numChannels);

  if (numChannels === 2) {
    for (let i = 0; i < samples; i++) {
      interleaved[i * 2] = left[i];
      interleaved[i * 2 + 1] = right[i];
    }
  } else {
    interleaved.set(left);
  }

  const header = writeWavHeader(sampleRate, numChannels, interleaved.length * 2);
  const wavFile = new Uint8Array(header.byteLength + interleaved.length * 2);

  wavFile.set(new Uint8Array(header), 0);

  const pcmData = new DataView(wavFile.buffer, header.byteLength);
  floatTo16BitPCM(pcmData, 0, interleaved);

  return new Blob([wavFile], { type: "audio/wav" });
}

export default function DownloadModal({
  opened,
  onClose,
  song,
  currentPlaybackRate,
}: DownloadModalProps) {
  const [version, setVersion] = useState<"current" | "original">("current");
  const [isProcessing, setIsProcessing] = useState(false);
  const messageRef = useRef<HTMLDivElement>(null);

  const exportOriginalAsWav = async (): Promise<Blob> => {
    if (messageRef.current) messageRef.current.innerText = "Downloading source...";
    const response = await fetch(song.fileUrl);
    const arrayBuffer = await response.arrayBuffer();

    if (messageRef.current) messageRef.current.innerText = "Decoding audio...";
    const audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    if (messageRef.current) messageRef.current.innerText = "Encoding to WAV...";
    return audioBufferToWav(audioBuffer);
  };

  const exportCurrentSettingsAsWav = async (): Promise<Blob> => {
    if (messageRef.current) messageRef.current.innerText = "Downloading source...";
    const response = await fetch(song.fileUrl);
    const arrayBuffer = await response.arrayBuffer();

    if (messageRef.current) messageRef.current.innerText = "Decoding audio...";
    const audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const duration = audioBuffer.duration / currentPlaybackRate;
    const sampleRate = audioBuffer.sampleRate;
    const offlineCtx = new OfflineAudioContext(
      2,
      Math.ceil(sampleRate * duration),
      sampleRate,
    );

    if (messageRef.current) messageRef.current.innerText = "Rendering...";
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = currentPlaybackRate;
    source.connect(offlineCtx.destination);
    source.start(0);

    const renderedBuffer = await offlineCtx.startRendering();

    if (messageRef.current) messageRef.current.innerText = "Encoding to WAV...";
    return audioBufferToWav(renderedBuffer);
  };

  const handleDownload = async () => {
    setIsProcessing(true);

    try {
      const blob =
        version === "original"
          ? await exportOriginalAsWav()
          : await exportCurrentSettingsAsWav();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        version === "original"
          ? `${song.metadata.title}_original.wav`
          : `${song.metadata.title}_remix.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onClose();
    } catch (e) {
      console.error(e);
      notifications.show({
        title: "Download failed",
        message: (e as Error).message,
        color: "red",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Download" centered>
      <Stack>
        <Alert icon={<IconInfoCircle size={16} />} variant="light">
          Only WAV export is supported for now.
        </Alert>

        <Radio.Group
          label="Version"
          value={version}
          onChange={(v) => setVersion(v as "current" | "original")}
          description="Choose which version to download"
        >
          <Stack mt="xs">
            <Radio
              value="current"
              label="Current settings"
              description={`Speed ${currentPlaybackRate}x and current pitch — export as WAV`}
            />
            <Radio
              value="original"
              label="Original"
              description="Unchanged audio — export as WAV"
            />
          </Stack>
        </Radio.Group>

        {isProcessing && (
          <Stack>
            <Progress value={100} animate striped />
            <Text size="xs" color="dimmed" align="center" ref={messageRef}>
              Starting...
            </Text>
          </Stack>
        )}

        <Group position="right" mt="md">
          <Button variant="default" onClick={onClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button
            onClick={handleDownload}
            loading={isProcessing}
            leftIcon={<IconDownload size={16} />}
          >
            Download
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
