"use client";

import { Song } from "@/interfaces";
import {
  Button,
  Group,
  Modal,
  Progress,
  Select,
  Slider,
  Stack,
  Text,
  rem,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconDownload, IconFileMusic } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

interface DownloadModalProps {
  opened: boolean;
  onClose: () => void;
  song: Song;
  currentPlaybackRate: number;
  currentReverb: number;
}

// Helper to write WAV header
function writeWavHeader(
  sampleRate: number,
  numChannels: number,
  dataLength: number,
) {
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  // RIFF identifier
  writeString(view, 0, "RIFF");
  // file length
  view.setUint32(4, 36 + dataLength, true);
  // RIFF type
  writeString(view, 8, "WAVE");
  // format chunk identifier
  writeString(view, 12, "fmt ");
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (1 = PCM)
  view.setUint16(20, 1, true);
  // channel count
  view.setUint16(22, numChannels, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sampleRate * blockAlign)
  view.setUint32(28, sampleRate * numChannels * 2, true);
  // block align (channel count * bytes per sample) - 16bit = 2 bytes
  view.setUint16(32, numChannels * 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  writeString(view, 36, "data");
  // data chunk length
  view.setUint32(40, dataLength, true);

  return buffer;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function floatTo16BitPCM(
  output: DataView,
  offset: number,
  input: Float32Array,
) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
}

export default function DownloadModal({
  opened,
  onClose,
  song,
  currentPlaybackRate,
  currentReverb,
}: DownloadModalProps) {
  const [playbackRate, setPlaybackRate] = useState(currentPlaybackRate);
  const [reverbAmount, setReverbAmount] = useState(currentReverb);
  const [mode, setMode] = useState<"original" | "processed">("processed");
  const [isProcessing, setIsProcessing] = useState(false);
  const messageRef = useRef<HTMLDivElement>(null);

  // Update initial values if modal opens with new props
  useEffect(() => {
    if (opened) {
      setPlaybackRate(currentPlaybackRate);
      setReverbAmount(currentReverb);
    }
  }, [opened, currentPlaybackRate, currentReverb]);

  // --- Local Audio Processing (Web Audio API) ---

  const processAudioLocally = async () => {
    if (messageRef.current)
      messageRef.current.innerText = "Downloading source...";

    // 1. Fetch Source
    const response = await fetch(song.fileUrl);
    const arrayBuffer = await response.arrayBuffer();

    if (messageRef.current) messageRef.current.innerText = "Decoding audio...";
    const audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // 2. Setup Offline Context
    // New duration = original / rate. Add 2s tail for reverb.
    const duration =
      audioBuffer.duration / playbackRate + (reverbAmount > 0 ? 2 : 0);
    const sampleRate = audioBuffer.sampleRate;
    const offlineCtx = new OfflineAudioContext(
      2,
      sampleRate * duration,
      sampleRate,
    );

    if (messageRef.current)
      messageRef.current.innerText = "Rendering effects...";

    // 3. Create Nodes
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = playbackRate;

    let graphEnd: AudioNode = source;

    if (reverbAmount > 0) {
      // Generate simple IR
      const irDuration = 1.0;
      const irLen = sampleRate * irDuration;
      const irBuffer = offlineCtx.createBuffer(2, irLen, sampleRate);
      for (let c = 0; c < 2; c++) {
        const channel = irBuffer.getChannelData(c);
        for (let i = 0; i < irLen; i++) {
          const n = i / sampleRate;
          // Simple decay
          channel[i] =
            (Math.random() * 2 - 1) * Math.pow(1 - n / irDuration, 2);
        }
      }

      const convolver = offlineCtx.createConvolver();
      convolver.buffer = irBuffer;

      const dry = offlineCtx.createGain();
      const wet = offlineCtx.createGain();

      dry.gain.value = 1 - reverbAmount * 0.5;
      wet.gain.value = reverbAmount;

      source.connect(dry);
      source.connect(convolver);
      convolver.connect(wet);

      const merger = offlineCtx.createGain();
      dry.connect(merger);
      wet.connect(merger);
      graphEnd = merger;
    }

    graphEnd.connect(offlineCtx.destination);
    source.start(0);

    // 4. Render
    const renderedBuffer = await offlineCtx.startRendering();

    if (messageRef.current) messageRef.current.innerText = "Encoding to WAV...";

    // 5. Convert to WAV
    return audioBufferToWav(renderedBuffer);
  };

  const audioBufferToWav = (buffer: AudioBuffer) => {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const samples = buffer.getChannelData(0).length; // length in samples

    // Interleave
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

    // Convert to PCM
    const header = writeWavHeader(
      sampleRate,
      numChannels,
      interleaved.length * 2,
    );
    const wavFile = new Uint8Array(header.byteLength + interleaved.length * 2);

    wavFile.set(new Uint8Array(header), 0);

    const pcmData = new DataView(wavFile.buffer, header.byteLength);
    floatTo16BitPCM(pcmData, 0, interleaved);

    return new Blob([wavFile], { type: "audio/wav" });
  };

  const handleDownload = async () => {
    if (mode === "original") {
      const a = document.createElement("a");
      a.href = song.fileUrl;
      const ext = song.metadata.platform === "youtube" ? "mp4" : "mp3";
      a.download = `${song.metadata.title}_original.${ext}`;
      a.click();
      onClose();
      return;
    }

    setIsProcessing(true);

    try {
      const downloadBlob = await processAudioLocally();
      const url = URL.createObjectURL(downloadBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${song.metadata.title}_remix.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onClose();
    } catch (e) {
      console.error(e);
      notifications.show({
        title: "Processing Failed",
        message: (e as Error).message,
        color: "red",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Download Options" centered>
      <Stack>
        <Select
          label="Version"
          value={mode}
          onChange={(v) =>
            setMode((v as "original" | "processed") || "processed")
          }
          data={[
            { value: "original", label: "Original (Unchanged)" },
            {
              value: "processed",
              label: `Processed (${playbackRate}x Speed${reverbAmount > 0 ? " + Reverb" : ""})`,
            },
          ]}
        />

        {mode === "processed" && (
          <>
            <Stack spacing={4} maw={300}>
              <Text size="sm" weight={500}>
                Playback Speed: {playbackRate}x
              </Text>
              <Slider
                value={playbackRate}
                onChange={setPlaybackRate}
                min={0.5}
                max={1.5}
                step={0.05}
                marks={[
                  { value: 0.8, label: "0.8x" },
                  { value: 1, label: "1x" },
                  { value: 1.25, label: "1.25x" },
                ]}
                mb="sm"
              />
            </Stack>

            <Stack spacing={4} maw={300}>
              <Text size="sm" weight={500}>
                Reverb Amount: {Math.round(reverbAmount * 100)}%
              </Text>
              <Slider
                value={reverbAmount}
                onChange={setReverbAmount}
                min={0}
                max={1}
                step={0.05}
                marks={[
                  { value: 0, label: "0%" },
                  { value: 0.5, label: "50%" },
                  { value: 1, label: "100%" },
                ]}
                mb="md"
              />
            </Stack>

            <Select
              label="Format"
              value="wav"
              disabled
              data={[
                {
                  value: "wav",
                  label: "Audio (WAV) - High Quality",
                  icon: <IconFileMusic size={16} />,
                },
              ]}
              description="Video export is disabled. Using WAV for high quality local audio processing."
            />
          </>
        )}

        {isProcessing && (
          <Stack spacing={4}>
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
