import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Flip Desk — Liquidation Sourcing',
  description: 'Internal deal-analysis and inventory system for liquidation resale.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
