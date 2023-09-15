"use client";
export const dynamic = 'force-dynamic';

import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import Head from "next/head";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  
  return (

    
    <html lang="en">
      <Head>
        <title>Moonlit</title>
        <meta name="description" content="Your melancholy music player" />
      </Head>
      <body>
        <MantineProvider
          withGlobalStyles
          withNormalizeCSS
          theme={{
            colorScheme: "dark",
            primaryColor: "violet",
            primaryShade: 4,
          }}
        >
          <Notifications />
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}