"use client";

import Icon from "@/components/Icon";
import { Player } from "@/components/Player";
import useNoSleep from "@/hooks/useNoSleep";
import { songAtom } from "@/state";
import {
  Button,
  Center,
  Container,
  Flex,
  Image,
  Text,
  rem,
} from "@mantine/core";
import { IconMusic } from "@tabler/icons-react";
import { useAtom } from "jotai";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function LocalFilePlayer() {
  const [song, setSong] = useAtom(songAtom);
  const router = useRouter();
  const [noSleepEnabled, setNoSleepEnabled] = useNoSleep();
  const [isPlayer, setIsPlayer] = useState(false);

  useEffect(() => {
    // Only allow local files in /player route
    // If no song is loaded or song is not from local file, redirect to home
    if (!song || song.metadata.platform) {
      router.replace("/");
      return;
    }
  }, [song, router]);

  const handleGoToPlayer = () => {
    setIsPlayer(true);
    if (!noSleepEnabled) {
      setNoSleepEnabled(true);
    }
  };

  if (isPlayer && song) {
    return <Player song={song} repeating={false} />;
  }

  if (!song) {
    // Redirect handled by useEffect
    return null;
  }

  return (
    <Container size="xs">
      <Flex
        h="100dvh"
        align="stretch"
        justify="center"
        gap="md"
        direction="column"
      >
        <Flex gap={12} align="center" mb="sm">
          <Icon size={18} />
          <Text
            fz={rem(20)}
            fw="bold"
            lts={rem(0.2)}
            style={{
              userSelect: "none",
            }}
          >
            Moonlit
          </Text>
        </Flex>
        <Text weight={600} color="dimmed">
          Local File
        </Text>
        <Flex gap="md" align="center">
          <Image
            src={song.metadata.coverUrl}
            radius="sm"
            height={48}
            width={48}
            withPlaceholder
            placeholder={
              <Center>
                <IconMusic />
              </Center>
            }
            alt="cover image"
          />
          <Flex direction="column">
            <Text weight={600}>{song.metadata.title}</Text>
            <Text>{song.metadata.author}</Text>
          </Flex>
        </Flex>
        <Button onClick={handleGoToPlayer}>Play</Button>
      </Flex>
    </Container>
  );
}
