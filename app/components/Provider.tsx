import { MantineProvider, useMantineTheme } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { DevTools } from "jotai-devtools";

export default function MainProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = useMantineTheme();
  return (
    <>
      <DevTools />
      <MantineProvider
        withGlobalStyles
        withNormalizeCSS
        theme={{
          colors: {
            brand: theme.colors.violet,
          },
          colorScheme: "dark",
          primaryColor: "brand",
          primaryShade: 4,
        }}
      >
        <Notifications autoClose={1500} />
        {children}
      </MantineProvider>
    </>
  );
}
