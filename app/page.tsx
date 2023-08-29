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
  createStyles,
  rem,
} from "@mantine/core";
import { useAtom } from "jotai";
import Player from "./components/Player";
import { loadingAtom, songAtom } from "./state";
import MainProvider from "./components/Provider";
import { useState } from "react";

const useStyles = createStyles((theme) => ({
  wrapper: {
    // position: 'absolute'
  },
  player: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
    backgroundColor: theme.colors.dark[7],
    height: '100%',
    width: '100%'
  },
}));

export default function Index() {
  const [song] = useAtom(songAtom);
  const [loading] = useAtom(loadingAtom);
  const { classes } = useStyles();
  const [isDocked, setIsDocked] = useState(false);

  return (
    <MainProvider>
      <LoadingOverlay visible={loading} />
      <Box className={classes.wrapper}>
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
        {song && (
          <Box className={classes.player}>
            <Player song={song} />
           </Box>
        )}
      </Box>
    </MainProvider>
  );
}
