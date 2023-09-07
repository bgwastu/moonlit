import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Moonlit",
  description: "Your melancholy music players.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
