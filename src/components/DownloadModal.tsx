"use client";

import { useRef, useState } from "react";
import { Alert, Button, Group, Modal, Progress, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconDownload, IconInfoCircle } from "@tabler/icons-react";
import { Media } from "@/interfaces";

interface DownloadModalProps {
  opened: boolean;
  onClose: () => void;
  media: Media;
  currentPlaybackRate: number;
  currentSemitones: number;
  currentReverbAmount: number;
}

function generateImpulseResponse(
  context: OfflineAudioContext,
  dur = 2,
  decay = 2,
): AudioBuffer {
  const sampleRate = context.sampleRate;
  const length = sampleRate * dur;
  const impulse = context.createBuffer(2, length, sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = impulse.getChannelData(c);
    for (let i = 0; i < length; i++) {
      const n = i / sampleRate;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / dur, decay);
    }
  }
  return impulse;
}

export default function DownloadModal({
  opened,
  onClose,
  media,
  currentPlaybackRate,
  currentSemitones,
  currentReverbAmount,
}: DownloadModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const messageRef = useRef<HTMLDivElement>(null);

  const handleDownload = async () => {
    setIsProcessing(true);

    try {
      if (messageRef.current) messageRef.current.innerText = "Downloading source...";
      const response = await fetch(media.fileUrl);
      const arrayBuffer = await response.arrayBuffer();

      if (messageRef.current) messageRef.current.innerText = "Decoding audio...";
      const decodeCtx = new AudioContext();
      const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
      await decodeCtx.close();

      const sampleRate = audioBuffer.sampleRate;
      const reverbTailTime = currentReverbAmount > 0 ? 2 : 0;
      const outputDurationSeconds =
        audioBuffer.duration / currentPlaybackRate + reverbTailTime;
      const lengthInSamples = Math.ceil(outputDurationSeconds * sampleRate);

      const offlineCtx = new OfflineAudioContext(2, lengthInSamples, sampleRate);
      const hasWorklet = !!offlineCtx.audioWorklet;

      if (hasWorklet) {
        if (messageRef.current)
          messageRef.current.innerText = "Rendering (stretch + reverb)...";
        const SignalsmithStretch = (await import("signalsmith-stretch")).default;
        const stretchNode = await SignalsmithStretch(offlineCtx);

        const channelBuffers: Float32Array[] = [];
        for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
          channelBuffers.push(audioBuffer.getChannelData(c));
        }
        await stretchNode.addBuffers(channelBuffers);

        stretchNode.schedule({
          active: true,
          input: 0,
          rate: currentPlaybackRate,
          semitones: currentSemitones,
          loopStart: 0,
          loopEnd: 0,
        });

        if (currentReverbAmount > 0) {
          const convolver = offlineCtx.createConvolver();
          const dryGain = offlineCtx.createGain();
          const wetGain = offlineCtx.createGain();
          convolver.buffer = generateImpulseResponse(offlineCtx, 2, 2);
          dryGain.gain.value = 1 - currentReverbAmount * 0.5;
          wetGain.gain.value = currentReverbAmount;
          stretchNode.connect(dryGain);
          stretchNode.connect(convolver);
          convolver.connect(wetGain);
          dryGain.connect(offlineCtx.destination);
          wetGain.connect(offlineCtx.destination);
        } else {
          stretchNode.connect(offlineCtx.destination);
        }
      } else {
        if (messageRef.current)
          messageRef.current.innerText = "Rendering (speed + reverb)...";
        const source = offlineCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.playbackRate.value =
          currentPlaybackRate * Math.pow(2, currentSemitones / 12);
        source.connect(offlineCtx.destination);
        source.start(0);
      }

      const renderedBuffer = await offlineCtx.startRendering();

      if (messageRef.current) messageRef.current.innerText = "Encoding to MP3...";
      const { Mp3Encoder } = await import("@breezystack/lamejs");
      const encoder = new Mp3Encoder(2, sampleRate, 128);
      const left = renderedBuffer.getChannelData(0);
      const right =
        renderedBuffer.numberOfChannels > 1 ? renderedBuffer.getChannelData(1) : left;
      const toInt16 = (f: Float32Array) => {
        const i = new Int16Array(f.length);
        for (let j = 0; j < f.length; j++) {
          const s = Math.max(-1, Math.min(1, f[j]));
          i[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        return i;
      };
      const leftI = toInt16(left);
      const rightI = toInt16(right);
      const mp3Data: Uint8Array[] = [];
      const blockSize = 1152;
      for (let i = 0; i < leftI.length; i += blockSize) {
        if (i % (blockSize * 10) === 0) await new Promise((r) => setTimeout(r, 0));
        const lc = leftI.subarray(i, i + blockSize);
        const rc = rightI.subarray(i, i + blockSize);
        const enc = encoder.encodeBuffer(lc, rc);
        if (enc.length > 0) mp3Data.push(new Uint8Array(enc.buffer));
      }
      const flushed = encoder.flush();
      if (flushed.length > 0) mp3Data.push(new Uint8Array(flushed.buffer));

      const blob = new Blob(mp3Data as BlobPart[], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${media.metadata.title}_remix.mp3`;
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

  const parts = [`Speed ${currentPlaybackRate}x`];
  if (currentSemitones !== 0)
    parts.push(
      `Pitch ${currentSemitones >= 0 ? "+" : ""}${currentSemitones.toFixed(1)} semitones`,
    );
  if (currentReverbAmount > 0)
    parts.push(`${Math.round(currentReverbAmount * 100)}% reverb`);

  return (
    <Modal opened={opened} onClose={onClose} title="Download" centered>
      <Stack>
        <Alert icon={<IconInfoCircle size={16} />} variant="light">
          Exporting remix as MP3
        </Alert>
        <Text size="sm" color="dimmed">
          {parts.join(" — ")}
        </Text>

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
            Download MP3
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
