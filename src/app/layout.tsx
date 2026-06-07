import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { AnalyticsProviders } from "@/lib/analytics/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Fly & Froth — Grafik- & Webdesign Studio",
  description: "Fly & Froth Design Studio, Karben (Hessen). Logo, Flyer, Webdesign & Branding.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* Analytics: GA4 + Meta Pixel + Pinterest Tag (env-driven, no-op if unset) */}
        <Suspense fallback={null}>
          <AnalyticsProviders />
        </Suspense>
      </body>
    </html>
  );
}
