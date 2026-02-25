import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'BlackVault Mines',
  description: 'Advanced Stake-style provably fair mines game.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
