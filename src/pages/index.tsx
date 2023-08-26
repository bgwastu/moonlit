import Icon from "@/src/components/Icon";
import LocalUpload from "@/src/components/LocalUpload";
import YoutubeUpload from "@/src/components/YoutubeUpload";
import {
  Center,
  Container,
  Divider,
  Flex,
  LoadingOverlay
} from "@mantine/core";
import { useAtom } from "jotai";
import Player from "../components/Player";
import { loadingAtom, songAtom } from "../state";

export default function Index() {
  const [song] = useAtom(songAtom);
  const [loading] = useAtom(loadingAtom);

  return (
    <>
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
    </>
  );
}
