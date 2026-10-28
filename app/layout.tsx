// Importe o seu CSS global (mantenha como estiver no seu projeto)
import './globals.css'; 
// 🚀 Importe o nosso ThemeProvider
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
      <body>
        {/* 🚀 O ThemeProvider DEVE envolver o children aqui na raiz! */}
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}