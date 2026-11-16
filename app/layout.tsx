import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Inter } from 'next/font/google';
import { AppThemeProvider } from '@/components/AppThemeContext';
import "./globals.css";
import { BRAND_ICON, BRAND_NAME, BRAND_SHORT } from '@/lib/brand';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  weight: ['400', '500', '600', '700', '800'],
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: `${BRAND_SHORT} Admin Control`,
  description: `Secure Admin Management for ${BRAND_NAME}`,
  icons: {
    icon: BRAND_ICON,
    shortcut: BRAND_ICON,
    apple: BRAND_ICON,
  },
};

import { Toaster } from "sonner";
import NotificationsProvider from '@/components/NotificationsProvider';
import DialogGuard from '../components/DialogGuard';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className={`${jakarta.variable} ${inter.variable} h-full app-theme`} suppressHydrationWarning>
        <AppThemeProvider>
          <NotificationsProvider />
        <DialogGuard />
          {children}
          <Toaster position="top-center" richColors />
        </AppThemeProvider>
      </body>
    </html>
  );
}
