"use client";

import Icon from "@/app/components/Icon";
import LocalUpload from "@/app/components/LocalUpload";
import YoutubeUpload from "@/app/components/YoutubeUpload";
import {
  Box,
  Center,
  Container,
  Divider,
  Flex,
  LoadingOverlay,
  Image,
  SegmentedControl,
  createStyles,
  rem,
} from "@mantine/core";
import { useAtom } from "jotai";
import Player from "./components/Player";
import { loadingAtom, songAtom } from "./state";
import MainProvider from "./components/Provider";
import { useState } from "react";

export default function Index() {
  const [song] = useAtom(songAtom);
  const [loading] = useAtom(loadingAtom);
  const [isDocked, setIsDocked] = useState(false);

  return (
    <MainProvider>
      <LoadingOverlay visible={loading} />
      {song ? (
        <Player song={song} />
      ) : (
        <Box>
          <Container size="sm" my="md" p="xl">
            <Flex direction="column" gap="xl">
              <Center my={28}>
                <Icon />
              </Center>
              <YoutubeUpload />
              <Divider label="OR" labelPosition="center" />
              <LocalUpload />
            </Flex>
          </Container>
        </Box>
      )}
    </MainProvider>
  );
}
