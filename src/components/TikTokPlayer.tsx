import LoadingOverlay from "@/components/LoadingOverlay";
import useNoSleep from "@/hooks/useNoSleep";
import { Song } from "@/interfaces";
import { getFormattedTime, getSongLength } from "@/utils";
import {
  ActionIcon,
  Box,
  Button,
  Center,
  CopyButton,
  Flex,
  Image,
  MediaQuery,
  Menu,
  Modal,
  SegmentedControl,
  Slider,
  Stack,
  Text,
  useMantineTheme,
} from "@mantine/core";
import {
  useDisclosure,
  useDocumentTitle,
  useHotkeys,
  useShallowEffect,
} from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconAdjustments,
  IconBrandX,
  IconBug,
  IconCheck,
  IconCopy,
  IconExternalLink,
  IconHome,
  IconLink,
  IconMenu2,
  IconMusic,
  IconPlayerPlayFilled,
  IconRepeat,
  IconRepeatOff,
  IconRewindBackward5,
  IconRewindForward5,
  IconRotate,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import { useEffect, useRef, useState } from "react";
import { IconPause } from "./IconPause";

type PlaybackMode = "slowed" | "normal" | "speedup" | "custom";

export function TikTokPlayer({
  song,
  repeating,
}: {
  song: Song;
  repeating: boolean;
}) {
  const router = useRouter();
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(
    null
  );
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>("normal");
  const [customPlaybackRate, setCustomPlaybackRate] = useState(1);
  const [, forceUpdate] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPosition, setSeekPosition] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);

  useDocumentTitle(`${song.metadata.title} - Moonlit`);

  // Computed values instead of state
  const currentPlayback = videoElement
    ? Math.floor(videoElement.currentTime / videoElement.playbackRate)
    : 0;

  // Use seeking position when dragging, otherwise use actual video position
  const displayPosition = isSeeking ? seekPosition : currentPlayback;

  const isPlaying = videoElement ? !videoElement.paused : false;
  const isFinished = videoElement ? videoElement.ended : false;
  const isRepeat = videoElement ? videoElement.loop : repeating;

  const songLength =
    videoElement && videoElement.duration && !isNaN(videoElement.duration)
      ? getSongLength(videoElement.duration, videoElement.playbackRate) // Adjust for playback rate
      : 0;

  const theme = useMantineTheme();
  const [, setNoSleepEnabled] = useNoSleep();
  const [modalOpened, { open: openModal, close: closeModal }] =
    useDisclosure(false);

  useHotkeys([
    ["ArrowLeft", () => backward()],
    ["ArrowRight", () => forward()],
    ["Space", () => togglePlayer()],
  ]);

  // Apply playback mode changes
  useEffect(() => {
    if (!videoElement) return;

    let playbackRate: number = 1;

    if (playbackMode === "normal") {
      playbackRate = 1;
    } else if (playbackMode === "slowed") {
      playbackRate = 0.8;
    } else if (playbackMode === "speedup") {
      playbackRate = 1.25;
    } else if (playbackMode === "custom") {
      playbackRate = customPlaybackRate;
    }

    // Skip if rate is already correct
    if (Math.abs(videoElement.playbackRate - playbackRate) < 0.01) return;

    // Apply the playback rate
    videoElement.playbackRate = playbackRate;
  }, [playbackMode, customPlaybackRate, videoElement]);

  // Save custom playback rate to localStorage
  useEffect(() => {
    if (playbackMode === "custom") {
      localStorage.setItem(
        "custom-playback-rate",
        JSON.stringify(customPlaybackRate)
      );
    }
  }, [customPlaybackRate, playbackMode]);

  const [mode, setMode] = useQueryState("mode");
  const [rate, setRate] = useQueryState("rate");

  useEffect(
    function syncPlaybackSettingToQuery() {
      setMode(playbackMode === "normal" ? null : playbackMode);

      if (playbackMode === "custom") {
        setRate(customPlaybackRate + "");
      } else {
        setRate(null);
      }
    },
    [playbackMode, customPlaybackRate, setMode, setRate]
  );

  useShallowEffect(
    function initial() {
      let isMounted = true;

      async function setupVideo() {
        try {
          const video = videoRef.current;
          if (!video || !isMounted) return;

          // Check if already initialized to prevent double setup in React Strict Mode
          if (
            videoElement &&
            videoElement === video &&
            video.src === song.fileUrl
          ) {
            console.log(
              "Video already initialized for this song, skipping setup"
            );
            return;
          }

          console.log("Setting up new video:", song.fileUrl);
          setVideoElement(video);

          // Set preservesPitch property for TikTok-style speed effects
          (video as any).preservesPitch = false;
          (video as any).mozPreservesPitch = false; // Firefox
          (video as any).webkitPreservesPitch = false; // Safari

          // Set the video source
          video.src = song.fileUrl;
          video.load(); // Force reload

          // Wait for video to load
          await new Promise((resolve, reject) => {
            const onCanPlay = () => {
              video.removeEventListener("canplay", onCanPlay);
              video.removeEventListener("error", onError);
              resolve(undefined);
            };

            const onError = (e: Event) => {
              video.removeEventListener("canplay", onCanPlay);
              video.removeEventListener("error", onError);
              reject(e);
            };

            if (video.readyState >= 3) {
              resolve(undefined);
            } else {
              video.addEventListener("canplay", onCanPlay);
              video.addEventListener("error", onError);
            }
          });

          // Set playback mode from query parameters
          if (
            !["slowed", "normal", "speedup", "custom"].includes(mode as string)
          ) {
            setPlaybackMode("normal");
          } else {
            setPlaybackMode(mode as PlaybackMode);
            if (mode === "custom") {
              const savedRate = localStorage.getItem("custom-playback-rate");
              const parsedRate = savedRate
                ? JSON.parse(savedRate)
                : parseFloat(rate as string) || 1;
              setCustomPlaybackRate(parsedRate);
            }
          }

          // Initialize video state
          video.currentTime = 0;
          video.loop = repeating; // Set initial loop state
          setIsVideoReady(true);

          console.log("Video setup completed");
        } catch (e) {
          console.error("Video setup failed:", e);
          notifications.show({
            title: "Error",
            message: "An error occurred while loading the video",
          });
          router.push("/");
        }
      }

      setupVideo();

      return () => {
        isMounted = false;
      };
    },
    [song.fileUrl]
  ); // Add song.fileUrl as dependency to re-run when song changes

  useShallowEffect(() => {
    window.onbeforeunload = () => {
      return "Are you sure?";
    };

          return () => {
        console.log("TikTokPlayer cleanup started");
        setPlaybackMode("normal");

      if (videoElement) {
        console.log("Cleaning up video element");
        videoElement.pause();
        videoElement.removeAttribute("src");
        videoElement.load(); // Force cleanup of video resources
      }

      window.onbeforeunload = null;
      setVideoElement(null);
      setIsVideoReady(false);

      console.log("TikTokPlayer cleanup completed");
    };
  }, []);

  // Handle video ended event for non-looping videos
  useEffect(() => {
    if (!videoElement) return;

    const handleEnded = () => {
      if (!videoElement.loop) {
        setNoSleepEnabled(false);
      }
    };

    videoElement.addEventListener('ended', handleEnded);
    return () => videoElement.removeEventListener('ended', handleEnded);
  }, [videoElement, setNoSleepEnabled]);

  // This effect is no longer needed since we use computed values from videoElement

  function togglePlayer() {
    if (!videoElement) {
      console.warn("No video element available");
      return;
    }

    console.log(
      "Toggle player - current state:",
      isPlaying ? "playing" : "paused",
      "video paused:",
      videoElement.paused
    );

    if (isPlaying) {
      console.log("Pausing video");
      videoElement.pause();
      setNoSleepEnabled(false);
    } else {
      console.log("Starting video playback");

      // Set current time if needed
      if (isFinished) {
        videoElement.currentTime = 0;
      }

      videoElement
        .play()
        .then(() => {
          console.log("Video play succeeded");
          setNoSleepEnabled(true);
        })
        .catch((error) => {
          console.error("Video play failed:", error);
        });
    }
  }

  function setPlaybackPosition(value: number) {
    if (!videoElement) {
      console.warn("No video element for seek");
      return;
    }

    console.log("Setting playback position to adjusted time:", value);
    
    // Update seek position for smooth UI
    setSeekPosition(value);
    setIsSeeking(false); // End seeking state

    // Convert adjusted time back to video time
    // If adjustedTime = videoTime/playbackRate, then videoTime = adjustedTime * playbackRate
    const videoTime = value * videoElement.playbackRate;
    videoElement.currentTime = videoTime;

    // If we were playing, continue playing after seek
    if (isPlaying) {
      videoElement
        .play()
        .then(() => {
          console.log("Video resumed after seek");
        })
        .catch((e) => {
          console.error("Failed to resume video after seek:", e);
        });
    }
  }

  function handleSliderChange(value: number) {
    // Update seek position immediately for smooth UI
    setSeekPosition(value);
    setIsSeeking(true);
  }

  function backward() {
    const currentPos = isSeeking ? seekPosition : currentPlayback;
    if (currentPos < 5) {
      setPlaybackPosition(0);
      return;
    }
    setPlaybackPosition(currentPos - 5);
  }

  function forward() {
    const currentPos = isSeeking ? seekPosition : currentPlayback;
    if (currentPos >= songLength - 5) {
      setPlaybackPosition(songLength);
      return;
    }
    setPlaybackPosition(currentPos + 5);
  }

  return (
    <>
      <LoadingOverlay
        visible={!isVideoReady || !videoElement}
        message="Loading video..."
      />
      <Modal
        opened={modalOpened}
        onClose={closeModal}
        overlayProps={{ opacity: 0.5, blur: 4 }}
        title="Customize Playback"
      >
        <Stack>
          <Flex direction="column" mb={22} gap={2}>
            <Text>Playback Rate</Text>
            <Slider
              min={0.5}
              thumbSize={20}
              max={1.5}
              step={0.01}
              style={{ zIndex: 1000 }}
              marks={[
                { value: 0.8, label: "Slowed" },
                { value: 1, label: "Normal" },
                { value: 1.25, label: "Speed Up" },
              ]}
              label={(v) => {
                if (v < 0.7) return `who hurt u? 😭`;
                return `${v}x`;
              }}
              value={customPlaybackRate}
              onChange={setCustomPlaybackRate}
            />
          </Flex>
          <Box>
            <CopyButton value={`${window.location.href}`}>
              {({ copied, copy }) => (
                <Button
                  leftIcon={
                    copied ? <IconCheck size={18} /> : <IconLink size={18} />
                  }
                  color={copied ? "violet" : "primary"}
                  variant={copied ? "filled" : "subtle"}
                  onClick={copy}
                >
                  {copied ? "Copied url!" : "Share ur remix"}
                </Button>
              )}
            </CopyButton>
          </Box>
        </Stack>
      </Modal>

      <Box
        style={{
          position: "relative",
          height: "100dvh",
        }}
      >
        <Flex
          style={{
            position: "absolute",
            top: 28,
            left: 0,
            right: 0,
            zIndex: 2,
          }}
          gap="sm"
          wrap="wrap"
          px="lg"
        >
          <Flex
            style={{ flex: 1 }}
            justify="center"
            align="center"
            direction="column"
            gap="sm"
          >
            <SegmentedControl
              bg={theme.colors.dark[6]}
              color="brand"
              style={{
                boxShadow: "0px 0px 0px 1px #383A3F",
              }}
              size="sm"
              onChange={(value) => setPlaybackMode(value as PlaybackMode)}
              value={playbackMode}
              data={[
                { label: "Slowed", value: "slowed" },
                { label: "Normal", value: "normal" },
                { label: "Speed Up", value: "speedup" },
                {
                  label: (
                    <Center>
                      <IconAdjustments size={18} />
                      <Box ml={10}>Custom</Box>
                    </Center>
                  ),
                  value: "custom",
                },
              ]}
            />
            {playbackMode === "custom" && (
              <Button variant="default" onClick={openModal}>
                Customize Playback
              </Button>
            )}
          </Flex>
        </Flex>

        {/* Video Player */}
        <Box
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 1,
            width: "90%",
            maxWidth: "600px",
            height: "60vh", // Fixed height constraint
            maxHeight: "60vh",
            backgroundColor: "rgba(0,0,0,0.1)", // Debug background to see if box is there
          }}
        >
          <video
            ref={videoRef}
            key={song.fileUrl} // Force re-render when song changes
            style={{
              width: "100%",
              height: "100%", // Fill container height
              borderRadius: "8px",
              objectFit: "contain", // Maintain aspect ratio within bounds
              display: "block",
              cursor: "pointer", // Show pointer cursor to indicate clickability
            }}
            playsInline
            controls={false} // Make sure no native controls interfere
            preload="metadata"
            autoPlay // Allow autoplay since user clicked Play button
            muted={false} // Not muted - let video play audio directly for now
            crossOrigin="anonymous"
            onClick={togglePlayer} // Toggle play/pause when video is clicked
            onTimeUpdate={() => {
              // Force re-render when video time updates
              forceUpdate((prev) => prev + 1);
            }}
            onError={(e) => {
              console.error("Video error:", e);
              notifications.show({
                title: "Video Error",
                message: "Failed to load video",
              });
            }}
          />
        </Box>

        <Box
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 2,
          }}
        >
          <Flex align="center" justify="space-between" m={10}>
            <MediaQuery largerThan="md" styles={{ visibility: "hidden" }}>
              <Text
                fz="sm"
                px={10}
                py={6}
                style={{
                  boxShadow: "0px 0px 0px 1px #383A3F",
                  backgroundColor: theme.colors.dark[6],
                  borderRadius: theme.radius.sm,
                }}
              >{`${getFormattedTime(displayPosition)} / ${getFormattedTime(
                songLength
              )}`}</Text>
            </MediaQuery>
            <Menu shadow="md" width={200} position="top-end">
              <Menu.Target>
                <Button variant="default" leftIcon={<IconMenu2 size={18} />}>
                  Menu
                </Button>
              </Menu.Target>

              <Menu.Dropdown>
                <Menu.Label>Navigation</Menu.Label>
                <Menu.Item
                  icon={<IconHome size={14} />}
                  component={Link}
                  href="/"
                >
                  Home
                </Menu.Item>
                <Menu.Item
                  icon={<IconBug size={14} />}
                  component="a"
                  href="https://github.com/bgwastu/moonlit/issues"
                  rightSection={<IconExternalLink size={12} />}
                  target="_blank"
                >
                  Report Bug
                </Menu.Item>
                <Menu.Item
                  icon={<IconBrandX size={14} />}
                  component="a"
                  href={`https://x.com/intent/tweet?text=I'm listening to ${song.metadata.title} by ${song.metadata.author} on Moonlit!&url=${window.location.href}`}
                  rightSection={<IconExternalLink size={12} />}
                  target="_blank"
                >
                  Share on X
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Flex>
          <Slider
            value={displayPosition}
            onChange={handleSliderChange}
            onChangeEnd={setPlaybackPosition}
            min={0}
            step={1}
            radius={0}
            mb={-3}
            showLabelOnHover={false}
            size="sm"
            pr={0.3}
            styles={{
              thumb: {
                borderWidth: isSeeking ? 3 : 0,
              },
            }}
            thumbSize={isSeeking ? 25 : 15}
            label={(v) => {
              if (displayPosition >= songLength - 5) {
                return null;
              }
              return getFormattedTime(v);
            }}
            max={songLength}
          />
          <Box style={{ backgroundColor: theme.colors.dark[6] }}>
            <Flex gap="sm" px="sm" py="md" justify="space-between">
              <Flex align="center">
                <ActionIcon size="lg" onClick={backward} title="Backward 5 sec">
                  <IconRewindBackward5 />
                </ActionIcon>
                <ActionIcon
                  size="xl"
                  onClick={togglePlayer}
                  title={
                    isPlaying
                      ? "Pause"
                      : isFinished
                      ? "Replay"
                      : "Play"
                  }
                >
                  {isPlaying ? (
                    <IconPause />
                  ) : isFinished ? (
                    <IconRotate size={32} />
                  ) : (
                    <IconPlayerPlayFilled size={32} />
                  )}
                </ActionIcon>
                <ActionIcon size="lg" onClick={forward} title="Forward 5 sec">
                  <IconRewindForward5 />
                </ActionIcon>
                <ActionIcon
                  size="lg"
                  onClick={() => {
                    if (videoElement) {
                      videoElement.loop = !videoElement.loop;
                      forceUpdate(prev => prev + 1); // Trigger re-render
                    }
                  }}
                  title={isRepeat ? "Turn off Repeat" : "Repeat"}
                  style={{
                    backgroundColor: isRepeat
                      ? theme.colors.violet[6]
                      : undefined,
                    color: isRepeat ? theme.white : undefined,
                  }}
                >
                  {isRepeat ? <IconRepeat /> : <IconRepeatOff />}
                </ActionIcon>
                <MediaQuery smallerThan="md" styles={{ display: "none" }}>
                  <Text
                    fz="sm"
                    ml="xs"
                    miw={80}
                    color="dimmed"
                  >{`${getFormattedTime(displayPosition)} / ${getFormattedTime(
                    songLength
                  )}`}</Text>
                </MediaQuery>
              </Flex>
              <Flex gap="sm" align="center" style={{ flex: 1 }}>
                <MediaQuery smallerThan="xs" styles={{ display: "none" }}>
                  <Image
                    src={song.metadata.coverUrl}
                    radius="sm"
                    height={38}
                    width={38}
                    withPlaceholder
                    placeholder={
                      <Center>
                        <IconMusic />
                      </Center>
                    }
                    alt="cover image"
                  />
                </MediaQuery>
                <Flex direction="column">
                  <Text weight="600" lineClamp={1} lh={1.2} fz="sm">
                    {song.metadata.title}
                  </Text>
                  <Text lineClamp={1} color="dimmed" fz="sm" lh={1.2}>
                    {song.metadata.author}
                  </Text>
                </Flex>
              </Flex>
            </Flex>
          </Box>
        </Box>
      </Box>
    </>
  );
}
