import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ALFA Reports — Automated MT5 Trading Bot",
  description:
    "ALFA Reports — بوت تداول آلي للمتاجرة في الذهب باستراتيجية تسليم الأذيل (Wick-to-Wick Rejection) على فريم M1 مع تنفيذ لحظي صاروخي.",
  keywords: [
    "ALFA Reports",
    "MT5 Bot",
    "Automated Trading",
    "Gold Scalping",
    "Wick Rejection",
    "XAUUSD",
  ],
  authors: [{ name: "ALFA Reports" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "ALFA Reports — Automated MT5 Trading Bot",
    description:
      "بوت تداول آلي للمتاجرة في الذهب باستراتيجية تسليم الأذيل على فريم M1.",
    siteName: "ALFA Reports",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
