"use client";

import { SiYoutube, SiYoutubemusic } from "@icons-pack/react-simple-icons";
import { Box, Button, Flex, Menu, Text, useMantineTheme } from "@mantine/core";
import {
  IconDownload,
  IconExternalLink,
  IconHome,
  IconMenu2,
  IconMusic,
  IconVideo,
} from "@tabler/icons-react";
import { getFormattedTime } from "@/utils";

export function PlayerFloatingChrome({
  isMobile,
  isMini,
  barHeight,
  isMediaReady,
  displayTime,
  displayDuration,
  lyricsLoading,
  onOpenLyricsModal,
  originalPlatformUrl,
  isAudioTrackVideo,
  hasVideoStream,
  showVideo,
  onRequestCollapse,
  onToggleShowVideo,
  onOpenDownload,
}: {
  isMobile: boolean;
  isMini: boolean;
  barHeight: number;
  isMediaReady: boolean;
  displayTime: number;
  displayDuration: number;
  lyricsLoading: boolean;
  onOpenLyricsModal: () => void;
  originalPlatformUrl: string | null | undefined;
  isAudioTrackVideo: boolean;
  hasVideoStream: boolean;
  showVideo: boolean;
  onRequestCollapse?: () => void;
  onToggleShowVideo: () => void;
  onOpenDownload: () => void;
}) {
  const theme = useMantineTheme();

  if (!isMobile && isMini) return null;

  return (
    <Flex
      align="center"
      justify="space-between"
      gap="xs"
      style={{
        position: "fixed",
        left: 10,
        right: 10,
        bottom: barHeight + 8,
        height: 36,
        zIndex: 202,
        pointerEvents: "none",
      }}
    >
      {isMobile ? (
        <Box
          style={{
            height: 36,
            display: "inline-flex",
            alignItems: "center",
            paddingLeft: 14,
            paddingRight: 14,
            boxShadow: "0px 0px 0px 1px #383A3F",
            backgroundColor: theme.colors.dark[6],
            borderRadius: theme.radius.sm,
            opacity: isMediaReady ? 1 : 0.45,
            pointerEvents: "none",
            flexShrink: 0,
          }}
        >
          <Text
            fz="sm"
            style={{
              fontVariantNumeric: "tabular-nums",
              userSelect: "none",
              WebkitUserSelect: "none",
              lineHeight: 1,
            }}
          >
            {`${getFormattedTime(displayTime)} / ${getFormattedTime(displayDuration)}`}
          </Text>
        </Box>
      ) : null}
      {!isMini ? (
        <Flex gap="xs" style={{ pointerEvents: "auto", marginLeft: "auto" }}>
          <Button
            variant="default"
            size="sm"
            h={36}
            leftSection={<IconMusic size={18} />}
            onClick={onOpenLyricsModal}
            loading={lyricsLoading}
          >
            Lyrics
          </Button>
          <Menu shadow="md" width={200} position="top-end">
            <Menu.Target>
              <Button
                variant="default"
                size="sm"
                h={36}
                leftSection={<IconMenu2 size={18} />}
              >
                Menu
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Navigation</Menu.Label>
              <Menu.Item
                leftSection={<IconHome size={14} />}
                onClick={() => onRequestCollapse?.()}
              >
                Home
              </Menu.Item>
              {originalPlatformUrl ? (
                <Menu.Item
                  leftSection={
                    isAudioTrackVideo ? (
                      <SiYoutubemusic size={14} />
                    ) : (
                      <SiYoutube size={14} />
                    )
                  }
                  component="a"
                  href={originalPlatformUrl}
                  rightSection={<IconExternalLink size={12} />}
                  target="_blank"
                >
                  {isAudioTrackVideo ? "YouTube Music" : "YouTube"}
                </Menu.Item>
              ) : null}
              <Menu.Divider />
              <Menu.Label>Actions</Menu.Label>
              {hasVideoStream ? (
                <Menu.Item
                  leftSection={<IconVideo size={14} />}
                  onClick={onToggleShowVideo}
                  disabled={!hasVideoStream && !showVideo}
                  rightSection={
                    showVideo && hasVideoStream ? (
                      <Text size="xs" c="dimmed">
                        On
                      </Text>
                    ) : undefined
                  }
                >
                  Show video
                </Menu.Item>
              ) : null}
              <Menu.Item
                leftSection={<IconDownload size={14} />}
                onClick={onOpenDownload}
              >
                Download
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Flex>
      ) : null}
    </Flex>
  );
}
