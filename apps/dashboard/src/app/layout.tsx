import './globals.css';
import type { Metadata } from 'next';
import { Toaster } from '@/components/ui/toaster';
import RootClient from '@/components/root-client';

export const metadata: Metadata = {
  title: 'SmartCS - 客服平台',
  description: 'Smart customer service platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <RootClient>{children}</RootClient>
        <Toaster />
      </body>
    </html>
  );
}
