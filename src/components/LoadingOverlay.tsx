import {
  Flex,
  Loader,
  LoadingOverlay as MantineLoadingOverlay,
  Text,
} from "@mantine/core";

interface Props {
  visible: boolean;
  message: string | null;
}
export default function LoadingOverlay({ visible, message }: Props) {
  return (
    <MantineLoadingOverlay
      visible={visible}
      overlayBlur={5}
      loader={
        <Flex direction="column" gap="md" align="center" justify="center">
          <Loader />
          {message && <Text>{message}</Text>}
        </Flex>
      }
    />
  );
}
