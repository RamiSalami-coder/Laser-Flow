import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Orbitron } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const orbitron = Orbitron({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "700", "900"],
});

export const metadata: Metadata = {
  title: "Laser Flow — Stay Moving. Stay Alive.",
  description:
    "Laser Flow is a premium neon survival arena. Dodge endless lasers, master special events, and beat your best time. Built for desktop and mobile.",
  keywords: [
    "Laser Flow",
    "browser game",
    "neon game",
    "survival game",
    "arcade",
    "instant game",
  ],
  authors: [{ name: "Laser Flow" }],
  openGraph: {
    title: "Laser Flow — Stay Moving. Stay Alive.",
    description:
      "A premium neon survival arena. Dodge endless lasers and beat your best time.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#050510",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${orbitron.variable} antialiased bg-background text-foreground overflow-hidden`}
      >
        {children}
      </body>
    </html>
  );
}
