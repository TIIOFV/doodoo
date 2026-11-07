import './globals.css'; 
import { ThemeProvider } from './contexts/ThemeContext'; 

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
        <meta name="theme-color" content="#0284c7" />
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