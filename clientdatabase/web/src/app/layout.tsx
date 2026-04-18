import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agency Intelligence Platform",
  description: "Contact search and campaign analytics for your outbound agency",
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
