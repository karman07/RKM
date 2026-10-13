import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "RKM Manager Portal",
  description: "Manager portal for RKM Jewellers",
  icons: {
    icon: "/rkm-logo-cropped.png",
    shortcut: "/rkm-logo-cropped.png",
    apple: "/rkm-logo-cropped.png",
  },
};

import { Toaster } from "sonner";
import NotificationsProvider from '../components/NotificationsProvider';
import DialogGuard from '../components/DialogGuard';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <NotificationsProvider />
        <DialogGuard />
        {children}
        <Toaster position="top-center" richColors />
        <script src="https://checkout.razorpay.com/v1/checkout.js" async></script>
      </body>
    </html>
  );
}
