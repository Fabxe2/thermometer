import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'thermometer',
  description: 'Weather data for Polymarket temperature markets',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
