import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlashFox",
  description: "Fast. Smart. On Time.",
  icons: {
    icon: "/flashfox-icon.png",
  },
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