import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from 'sonner';
import NotificationsProvider from '../components/NotificationsProvider';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'RKM Jewellers — Cashier Portal',
  description: 'Cashier portal for RKM Jewellers — inventory, attendance, leaves & reimbursements',
  icons: {
    icon: "/rkm-logo-cropped.png",
    shortcut: "/rkm-logo-cropped.png",
    apple: "/rkm-logo-cropped.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <NotificationsProvider />
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
