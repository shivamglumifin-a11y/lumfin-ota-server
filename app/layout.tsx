export const metadata = {
  title: 'Lumfin OTA Update Server',
  description: 'Over-the-air update server for Lumfin mobile app',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

