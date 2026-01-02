// frontend/src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { SessionProviders } from "@/components/providers/session-provider";
import { ClientShell } from "@/components/layout/ClientShell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PlayAtlas - Competitive Pool Gaming Platform",
  description: "Play 8-ball pool online, compete in tournaments, and win real prizes",
  keywords: ["pool", "8-ball", "billiards", "online gaming", "tournaments", "competitive gaming"],
  authors: [{ name: "PlayAtlas Team" }],
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "PlayAtlas - Competitive Pool Gaming",
    description: "Play 8-ball pool online, compete in tournaments, and win real prizes",
    url: "https://playatlas.com",
    siteName: "PlayAtlas",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PlayAtlas - Competitive Pool Gaming",
    description: "Play 8-ball pool online, compete in tournaments, and win real prizes",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <SessionProviders>
          <ClientShell>{children}</ClientShell>
          <Toaster />
        </SessionProviders>
      </body>
    </html>
  );
}
