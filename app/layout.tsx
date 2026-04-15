import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Invoice Due-Date Tracker",
  description: "Upload supplier invoices and detect payment due dates",
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