"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Center, Container, Flex, Image, Text, rem } from "@mantine/core";
import { IconMusic } from "@tabler/icons-react";
import Icon from "@/components/Icon";
import { Player } from "@/components/Player";
import { useAppContext } from "@/context/AppContext";
import useNoSleep from "@/hooks/useNoSleep";
import { HistoryItem } from "@/interfaces";
import { getPlatform } from "@/utils";

export default function LocalInitialPlayer() {
  const router = useRouter();
  const { media, setHistory } = useAppContext();
  const [isPlayer, setIsPlayer] = useState(false);
  const [noSleepEnabled, noSleepControls] = useNoSleep();

  useEffect(() => {
    if (!media || getPlatform(media.sourceUrl) !== "local") router.replace("/");
  }, [media, router]);

  if (!media || getPlatform(media.sourceUrl) !== "local") {
    return null;
  }

  const handleGoToPlayer = () => {
    setIsPlayer(true);
    if (!noSleepEnabled) noSleepControls.enable();

    setHistory((prev) => {
      const filtered = prev.filter((item) => item.sourceUrl !== media.sourceUrl);
      const newItem: HistoryItem = { ...media, playedAt: Date.now() };
      return [newItem, ...filtered].slice(0, 50);
    });
  };

  if (isPlayer) return <Player key={media.fileUrl} media={media} repeating={false} />;

  return (
    <Container size="xs">
      <Flex h="100dvh" align="stretch" justify="center" gap="md" direction="column">
        <Link href="/" style={{ textDecoration: "none", color: "inherit" }}>
          <Flex gap={12} align="center" mb="sm">
            <Icon size={18} />
            <Text fz={rem(20)} fw="bold" lts={rem(0.2)} style={{ userSelect: "none" }}>
              Moonlit
            </Text>
          </Flex>
        </Link>
        <Text weight={600} color="dimmed">
          Local File
        </Text>
        <Flex gap="md" align="center">
          <Image
            src={media.metadata.coverUrl}
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
            <Text weight={600}>{media.metadata.title}</Text>
            <Text>
              {media.metadata.artist ?? media.metadata.author}
              {media.metadata.album && ` · ${media.metadata.album}`}
            </Text>
          </Flex>
        </Flex>
        <Button onClick={handleGoToPlayer}>Play</Button>
      </Flex>
    </Container>
  );
}
