'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutGrid, MessageSquare, CheckSquare, Calendar, StickyNote, 
  Settings, LogOut, Bell, Palette, ChevronLeft, ChevronRight, X, Sun, Moon, CloudSun, Sparkles, ExternalLink, CheckCheck, Menu 
} from 'lucide-react';
import { supabase } from './../lib/supabase';
// 🚀 IMPORTAÇÃO DO TEMA GLOBAL (Acabou o conflito de telas!)
import { useTheme } from '../contexts/ThemeContext'; 

type RoleType = 'administrador' | 'gestor' | 'coordenador' | 'supervisor' | 'analista' | 'colaborador';

interface DBProfile {
  id: string;
  user_id: string;
  nome: string;
  email: string;
  cargo: RoleType;
  setor: string;
  avatar_url?: string;
}

const LogoDooDoo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect x="4" y="4" width="56" height="56" rx="18" fill="currentColor" fillOpacity="0.15" />
    <path d="M22 18H36C45.9411 18 54 26.0589 54 36C54 45.9411 45.9411 54 36 54H22V18Z" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="36" cy="36" r="5" fill="currentColor" />
  </svg>
);

interface AppNotification {
  id: number;
  title: string;
  desc: string;
  time: string;
  unread: boolean;
}

const getInitials = (name: string) => {
  if (!name) return '..';
  const cleanName = name.replace(/^Chat:\s*/i, '').trim();
  const parts = cleanName.split(' ').filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return cleanName.slice(0, 2).toUpperCase();
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, changeTheme } = useTheme(); // 🚀 Hook Global
  
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // 🚀 Correção para Celular
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  
  const [greeting, setGreeting] = useState('');
  const [GreetingIcon, setGreetingIcon] = useState<any>(Sun);
  const notifRef = useRef<HTMLDivElement>(null);

  const [currentUser, setCurrentUser] = useState<DBProfile | null>(null);
  const [allowedTabs, setAllowedTabs] = useState<string[]>(['visao_geral', 'chat', 'tarefas_todas', 'tarefas_minha', 'agenda', 'anotacoes']);
  const [notifications, setNotifications] = useState<AppNotification[]>([
    { id: 1, title: 'Bem-vindo ao Doo Doo', desc: 'Seu painel corporativo está pronto.', time: 'Agora', unread: true },
  ]);

  const isMessengerPage = pathname.startsWith('/dashboard/conversas');
  const isTaskPage = pathname.startsWith('/dashboard/tarefas');
  const isAgendaPage = pathname.startsWith('/dashboard/agenda');
  const isNotesPage = pathname.startsWith('/dashboard/notas');
  const isSettingsPage = pathname.startsWith('/dashboard/configuracoes');

  const isImmersivePage = isMessengerPage || isTaskPage || isAgendaPage || isNotesPage || isSettingsPage;
  const unreadCount = notifications.filter(n => n.unread).length;

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      setGreeting('Bom dia'); setGreetingIcon(Sun);
    } else if (hour >= 12 && hour < 18) {
      setGreeting('Boa tarde'); setGreetingIcon(CloudSun);
    } else {
      setGreeting('Boa noite'); setGreetingIcon(Moon);
    }
  }, []);

  useEffect(() => {
    const fetchProfileAndPermissions = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: perfilData } = await supabase.from('doodoo_perfis').select('*').eq('user_id', session.user.id).maybeSingle();
          let userProfile = perfilData;
          if (!userProfile) {
             const { data: fallback } = await supabase.from('doodoo_perfis').select('*').ilike('nome', '%Pedro%').limit(1).maybeSingle();
             userProfile = fallback || await supabase.from('doodoo_perfis').select('*').limit(1).maybeSingle();
          }

          if (userProfile) {
            setCurrentUser(userProfile as DBProfile);
            const { data: permissoesDb } = await supabase.from('doodoo_permissoes').select('*');
            if (permissoesDb) {
              const myAllowedTabs = permissoesDb.filter(p => p.cargos_permitidos.includes(userProfile.cargo)).map(p => p.aba_key);
              setAllowedTabs(myAllowedTabs);
            }
          }
        }
      } catch (error) {
        console.error("Erro no Layout:", error);
      }
    };
    fetchProfileAndPermissions();
  }, []);

  useEffect(() => {
    const handleNewNotif = (e: any) => {
      const { title, desc } = e.detail;
      const newItem: AppNotification = { id: Date.now(), title: title || 'Atualização no Sistema', desc: desc || '', time: 'Agora mesmo', unread: true };
      setNotifications(prev => [newItem, ...prev]);
    };
    window.addEventListener('doodoo:notify', handleNewNotif);
    return () => window.removeEventListener('doodoo:notify', handleNewNotif);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) setIsNotifOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAllAsRead = () => setNotifications(prev => prev.map(n => ({ ...n, unread: false })));

  const themes = [
    { id: 'light', name: 'Claro', color: '#f5f5f7', border: '#d2d2d7' },
    { id: 'dark', name: 'Escuro', color: '#0f172a', border: '#475569' },
    { id: 'ocean', name: 'Oceano', color: '#005bb5', border: '#005bb5' },
    { id: 'nature', name: 'Natureza', color: '#2e8b57', border: '#2e8b57' },
    { id: 'sunset', name: 'Pôr do Sol', color: '#d9534f', border: '#d9534f' },
  ];

  const rawNav = [
    { name: 'Visão Geral', icon: LayoutGrid, path: '/dashboard', badge: null, key: 'visao_geral' },
    { name: 'Chat Corporativo', icon: MessageSquare, path: '/dashboard/conversas', badge: '3', key: 'chat' },
    { name: 'Tarefas', icon: CheckSquare, path: '/dashboard/tarefas', badge: null, key: 'tarefas' },
    { name: 'Agenda', icon: Calendar, path: '/dashboard/agenda', badge: null, key: 'agenda' },
    { name: 'Anotações', icon: StickyNote, path: '/dashboard/notas', badge: null, key: 'anotacoes' },
  ];

  const mainNav = rawNav.filter(item => {
    if (item.key === 'tarefas') return allowedTabs.includes('tarefas_todas') || allowedTabs.includes('tarefas_minha');
    return allowedTabs.includes(item.key);
  });

  const currentPageTitle = mainNav.find((item) => item.path === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.path))?.name || 'Configurações';

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  return (
    <div className="flex h-screen overflow-hidden transition-colors duration-500" style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-main)' }}>
      
      {/* 🚀 MENU DESKTOP */}
      <aside 
        className={`${isCollapsed ? 'w-[92px]' : 'w-[280px]'} hidden md:flex flex-col transition-all duration-500 relative z-40 m-4 rounded-[2.25rem] shadow-2xl border`} 
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}
      >
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3.5 top-12 flex items-center justify-center w-7 h-7 rounded-full border shadow-md transition-all duration-300 hover:scale-110 z-50 cursor-pointer"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}
          title={isCollapsed ? "Expandir Menu" : "Recolher Menu"}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>

        <div className={`h-24 flex items-center ${isCollapsed ? 'justify-center px-0' : 'px-6'} transition-all duration-500 mt-1`}>
          <div className="flex items-center">
            <div className="w-12 h-12 rounded-2xl bg-brand-panel flex items-center justify-center text-white shadow-lg flex-shrink-0 transition-transform duration-500 hover:scale-105">
              <LogoDooDoo className="w-7 h-7" />
            </div>
            <div className={`ml-3.5 transition-all duration-500 whitespace-nowrap overflow-hidden ${isCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100 w-auto'}`}>
              <div className="flex items-center space-x-1.5">
                <h1 className="font-extrabold text-xl tracking-tight leading-none">Doo Doo</h1>
                <Sparkles className="w-3.5 h-3.5 opacity-60" style={{ color: 'var(--tab-active)' }} />
              </div>
              <p className="text-[10px] font-semibold tracking-wider uppercase opacity-40 mt-1">Portal Corporativo</p>
            </div>
          </div>
        </div>

        <div className="mx-6 h-[1px] opacity-60 mb-4" style={{ backgroundColor: 'var(--border-input)' }}></div>
        
        <nav className="flex-1 px-3.5 py-2 space-y-2 overflow-y-auto overflow-x-hidden custom-scrollbar">
          {mainNav.map((item) => {
            const isActive = item.path === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.path);
            return (
              <Link key={item.name} href={item.path} title={isCollapsed ? item.name : ''}
                className={`flex items-center ${isCollapsed ? 'justify-center px-0' : 'justify-between px-4'} py-3.5 rounded-2xl transition-all duration-300 group relative overflow-hidden ${
                  isActive ? 'bg-brand-panel text-white shadow-lg scale-[1.01]' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.04]'
                }`}
              >
                {isActive && <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent pointer-events-none"></div>}
                <div className="flex items-center relative z-10">
                  <div className={`flex items-center justify-center transition-transform duration-300 ${!isActive && 'group-hover:scale-110'}`}>
                    <item.icon className={`w-5 h-5 flex-shrink-0 transition-all ${isActive ? 'text-white' : 'opacity-55 group-hover:opacity-100'}`} style={{ color: !isActive ? 'var(--text-main)' : undefined }} />
                  </div>
                  <span className={`ml-3.5 text-[14px] tracking-tight whitespace-nowrap transition-all duration-500 ${isActive ? 'font-bold text-white' : 'font-semibold opacity-75 group-hover:opacity-100'} ${isCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100 w-auto'}`}>
                    {item.name}
                  </span>
                </div>
              </Link>
            );
          })}

          <div className="my-3 mx-2 h-[1px] opacity-60" style={{ backgroundColor: 'var(--border-input)' }}></div>

          <button onClick={async () => {
              const { data: { session } } = await supabase.auth.getSession();
              const urlIris = process.env.NEXT_PUBLIC_IRIS_URL || 'http://localhost:5173';
              if (session?.access_token) window.location.href = `${urlIris}/#access_token=${session.access_token}&refresh_token=${session.refresh_token}`;
              else window.location.href = urlIris;
            }}
            title={isCollapsed ? 'Iris Gestão (HelpDesk)' : ''}
            className={`w-full flex items-center ${isCollapsed ? 'justify-center px-0' : 'justify-between px-4'} py-3.5 rounded-2xl transition-all duration-300 group hover:bg-black/[0.04] dark:hover:bg-white/[0.04] cursor-pointer border-0 bg-transparent text-left`}
          >
            <div className="flex items-center relative z-10">
              <ExternalLink className="w-5 h-5 flex-shrink-0 opacity-55 group-hover:opacity-100 group-hover:scale-110 transition-all" style={{ color: 'var(--text-main)' }} />
              <span className={`ml-3.5 text-[14px] font-semibold tracking-tight whitespace-nowrap opacity-75 group-hover:opacity-100 transition-all duration-500 ${isCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100 w-auto'}`}>
                Iris Gestão
              </span>
            </div>
          </button>
        </nav>

        <div className="p-3.5 mt-auto">
          <div className={`rounded-[1.5rem] p-2.5 border transition-all duration-500 flex items-center ${isCollapsed ? 'flex-col space-y-2.5 justify-center' : 'justify-between'}`} style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
            <div className="flex items-center overflow-hidden">
              <div className="relative flex-shrink-0">
                {currentUser?.avatar_url ? (
                  <img src={currentUser.avatar_url} alt="Avatar" className="w-10 h-10 rounded-2xl object-cover shadow-md border border-white/10" />
                ) : (
                  <div className="w-10 h-10 rounded-2xl bg-brand-panel flex items-center justify-center text-white font-bold shadow-md text-xs uppercase">
                    {getInitials(currentUser?.nome || '')}
                  </div>
                )}
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2" style={{ borderColor: 'var(--bg-card)' }}></span>
              </div>
              <div className={`ml-3 transition-all duration-500 whitespace-nowrap overflow-hidden ${isCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100 w-auto'}`}>
                <p className="text-xs font-bold leading-tight truncate">{currentUser?.nome || 'Carregando...'}</p>
                <p className="text-[10px] font-semibold opacity-50 mt-0.5 truncate uppercase">{currentUser?.cargo || 'Colaborador'}</p>
              </div>
            </div>
            <div className={`flex items-center ${isCollapsed ? 'flex-col space-y-1' : 'space-x-1 pl-1'}`}>
              <Link href="/dashboard/configuracoes" className="p-2 rounded-xl hover:bg-black/5 cursor-pointer opacity-60 hover:opacity-100" title="Ajustes"><Settings className="w-4 h-4" /></Link>
              <button onClick={handleLogout} className="p-2 rounded-xl hover:bg-red-500/10 text-red-500 opacity-70 hover:opacity-100 cursor-pointer" title="Sair do Sistema"><LogOut className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      </aside>

      {/* 🚀 MENU MOBILE (DRAWER) - Corrige o erro de responsividade */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[99] flex md:hidden animate-in fade-in">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)}></div>
          <aside className="relative w-4/5 max-w-sm h-full flex flex-col shadow-2xl animate-in slide-in-from-left duration-300" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
            <div className="p-6 flex items-center justify-between border-b" style={{ borderColor: 'var(--border-input)' }}>
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-xl bg-brand-panel flex items-center justify-center text-white"><LogoDooDoo className="w-6 h-6" /></div>
                <h1 className="font-extrabold text-lg ml-3">Doo Doo</h1>
              </div>
              <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 rounded-lg bg-black/5"><X className="w-5 h-5"/></button>
            </div>
            
            <nav className="flex-1 overflow-y-auto p-4 space-y-2">
              {mainNav.map((item) => {
                const isActive = item.path === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.path);
                return (
                  <Link key={item.name} href={item.path} onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center px-4 py-3.5 rounded-2xl transition-all ${isActive ? 'bg-brand-panel text-white' : 'hover:bg-black/5'}`}>
                    <item.icon className={`w-5 h-5 ${isActive ? 'text-white' : 'opacity-60'}`} />
                    <span className={`ml-3.5 text-sm ${isActive ? 'font-bold' : 'font-semibold opacity-80'}`}>{item.name}</span>
                  </Link>
                );
              })}
            </nav>
            
            <div className="p-4 border-t" style={{ borderColor: 'var(--border-input)' }}>
               <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500/10 text-red-500 font-bold text-sm">
                 <LogOut className="w-4 h-4"/> Sair do Sistema
               </button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col h-full relative overflow-hidden">
        {!isImmersivePage && (
          <header className="h-24 flex items-center justify-between px-6 md:px-8 pt-2 transition-all duration-500 z-20 flex-shrink-0 border-b md:border-none" style={{ borderColor: 'var(--border-input)' }}>
            
            <div className="flex items-center gap-4">
              <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden p-2.5 rounded-xl border shadow-sm" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
                <Menu className="w-5 h-5" />
              </button>
              <div>
                <div className="flex items-center space-x-2 opacity-60 mb-0.5">
                  <GreetingIcon className="w-3.5 h-3.5" style={{ color: 'var(--tab-active)' }} />
                  <span className="text-xs font-bold uppercase tracking-wider">{greeting}{currentUser ? `, ${currentUser.nome?.split(' ')[0] || 'Usuário'}` : ''}</span>
                </div>
                <h2 className="text-xl md:text-2xl font-extrabold tracking-tight">{currentPageTitle}</h2>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <div className="hidden sm:flex items-center px-4 py-2.5 rounded-2xl shadow-sm border backdrop-blur-xl" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
                <Palette className="w-4 h-4 mr-3 opacity-40 flex-shrink-0" />
                <div className="flex items-center space-x-2.5">
                  {themes.map((t) => {
                    const isSelected = theme === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => changeTheme(t.id)} // 🚀 Usa a função global do Contexto
                        style={{ width: '16px', height: '16px', backgroundColor: t.color, borderColor: t.border, boxShadow: isSelected ? `0 0 0 2px var(--bg-card), 0 0 0 4px ${t.border}` : 'none' }}
                        className={`rounded-full border transition-all duration-300 flex-shrink-0 cursor-pointer ${isSelected ? 'scale-110' : 'opacity-75 hover:opacity-100'}`}
                        title={`Tema ${t.name}`}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="relative" ref={notifRef}>
                <button onClick={() => setIsNotifOpen(!isNotifOpen)} className="relative p-3 rounded-2xl shadow-sm border hover:scale-105 transition-transform cursor-pointer" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
                  <Bell className="w-5 h-5 opacity-80" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-extrabold flex items-center justify-center border-2 shadow-sm animate-bounce" style={{ borderColor: 'var(--bg-card)' }}>
                      {unreadCount}
                    </span>
                  )}
                </button>

                {isNotifOpen && (
                  <div className="absolute right-0 mt-3 w-80 md:w-88 rounded-[1.75rem] shadow-2xl border p-2 animate-in fade-in slide-in-from-top-4 z-50" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
                    <div className="px-4 py-3 border-b flex justify-between items-center" style={{ borderColor: 'var(--border-input)' }}>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-bold text-sm">Central de Alertas</h3>
                        {unreadCount > 0 && <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-red-500/10 text-red-500">{unreadCount} novas</span>}
                      </div>
                      <button onClick={markAllAsRead} className="text-[10px] font-bold px-2 py-1 rounded-lg hover:bg-black/5 flex items-center cursor-pointer">
                        <CheckCheck className="w-3.5 h-3.5 mr-1" /> Ler
                      </button>
                    </div>

                    <div className="p-1.5 max-h-72 overflow-y-auto custom-scrollbar space-y-1">
                      {notifications.map((n) => (
                        <div key={n.id} className={`p-3.5 hover:bg-black/5 rounded-2xl cursor-pointer ${n.unread ? 'border-l-4 border-l-blue-500' : 'opacity-60'}`}>
                          <p className="text-xs font-bold flex justify-between"><span>{n.title}</span>{n.unread && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--tab-active)' }}></span>}</p>
                          <p className="text-xs mt-1 opacity-75">{n.desc}</p>
                          <p className="text-[10px] mt-1.5 opacity-40 font-bold uppercase">{n.time}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>
        )}

        <main className={`flex-1 overflow-y-auto ${isImmersivePage ? 'p-4' : 'px-4 md:px-8 pb-10 pt-2'} custom-scrollbar`}>
          {children}
        </main>
      </div>
    </div>
  );
}