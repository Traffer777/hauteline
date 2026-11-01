import type { Metadata } from 'next';
import './globals.css';
import './admin.css';
import Experience from '@/components/experience';

export const metadata: Metadata = {
  title: 'Hauteline — оригинальная одежда, обувь и аксессуары',
  description: 'Байерский сервис Hauteline. Товары под заказ и в наличии в РФ.',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <head>
        {/* шрифты грузятся сразу, без «невидимого» текста при первом открытии */}
        <link rel="preload" href="/fonts/unbounded.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/manrope.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className="antialiased">
        <a className="skip-link" href="#main">
          Перейти к содержимому
        </a>
        <Experience />
        {children}
      </body>
    </html>
  );
}
