"use client";

import { useState } from "react";
import { Alert, Button, Group, Modal, Progress, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconDownload, IconInfoCircle } from "@tabler/icons-react";
import { Media } from "@/interfaces";
import { parseApiError } from "@/lib/apiError";
import { loadSignalsmithStretch } from "@/lib/signalsmith";
import { STREAM_CHUNK_BYTES } from "@/lib/streamConstants";

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

async function fetchAudioFile(
  url: string,
  onProgress: (percent: number) => void,
): Promise<ArrayBuffer> {
  const probe = await fetch(url, { headers: { Range: "bytes=0-0" } });
  if (!probe.ok) throw new Error(await parseApiError(probe));

  const contentRange = probe.headers.get("content-range");
  const total = contentRange ? Number(contentRange.match(/\/(\d+)$/)?.[1]) : 0;
  if (!total) {
    const result = await probe.arrayBuffer();
    onProgress(100);
    return result;
  }
  await probe.arrayBuffer();

  const chunkSize = STREAM_CHUNK_BYTES;
  const chunkCount = Math.ceil(total / chunkSize);
  const chunks = new Array<Uint8Array>(chunkCount);
  let nextChunk = 0;
  let completedChunks = 0;
  const downloadChunk = async () => {
    while (nextChunk < chunkCount) {
      const index = nextChunk++;
      const start = index * chunkSize;
      const end = Math.min(total - 1, start + chunkSize - 1);
      const response = await fetch(url, {
        headers: { Range: `bytes=${start}-${end}` },
      });
      if (!response.ok) throw new Error(await parseApiError(response));
      chunks[index] = new Uint8Array(await response.arrayBuffer());
      onProgress((++completedChunks / chunkCount) * 100);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(4, chunkCount) }, () => downloadChunk()),
  );

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result.buffer;
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
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState({
    value: 0,
    label: "Starting...",
  });

  const handleDownload = async () => {
    setIsProcessing(true);
    setExportError(null);
    const exportStartedAt = performance.now();
    const mark = (stage: string) => {
      if (process.env.NODE_ENV !== "development") return;
      console.log(
        `[Moonlit][download] ${stage} (${Math.round(performance.now() - exportStartedAt)}ms)`,
      );
    };

    try {
      mark("started");
      setExportProgress({ value: 0, label: "Downloading source..." });
      const arrayBuffer = await fetchAudioFile(media.fileUrl, (percent) => {
        setExportProgress({
          value: Math.round(percent * 0.35),
          label: `Downloading source... ${Math.round(percent)}%`,
        });
      });
      mark(`source downloaded (${Math.round(arrayBuffer.byteLength / 1024)} KiB)`);

      setExportProgress({ value: 40, label: "Decoding audio..." });
      const decodeCtx = new AudioContext();
      const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
      await decodeCtx.close();
      mark(`audio decoded (${audioBuffer.duration.toFixed(1)}s)`);
      setExportProgress({ value: 45, label: "Audio decoded" });

      const sampleRate = audioBuffer.sampleRate;
      const needsRendering =
        currentPlaybackRate !== 1 || currentSemitones !== 0 || currentReverbAmount > 0;
      let renderedBuffer = audioBuffer;

      if (needsRendering) {
        const reverbTailTime = currentReverbAmount > 0 ? 2 : 0;
        const outputDurationSeconds =
          audioBuffer.duration / currentPlaybackRate + reverbTailTime;
        const lengthInSamples = Math.ceil(outputDurationSeconds * sampleRate);
        const offlineCtx = new OfflineAudioContext(2, lengthInSamples, sampleRate);
        const hasWorklet = !!offlineCtx.audioWorklet;

        if (hasWorklet) {
          setExportProgress({
            value: 46,
            label: "Rendering remix (stretch + reverb)...",
          });
          const SignalsmithStretch = await loadSignalsmithStretch();
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
          setExportProgress({ value: 46, label: "Rendering remix (speed + reverb)..." });
          const source = offlineCtx.createBufferSource();
          source.buffer = audioBuffer;
          source.playbackRate.value =
            currentPlaybackRate * Math.pow(2, currentSemitones / 12);
          source.connect(offlineCtx.destination);
          source.start(0);
        }

        renderedBuffer = await offlineCtx.startRendering();
        mark(`audio rendered (${renderedBuffer.duration.toFixed(1)}s)`);
        setExportProgress({ value: 75, label: "Remix rendered" });
      } else {
        mark("render skipped (no remix changes)");
        setExportProgress({ value: 75, label: "Preparing MP3 encoding..." });
      }

      setExportProgress({ value: 77, label: "Loading MP3 encoder..." });
      const { Mp3Encoder } = await import("@breezystack/lamejs");
      mark("MP3 encoder loaded");
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
        if (i % (blockSize * 10) === 0) {
          setExportProgress({
            value: 77 + Math.round((i / leftI.length) * 23),
            label: `Encoding to MP3... ${Math.round((i / leftI.length) * 100)}%`,
          });
          await new Promise((r) => setTimeout(r, 0));
        }
        const lc = leftI.subarray(i, i + blockSize);
        const rc = rightI.subarray(i, i + blockSize);
        const enc = encoder.encodeBuffer(lc, rc);
        if (enc.length > 0) mp3Data.push(new Uint8Array(enc.buffer));
      }
      const flushed = encoder.flush();
      if (flushed.length > 0) mp3Data.push(new Uint8Array(flushed.buffer));
      mark("MP3 encoded");
      setExportProgress({ value: 100, label: "Download ready" });

      const blob = new Blob(mp3Data as BlobPart[], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${media.metadata.title}_remix.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      mark("download triggered");
      onClose();
    } catch (e) {
      console.error(e);
      const message = (e as Error).message || "Download failed";
      setExportError(message);
      notifications.show({
        title: "Download failed",
        message,
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
    <Modal opened={opened} onClose={onClose} title="Download" centered zIndex={400}>
      <Stack>
        <Alert icon={<IconInfoCircle size={16} />} variant="light">
          Exporting remix as MP3
        </Alert>
        <Text size="sm" c="dimmed">
          {parts.join(" — ")}
        </Text>

        {exportError && (
          <Alert color="red" variant="light">
            {exportError}
          </Alert>
        )}

        {isProcessing && (
          <Stack>
            <Progress value={exportProgress.value} animated striped />
            <Text size="xs" c="dimmed" ta="center">
              {exportProgress.label}
            </Text>
          </Stack>
        )}

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button
            onClick={handleDownload}
            loading={isProcessing}
            leftSection={<IconDownload size={16} />}
          >
            Download MP3
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
