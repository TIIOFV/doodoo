import type { Metadata, Viewport } from 'next';
import { ThemeProvider } from './contexts/ThemeContext';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1120' },
  ],
};

export const metadata: Metadata = {
  title: 'Doo Doo - Portal Corporativo',
  description: 'Portal Corporativo integrado de conversas, tarefas, agenda e anotações.',
  applicationName: 'Doo Doo',
  appleWebApp: {
    capable: true,
    title: 'Doo Doo',
    statusBarStyle: 'default',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      {/* Meta tags exigidas para comportamento PWA nativo no iPhone/Android */}
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      </head>
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
