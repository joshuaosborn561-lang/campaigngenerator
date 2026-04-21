import type { Metadata } from "next";
import "./globals.css";
import GuideChatWidget from "@/components/GuideChatWidget";
import { BRAND_PAGE_TITLE } from "@/lib/branding";

export const metadata: Metadata = {
  title: BRAND_PAGE_TITLE,
  description: "Contact search and campaign analytics for your outbound agency",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="body-root">
        {children}
        <GuideChatWidget />
      </body>
    </html>
  );
}
