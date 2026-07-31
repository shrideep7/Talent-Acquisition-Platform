import type { Metadata } from 'next';

import './globals.css';
import { Providers } from '@/lib/providers';

export const metadata: Metadata = {
  title: 'MFD Talent Acquisition Tool',
  description: 'JD-CV matching, CV generation and candidate pipeline for MFD recruiters.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
