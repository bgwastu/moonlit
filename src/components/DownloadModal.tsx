"use client";

import { useRef, useState } from "react";
import { Alert, Button, Group, Modal, Progress, Radio, Stack, Text } from "@mantine/core";
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
async function audioBufferToMp3(
  buffer: AudioBuffer,
  bitrate: number = 128,
): Promise<Blob> {
  const { Mp3Encoder } = await import("@breezystack/lamejs");

  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const encoder = new Mp3Encoder(numChannels === 1 ? 1 : 2, sampleRate, bitrate);

  const toInt16 = (float32: Float32Array): Int16Array => {
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16;
  };

  const left = buffer.getChannelData(0);
  const right = numChannels === 2 ? buffer.getChannelData(1) : left;
  const leftInt16 = toInt16(left);
  const rightInt16 = toInt16(right);

  const mp3Data: Uint8Array[] = [];
  const blockSize = 1152;

  for (let i = 0; i < leftInt16.length; i += blockSize) {
    const leftChunk = leftInt16.subarray(i, i + blockSize);
    const rightChunk = rightInt16.subarray(i, i + blockSize);
    const encoded =
      numChannels === 2
        ? encoder.encodeBuffer(leftChunk, rightChunk)
        : encoder.encodeBuffer(leftChunk);
    if (encoded.length > 0) mp3Data.push(new Uint8Array(encoded.buffer));
  }

  const flushed = encoder.flush();
  if (flushed.length > 0) mp3Data.push(new Uint8Array(flushed.buffer));

  return new Blob(mp3Data as BlobPart[], { type: "audio/mpeg" });
}

// Generate impulse response for reverb
function generateImpulseResponse(
  context: OfflineAudioContext,
  duration: number = 2,
  decay: number = 2,
): AudioBuffer {
  const sampleRate = context.sampleRate;
  const length = sampleRate * duration;
  const impulse = context.createBuffer(2, length, sampleRate);
  const leftChannel = impulse.getChannelData(0);
  const rightChannel = impulse.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const n = i / sampleRate;
    leftChannel[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / duration, decay);
    rightChannel[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / duration, decay);
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
  const [version, setVersion] = useState<"current" | "original">("current");
  const [format, setFormat] = useState<"wav" | "mp3">("wav");
  const [isProcessing, setIsProcessing] = useState(false);
  const messageRef = useRef<HTMLDivElement>(null);

  const encodeBuffer = async (buffer: AudioBuffer): Promise<Blob> => {
    if (format === "mp3") return audioBufferToMp3(buffer);
    return audioBufferToWav(buffer);
  };

  const exportOriginal = async (): Promise<{ blob: Blob; ext: string }> => {
    if (messageRef.current) messageRef.current.innerText = "Downloading source...";
    const response = await fetch(media.fileUrl);
    const arrayBuffer = await response.arrayBuffer();

    if (messageRef.current) messageRef.current.innerText = "Decoding audio...";
    const audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    await audioContext.close();

    if (messageRef.current)
      messageRef.current.innerText = `Encoding to ${format.toUpperCase()}...`;
    const blob = await encodeBuffer(audioBuffer);

    return { blob, ext: format };
  };

  const exportCurrentSettings = async (): Promise<{ blob: Blob; ext: string }> => {
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

    // Use stretch (rate + pitch) when AudioWorklet is available for 1:1 with playback
    const useStretch = !!offlineCtx.audioWorklet;

    if (useStretch) {
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
        // Same loopStart/loopEnd disables auto-loop per signalsmith-stretch
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

      if (currentReverbAmount > 0) {
        const convolver = offlineCtx.createConvolver();
        const dryGain = offlineCtx.createGain();
        const wetGain = offlineCtx.createGain();

        convolver.buffer = generateImpulseResponse(offlineCtx, 2, 2);
        dryGain.gain.value = 1 - currentReverbAmount * 0.5;
        wetGain.gain.value = currentReverbAmount;

        source.connect(dryGain);
        source.connect(convolver);
        convolver.connect(wetGain);
        dryGain.connect(offlineCtx.destination);
        wetGain.connect(offlineCtx.destination);
      } else {
        source.connect(offlineCtx.destination);
      }
      source.start(0);
    }

    const renderedBuffer = await offlineCtx.startRendering();

    if (messageRef.current)
      messageRef.current.innerText = `Encoding to ${format.toUpperCase()}...`;
    const blob = await encodeBuffer(renderedBuffer);

    return { blob, ext: format };
  };

  const handleDownload = async () => {
    setIsProcessing(true);

    try {
      const { blob, ext } =
        version === "original" ? await exportOriginal() : await exportCurrentSettings();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        version === "original"
          ? `${media.metadata.title}.${ext}`
          : `${media.metadata.title}_remix.${ext}`;
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

  const getSettingsDescription = () => {
    const parts = [`Speed ${currentPlaybackRate}x`];
    if (currentSemitones !== 0) {
      parts.push(
        `Pitch ${currentSemitones >= 0 ? "+" : ""}${currentSemitones.toFixed(1)} semitones`,
      );
    }
    if (currentReverbAmount > 0) {
      parts.push(`${Math.round(currentReverbAmount * 100)}% reverb`);
    }
    return `${parts.join(", ")} — export as ${format.toUpperCase()}`;
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Download" centered>
      <Stack>
        <Alert icon={<IconInfoCircle size={16} />} variant="light">
          {version === "original"
            ? `Converting original file to ${format.toUpperCase()}`
            : `Exporting remix as ${format.toUpperCase()}`}
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
              description={getSettingsDescription()}
            />
            <Radio
              value="original"
              label="Original"
              description={`Download original file as ${format.toUpperCase()}`}
            />
          </Stack>
        </Radio.Group>

        <Radio.Group
          label="Format"
          value={format}
          onChange={(v) => setFormat(v as "wav" | "mp3")}
        >
          <Group mt="xs">
            <Radio value="wav" label="WAV" description="Lossless, big file" />
            <Radio value="mp3" label="MP3" description="Compressed, smaller file" />
          </Group>
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
