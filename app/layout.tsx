import type { Metadata } from "next";
import { Manrope } from 'next/font/google';
import { AppThemeProvider } from '@/components/AppThemeContext';
import "./globals.css";

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-app',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: " — Admin",
    title: "RKM Admin",
    description: "Admin panel for RKM",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className={`${manrope.variable} h-full app-theme`}>
        <AppThemeProvider>{children}</AppThemeProvider>
      </body>
    </html>
  );
}
