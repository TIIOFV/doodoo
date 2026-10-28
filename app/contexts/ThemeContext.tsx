'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type ThemeContextType = {
  theme: string;
  changeTheme: (newTheme: string) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState('light');

  // Inicializa o tema ao abrir o site
  useEffect(() => {
    const savedTheme = localStorage.getItem('doodoo_theme') || 'light';
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  // Função global para trocar o tema
  const changeTheme = (newTheme: string) => {
    setTheme(newTheme);
    localStorage.setItem('doodoo_theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  // Sincroniza o tema se o utilizador abrir o sistema em duas abas diferentes
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'doodoo_theme' && e.newValue) {
        setTheme(e.newValue);
        document.documentElement.setAttribute('data-theme', e.newValue);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, changeTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme deve ser usado dentro do ThemeProvider');
  return context;
};