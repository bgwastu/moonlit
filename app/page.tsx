"use client";

import Icon from "@/app/components/Icon";
import LocalUpload from "@/app/components/LocalUpload";
import YoutubeUpload from "@/app/components/YoutubeUpload";
import {
  Center,
  Container,
  Divider,
  Flex,
  LoadingOverlay,
} from "@mantine/core";
import { useAtom } from "jotai";
import Player from "./components/Player";
import { loadingAtom, songAtom } from "./state";
import MainProvider from "./components/Provider";

export default function Index() {
  const [song] = useAtom(songAtom);
  const [loading] = useAtom(loadingAtom);

  return (
    <MainProvider>
      <LoadingOverlay visible={loading} />
      {song ? (
        <Player song={song} />
      ) : (
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
      )}
    </MainProvider>
  );
}
