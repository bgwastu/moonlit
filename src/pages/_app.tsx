import { AppProps } from 'next/app';
import Head from 'next/head';
import { MantineProvider, useMantineTheme } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { Provider } from 'jotai';

export default function App(props: AppProps) {
  const { Component, pageProps } = props;
  const theme = useMantineTheme();
  return (
    <>
      <Head>
        <title>Moonlit</title>
        <meta name="description" content="Your melancholy music players." />
        <meta name="viewport" content="minimum-scale=1, initial-scale=1, width=device-width" />
      </Head>

      <Provider>
        <MantineProvider
          withGlobalStyles
          withNormalizeCSS
          theme={{
            colors: {
              brand: theme.colors.violet,
            },
            colorScheme: 'dark',
            primaryColor: 'brand',
            primaryShade: 4
          }}
        >
          <Notifications autoClose={1500}/>
          <Component {...pageProps} />
        </MantineProvider>
      </Provider>
    </>
  );
}
