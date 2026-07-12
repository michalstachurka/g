import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Panel administracyjny - konfigurator drzwi',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body className="bg-[var(--c-bg)] text-[var(--c-text)]">{children}</body>
    </html>
  );
}
