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
  Text,
  rem,
  useMantineTheme,
} from "@mantine/core";
import { useAtom } from "jotai";
import Player from "./components/Player";
import { isDockedAtom, loadingAtom, songAtom } from "./state";
import MainProvider from "./components/Provider";
import { useState } from "react";

export default function Index() {
  const [song] = useAtom(songAtom);
  const [loading] = useAtom(loadingAtom);
  const [isDocked, setIsDocked] = useAtom(isDockedAtom);
  const theme = useMantineTheme();

  return (
    <MainProvider>
      <LoadingOverlay visible={loading} />
      <Box style={{
        position: 'relative'
      }}>
        {song && <Player song={song}/>}
        <Container size="sm" my="md" p="xl" style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: -1
        }}>
          <Flex direction="column" gap="xl">
            <Center my={28}>
              <Flex gap="sm" align="center">
                <Icon />
                <Text
                  style={{
                    fontSize: rem(26),
                    fontWeight: "bold",
                    letterSpacing: rem(1),
                    userSelect: "none",
                  }}
                >
                  Moonlit
                </Text>
              </Flex>
            </Center>
            <YoutubeUpload />
            <Divider label="OR" labelPosition="center" />
            <LocalUpload />
          </Flex>
        </Container>
      </Box>
    </MainProvider>
  );
}
