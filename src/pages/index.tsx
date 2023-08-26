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

interface Loading {
  status: boolean;
  from: "local" | "yt" | "song-init";
}

export default function Index() {
  const theme = useMantineTheme();
  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState<Loading>({
    status: false,
    from: "local",
  });

  useEffect(() => {
    if (!song) return;
    setLoading({ status: true, from: "song-init" });
  }, [song]);

  return (
    <>
      <LoadingOverlay visible={loading.status && loading.from === "song-init"} />
      {song ? (
        <Player
          song={song}
          setLoading={(status) => setLoading({ from: "song-init", status })}
        />
      ) : (
        <Container size="sm" py="md" mt={50}>
          <Flex direction="column" gap="xl">
            <Center>
              <Icon />
            </Center>
            <YoutubeUpload
              setSong={setSong}
              isLoading={loading.status && loading.from === "yt"}
              setLoading={(status) =>
                setLoading({
                  from: "yt",
                  status: status,
                })
              }
              disabled={loading.status}
            />
            <Divider label="OR" labelPosition="center" />
            <LocalUpload
              isLoading={loading.status && loading.from === "local"}
              setSongUrl={setSong}
              setLoading={(status) =>
                setLoading({
                  from: "yt",
                  status: status,
                })
              }
              disabled={loading.status}
            />
          </Flex>
        </Container>
      )}
    </>
  );
}
