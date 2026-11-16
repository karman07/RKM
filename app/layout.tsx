import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from 'sonner';
import NotificationsProvider from '../components/NotificationsProvider';
import DialogGuard from '../components/DialogGuard';
import { BRAND_ICON, BRAND_NAME } from '@/lib/brand';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: `${BRAND_NAME} — Cashier Portal`,
  description: `Cashier portal for ${BRAND_NAME} — inventory, attendance, leaves & reimbursements`,
  icons: {
    icon: BRAND_ICON,
    shortcut: BRAND_ICON,
    apple: BRAND_ICON,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <NotificationsProvider />
        <DialogGuard />
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
