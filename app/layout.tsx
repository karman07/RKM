import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Inter } from 'next/font/google';
import { AppThemeProvider } from '@/components/AppThemeContext';
import "./globals.css";

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
  title: "RKM Admin Control",
  description: "Secure Admin Management for RKM Jewellers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className={`${jakarta.variable} ${inter.variable} h-full app-theme`} suppressHydrationWarning>
        <AppThemeProvider>{children}</AppThemeProvider>
      </body>
    </html>
  );
}
