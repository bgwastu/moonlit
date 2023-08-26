import Icon from "@/src/components/Icon";
import LocalUpload from "@/src/components/LocalUpload";
import YoutubeUpload from "@/src/components/YoutubeUpload";
import {
  Center,
  Container,
  Divider,
  Flex,
  LoadingOverlay,
  Modal,
  Image,
  useMantineTheme,
  Text,
} from "@mantine/core";
import { useEffect, useState } from "react";
import { Song } from "../interfaces";
import Player from "../components/Player";
import { useAtom } from "jotai";
import { loadingAtom } from "../state";

export default function Index() {
  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useAtom(loadingAtom);
  const [loading] = useAtom(loadingAtom);

  return (
    <>
      <LoadingOverlay visible={loading} />
      {song ? (
        <Player
          song={song}
        />
      ) : (
        <Container size="sm" my="md" p="xl">
          <Flex direction="column" gap="xl">
            <Center my={28}>
              <Icon />
            </Center>
            <YoutubeUpload
              setSong={setSong}
            />
            <Divider label="OR" labelPosition="center" />
            <LocalUpload
              setSongUrl={setSong}
            />
          </Flex>
        </Container>
      )}
    </>
  );
}
