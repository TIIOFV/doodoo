import type { Viewport } from 'next';
import { ThemeProvider } from './contexts/ThemeContext';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover', interactiveWidget: 'resizes-content', themeColor: '#0284c7',
};

export const metadata = {
  title: 'Doo Doo - Portal Corporativo',
  description: 'Portal Corporativo',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      {/* Meta tags exigidas para comportamento PWA e ecrã inteiro no iPhone/Android */}
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}