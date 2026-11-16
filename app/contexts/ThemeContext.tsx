'use client';
import { createContext,useContext,useEffect,useSyncExternalStore } from 'react';


const themes = ['light', 'dark', 'ocean', 'nature', 'sunset', 'amethyst', 'aurora', 'solar', 'coral', 'graphite'];
const normalize = (value: string | null) => themes.includes(value || '') ? value! : 'light';
let memoryTheme = 'light';
let memoryOverride = false;
const readTheme = () => {
  if(memoryOverride)return memoryTheme;
  try { return normalize(localStorage.getItem('doodoo_theme')); } catch { return memoryTheme; }
};
const subscribe = (callback: () => void) => {
  window.addEventListener('storage', callback);
  window.addEventListener('doodoo:theme', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('doodoo:theme', callback);
  };
};
const ThemeContext = createContext<{ theme: string; changeTheme: (theme: string) => void } | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, readTheme, () => 'light');
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);
  const changeTheme = (value: string) => {
    const next = normalize(value);
    memoryTheme=next;
    try { localStorage.setItem('doodoo_theme', next);memoryOverride=false; } catch { memoryOverride=true; }
    document.documentElement.setAttribute('data-theme', next);
    window.dispatchEvent(new Event('doodoo:theme'));
  };
  return <ThemeContext.Provider value={{ theme, changeTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme deve ser usado dentro do ThemeProvider');
  return context;
};
