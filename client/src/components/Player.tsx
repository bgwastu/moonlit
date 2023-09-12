import {
  ActionIcon,
  Box,
  Button,
  Center,
  Flex,
  Image,
  MediaQuery,
  Modal,
  SegmentedControl,
  Slider,
  Text,
  useMantineTheme
} from "@mantine/core";
import { useDisclosure, useShallowEffect } from "@mantine/hooks";
import { useAtom } from "jotai";
import { useEffect, useState } from "react";
import { useInterval } from "../hooks/useInterval";
import { Song } from "../interfaces";
import {
  currentPlaybackAtom,
  customPlaybackSettingsAtom,
  isDockedAtom,
  playbackModeAtom,
  playerAtom,
} from "../state";

const getSongLength = (bufferDuration: number, playbackRate: number) => {
  return bufferDuration / playbackRate;
};

type State = "playing" | "stop" | "finished";

function getFormattedTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.ceil(seconds % 60);

  const formattedMinutes = String(minutes).padStart(2, "");
  const formattedSeconds = String(remainingSeconds).padStart(2, "0");

  return `${formattedMinutes}:${formattedSeconds}`;
}

export default function Player({ song }: { song: Song }) {
  const [currentPlayback, setCurrentPlayback] = useAtom(currentPlaybackAtom);
  const [state, setState] = useState<State>("stop");
  const [player] = useAtom(playerAtom);
  const [isDocked, setIsDocked] = useAtom(isDockedAtom);
  const [playbackMode, setPlaybackMode] = useAtom(playbackModeAtom);
  const [customPlaybackSettings, setCustomPlaybackSettings] = useAtom(
    customPlaybackSettingsAtom
  );
  const songLength = getSongLength(player.buffer.duration, player.playbackRate);
  const theme = useMantineTheme();
  const { start: startInterval, stop: stopInterval } = useInterval(
    () => setCurrentPlayback((s) => s + 1),
    1000
  );
  const [modalOpened, { open: openModal, close: closeModal }] =
    useDisclosure(false);

  // playing onmount
  useShallowEffect(() => {
    if(song){
      player.start(0, currentPlayback * player.playbackRate);
    }
    setState("playing");
  }, []);

  useEffect(() => {
    if (state === "playing") {
      startInterval();
    } else {
      stopInterval();
    }
  }, [startInterval, state, stopInterval]);

  useEffect(() => {
    if (player.state === "stopped") {
      setState("stop");
    } else if (player.state === "started") {
      setState("playing");
    }
    if (player.state === "stopped" && currentPlayback >= songLength) {
      setState("finished");
      stopInterval();
    }
  }, [currentPlayback, player.state, songLength, startInterval, stopInterval]);

  function togglePlayer() {
    if (state === "playing") {
      player.stop();
      setState("stop");
    } else if (state === "stop") {
      player.start(0, currentPlayback * player.playbackRate);
      setState("playing");
    } else if (state === "finished") {
      setCurrentPlayback(0);
      player.start(0);
      setState("playing");
    }
  }

  function setPlaybackPosition(value: number) {
    if (state === "playing") {
      player.stop();
      player.start(0, value * player.playbackRate);
    }
    setCurrentPlayback(value);
  }

  return (
    <>
      
    </>
  );
}
