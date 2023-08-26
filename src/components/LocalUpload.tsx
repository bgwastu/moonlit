import { Group, Text, rem } from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import { notifications } from "@mantine/notifications";
import parse from "id3-parser";
import { convertFileToBuffer } from "id3-parser/lib/util";
import { Dispatch, SetStateAction } from "react";
import { Song, SongMetadata } from "../interfaces";
import { useAtom } from "jotai";
import { loadingAtom } from "../state";

interface Props {
  setSongUrl: Dispatch<SetStateAction<Song | null>>;
}

export default function LocalUpload({ setSongUrl }: Props) {
  const [loading, setLoading] = useAtom(loadingAtom);
  return (
    <Dropzone
      accept={["audio/mpeg"]}
      maxFiles={1}
      disabled={loading}
      onDrop={async (files) => {
        setLoading(true);
        try {
          const tags = await convertFileToBuffer(files[0]).then(parse);
          if (tags !== false) {
            let imgSrc = "";

            if (tags.image?.data) {
              const coverBlob = new Blob([new Uint8Array(tags.image.data)], {
                type: tags.image.mime,
              });
              imgSrc = URL.createObjectURL(coverBlob);
            }

            const metadata: SongMetadata = {
              title: tags.title ?? files[0].name,
              author: tags.artist ?? "Unknown",
              coverUrl: imgSrc,
            };

            setSongUrl({
              fileUrl: URL.createObjectURL(files[0]),
              metadata,
            });
          } else {
            setSongUrl({
              fileUrl: URL.createObjectURL(files[0]),
              metadata: {
                title: files[0].name,
                author: "Unknown",
                coverUrl: "",
              },
            });
          }
        } finally {
          setLoading(false);
        }
      }}
      onReject={(files) => {
        files[0].errors.forEach((e) => {
          notifications.show({
            title: "Error",
            message: e.message,
          });
        });
        console.log();
      }}
    >
      <Group
        position="center"
        spacing="xl"
        style={{ minHeight: rem(220), pointerEvents: "none" }}
      >
        <Dropzone.Accept>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
          >
            <g fill="currentColor">
              <path
                fill-rule="evenodd"
                d="M17.47 14.47a.75.75 0 0 1 1.06 0l2.5 2.5a.75.75 0 1 1-1.06 1.06l-1.22-1.22V22a.75.75 0 0 1-1.5 0v-5.19l-1.22 1.22a.75.75 0 1 1-1.06-1.06l2.5-2.5Z"
                clip-rule="evenodd"
              />
              <path d="M12.756 8.644a.96.96 0 0 1 .012-.118a.25.25 0 0 1 .253-.157c.008.003.04.012.11.043c.109.047.25.118.475.23l1.317.658a6.714 6.714 0 0 1 .23.12a.25.25 0 0 1 .092.15l.003.045a11.444 11.444 0 0 1-.005.742a.963.963 0 0 1-.01.117a.25.25 0 0 1-.255.157a1.003 1.003 0 0 1-.11-.042c-.108-.047-.25-.118-.474-.23L13.077 9.7a6.687 6.687 0 0 1-.23-.12a.25.25 0 0 1-.092-.15a11.44 11.44 0 0 1 .002-.786ZM10 13.75a1.25 1.25 0 1 1 0 2.5a1.25 1.25 0 0 1 0-2.5Z" />
              <path
                fill-rule="evenodd"
                d="M15.75 21.273A9.971 9.971 0 0 1 12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10a9.985 9.985 0 0 1-.547 3.27l-1.863-1.86a2.25 2.25 0 0 0-3.182 0l-2.5 2.5a2.25 2.25 0 0 0 1.841 3.827v1.537Zm-3-10.06l.99.496c.203.101.38.19.529.255c.15.066.33.133.528.156a1.75 1.75 0 0 0 1.848-1.142a1.87 1.87 0 0 0 .096-.542c.009-.162.009-.361.009-.588v-.06c0-.161 0-.333-.031-.499a1.75 1.75 0 0 0-.656-1.061a2.642 2.642 0 0 0-.433-.251l-1.37-.685c-.203-.102-.38-.19-.529-.255a1.867 1.867 0 0 0-.528-.157a1.75 1.75 0 0 0-1.848 1.142a1.87 1.87 0 0 0-.097.543A8.912 8.912 0 0 0 11.25 9v3.55a2.75 2.75 0 1 0 1.5 2.45v-3.786Z"
                clip-rule="evenodd"
              />
            </g>
          </svg>
        </Dropzone.Accept>
        <Dropzone.Reject>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
          >
            <path
              fill="currentColor"
              d="M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16zM2 12C2 6.477 6.477 2 12 2s10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12zm5.793-4.207a1 1 0 0 1 1.414 0L12 10.586l2.793-2.793a1 1 0 1 1 1.414 1.414L13.414 12l2.793 2.793a1 1 0 0 1-1.414 1.414L12 13.414l-2.793 2.793a1 1 0 0 1-1.414-1.414L10.586 12L7.793 9.207a1 1 0 0 1 0-1.414z"
            />
          </svg>
        </Dropzone.Reject>
        <Dropzone.Idle>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 256 256"
          >
            <g fill="currentColor">
              <path
                d="M208 172a28 28 0 1 1-28-28a28 28 0 0 1 28 28Zm-156 4a28 28 0 1 0 28 28a28 28 0 0 0-28-28Z"
                opacity=".2"
              />
              <path d="M212.92 25.69a8 8 0 0 0-6.86-1.45l-128 32A8 8 0 0 0 72 64v110.08A36 36 0 1 0 88 204V70.25l112-28v99.83A36 36 0 1 0 216 172V32a8 8 0 0 0-3.08-6.31ZM52 224a20 20 0 1 1 20-20a20 20 0 0 1-20 20Zm128-32a20 20 0 1 1 20-20a20 20 0 0 1-20 20Z" />
            </g>
          </svg>
        </Dropzone.Idle>

        <div>
          <Text size="xl" inline>
            Upload music file here
          </Text>
          <Text size="sm" color="dimmed" inline mt={7}>
            Drag & drop the file or just click this window
          </Text>
        </div>
      </Group>
    </Dropzone>
  );
}
