'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  LayoutGrid, MessageSquare, CheckSquare, Calendar, StickyNote, 
  Settings, LogOut, Bell, Palette, ChevronLeft, ChevronRight, X, Sun, Moon, CloudSun, Sparkles, ExternalLink, CheckCheck, Menu, ShieldAlert
} from 'lucide-react';
import { supabase } from './../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';

type RoleType = 'administrador' | 'gestor' | 'coordenador' | 'supervisor' | 'analista' | 'colaborador';
interface DBProfile { id: string; user_id: string; nome: string; email: string; cargo: RoleType; setor: string; avatar_url?: string; }

const LogoDooDoo = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
    <rect x="4" y="4" width="56" height="56" rx="18" fill="currentColor" fillOpacity="0.15" />
    <path d="M22 18H36C45.9411 18 54 26.0589 54 36C54 45.9411 45.9411 54 36 54H22V18Z" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="36" cy="36" r="5" fill="currentColor" />
  </svg>
);

interface AppNotification { id: number; title: string; desc: string; time: string; unread: boolean; link?: string; }
const getInitials = (name: string) => { if (!name) return '..'; const parts = name.trim().split(' ').filter(Boolean); if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase(); return name.slice(0, 2).toUpperCase(); };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, changeTheme } = useTheme();
  
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [greeting, setGreeting] = useState('');
  const [GreetingIcon, setGreetingIcon] = useState<any>(Sun);
  
  const notifRef = useRef<HTMLDivElement>(null);
  const mobileNotifRef = useRef<HTMLDivElement>(null);
  
  const [currentUser, setCurrentUser] = useState<DBProfile | null>(null);
  const [allowedTabs, setAllowedTabs] = useState<string[]>(['visao_geral', 'chat', 'tarefas', 'agenda', 'anotacoes']);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  
  const meusCanaisRef = useRef<string[]>([]);

  const glassPanel = { backgroundColor: 'color-mix(in srgb, var(--bg-card) 75%, transparent)', backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)', border: '1px solid color-mix(in srgb, var(--text-main) 6%, transparent)', boxShadow: '0 8px 30px rgba(0, 0, 0, 0.05)' };
  const solidDropdown = { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-input)', boxShadow: '0 20px 60px rgba(0, 0, 0, 0.2)' };
  const solidMobileDrawer = { backgroundColor: 'color-mix(in srgb, var(--bg-card) 98%, transparent)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', borderRight: '1px solid var(--border-input)', boxShadow: '20px 0 50px rgba(0, 0, 0, 0.15)' };
  const glassHeader = { backgroundColor: 'color-mix(in srgb, var(--bg-page) 60%, transparent)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderBottom: '1px solid color-mix(in srgb, var(--text-main) 3%, transparent)', };

  useEffect(() => {
    const savedNotifs = localStorage.getItem('doodoo_notificacoes');
    if (savedNotifs) {
      // 🚀 Limita a 30 notificações ao carregar
      const parsed = JSON.parse(savedNotifs);
      setNotifications(parsed.slice(0, 30));
    }
  }, []);

  useEffect(() => {
    if (notifications.length > 0) {
      localStorage.setItem('doodoo_notificacoes', JSON.stringify(notifications));
    }
  }, [notifications]);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) { setGreeting('Bom dia'); setGreetingIcon(Sun); } 
    else if (hour >= 12 && hour < 18) { setGreeting('Boa tarde'); setGreetingIcon(CloudSun); } 
    else { setGreeting('Boa noite'); setGreetingIcon(Moon); }
  }, []);

  useEffect(() => {
    const handleUpdateChatBadge = (e: any) => setUnreadChatCount(e.detail);
    window.addEventListener('doodoo:update_unread_chat', handleUpdateChatBadge);
    return () => window.removeEventListener('doodoo:update_unread_chat', handleUpdateChatBadge);
  }, []);

  useEffect(() => {
    const fetchProfileAndPermissions = async () => {
      try {
        setIsLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) { setAuthError(true); setIsLoading(false); return; }
        
        const { data: userProfile } = await supabase.from('doodoo_perfis').select('*').eq('user_id', session.user.id).maybeSingle();
        
        if (userProfile) {
          setCurrentUser(userProfile as DBProfile);
          
          const { data: permissoesDb } = await supabase.from('doodoo_permissoes').select('*');
          if (permissoesDb && permissoesDb.length > 0) {
            const myAllowedTabs = permissoesDb.filter(p => p.cargos_permitidos.includes(userProfile.cargo) || (p.usuarios_permitidos && p.usuarios_permitidos.includes(userProfile.user_id))).map(p => p.aba_key.replace('tarefas_todas', 'tarefas').replace('tarefas_minha', 'tarefas'));
            setAllowedTabs(Array.from(new Set(myAllowedTabs)));
          }
          
          const { data: canais } = await supabase.from('doodoo_canais').select('id, membros');
          const meusCanaisIds = canais?.filter(c => c.membros?.some((m:any) => m.user_id === userProfile.user_id)).map(c => c.id) || [];
          meusCanaisRef.current = meusCanaisIds;

          if (meusCanaisIds.length > 0) {
            const trintaDias = new Date(); trintaDias.setDate(trintaDias.getDate() - 30);
            const { data: msgs } = await supabase.from('doodoo_mensagens').select('sender_id, metadata, canal_id').gte('created_at', trintaDias.toISOString()).in('canal_id', meusCanaisIds);
            if (msgs) setUnreadChatCount(msgs.filter(m => m.sender_id !== userProfile.user_id && !(m.metadata?.lidoPor || []).includes(userProfile.nome)).length);
          }
        } else { setAuthError(true); }
      } catch (error) { setAuthError(true); } finally { setIsLoading(false); }
    };
    fetchProfileAndPermissions();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const globalListener = supabase.channel('doodoo_global_network')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'doodoo_mensagens' }, (payload) => {
        const msg = payload.new;
        if (msg.sender_id !== currentUser.user_id && meusCanaisRef.current.includes(msg.canal_id)) {
          if (!window.location.pathname.startsWith('/dashboard/conversas')) {
            setUnreadChatCount(prev => prev + 1);
            const titulo = `Mensagem de ${msg.sender_nome}`;
            const descricao = msg.tipo === 'image' ? 'Enviou uma imagem' : msg.tipo === 'file' ? 'Enviou um documento' : msg.texto;
            window.dispatchEvent(new CustomEvent('doodoo:notify', { detail: { title: titulo, desc: descricao, link: `/dashboard/conversas?chatId=${msg.canal_id}` } }));
          }
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'doodoo_tarefas' }, (payload) => {
        const task = payload.new;
        if (task.responsavel === currentUser.nome && task.atribuido_por !== currentUser.nome) {
           window.dispatchEvent(new CustomEvent('doodoo:notify', { detail: { title: `Nova Tarefa`, desc: `"${task.titulo}" delegada por ${task.atribuido_por}`, link: '/dashboard/tarefas' } }));
        }
      })
      .subscribe();
      
    return () => { supabase.removeChannel(globalListener); };
  }, [currentUser]);

  const markAllAsRead = () => { setNotifications(prev => prev.map(n => ({ ...n, unread: false }))); };

  useEffect(() => {
    const handleNewNotif = (e: any) => {
      const { title, desc, link } = e.detail;
      const timeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      // 🚀 DESCARTA AS ANTIGAS E MANTÉM APENAS AS 30 MAIS RECENTES PARA POUPAR MEMÓRIA
      setNotifications(prev => [{ id: Date.now(), title: title || 'Alerta', desc: desc || '', time: timeStr, unread: true, link: link || '' }, ...prev].slice(0, 30));
    };
    window.addEventListener('doodoo:notify', handleNewNotif);
    return () => window.removeEventListener('doodoo:notify', handleNewNotif);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => { 
      const isOutsideDesktop = notifRef.current && !notifRef.current.contains(event.target as Node);
      const isOutsideMobile = mobileNotifRef.current && !mobileNotifRef.current.contains(event.target as Node);
      if (isOutsideDesktop && isOutsideMobile) setIsNotifOpen(false); 
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const toggleNotifPanel = (e: React.MouseEvent) => { e.stopPropagation(); setIsNotifOpen(prev => !prev); };

  const handleNotificationClick = (notif: AppNotification) => {
    setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, unread: false } : n));
    if (notif.link) {
      router.push(notif.link); setIsNotifOpen(false);
      try {
        const urlObj = new URL(notif.link, window.location.origin);
        const chatId = urlObj.searchParams.get('chatId');
        if (chatId) setTimeout(() => window.dispatchEvent(new CustomEvent('doodoo:switch_chat', { detail: { chatId } })), 150);
      } catch (e) {}
    }
  };

const themes = [
    { id: 'light', name: 'Claro', color: '#ffffff', border: '#9ca3af' }, // <-- Branco puro com borda mais escura
    { id: 'dark', name: 'Escuro', color: '#0f172a', border: '#475569' },
    { id: 'ocean', name: 'Oceano', color: '#0284c7', border: '#0369a1' },
    { id: 'nature', name: 'Natureza', color: '#16a34a', border: '#15803d' },
    { id: 'sunset', name: 'Pôr do Sol', color: '#dc2626', border: '#b91c1c' },
    { id: 'amethyst', name: 'Ametista', color: '#9333ea', border: '#7e22ce' },
    { id: 'aurora', name: 'Aurora', color: '#0d9488', border: '#0f766e' },
    { id: 'solar', name: 'Solar', color: '#f59e0b', border: '#d97706' },
    { id: 'coral', name: 'Coral', color: '#e11d48', border: '#be123c' },
    { id: 'graphite', name: 'Grafite', color: '#52525b', border: '#3f3f46' },
  ];

  const rawNav = [
    { name: 'Visão Geral', icon: LayoutGrid, path: '/dashboard', badge: null, key: 'visao_geral' },
    { name: 'Chat Corporativo', icon: MessageSquare, path: '/dashboard/conversas', badge: unreadChatCount > 0 ? unreadChatCount : null, key: 'chat' },
    { name: 'Tarefas', icon: CheckSquare, path: '/dashboard/tarefas', badge: null, key: 'tarefas' },
    { name: 'Agenda', icon: Calendar, path: '/dashboard/agenda', badge: null, key: 'agenda' },
    { name: 'Anotações', icon: StickyNote, path: '/dashboard/notas', badge: null, key: 'anotacoes' },
  ];
  
  const mainNav = rawNav.filter(item => allowedTabs.includes(item.key));
  const currentPageTitle = mainNav.find((item) => item.path === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.path))?.name || 'Configurações';
  const isImmersivePage = pathname.startsWith('/dashboard/conversas') || pathname.startsWith('/dashboard/tarefas') || pathname.startsWith('/dashboard/agenda') || pathname.startsWith('/dashboard/notas') || pathname.startsWith('/dashboard/configuracoes');
  const unreadNotifCount = notifications.filter(n => n.unread).length;
  
  const handleLogout = async () => { await supabase.auth.signOut(); window.location.href = '/'; };

  if (authError || (!currentUser && !isLoading) || isLoading) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center transition-colors duration-500" style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-main)' }}>
        {isLoading ? (
          <div className="animate-pulse flex flex-col items-center"><LogoDooDoo className="w-14 h-14 mb-4" style={{ color: 'var(--tab-active)' }} /></div>
        ) : (
          <div className="max-w-md w-full p-10 text-center space-y-6 rounded-[2.5rem] border" style={glassPanel}>
            <div className="w-24 h-24 mx-auto rounded-full flex items-center justify-center border-4 border-red-500/20 bg-red-500/10"><ShieldAlert className="w-12 h-12 text-red-500" /></div>
            <div className="space-y-2"><h1 className="text-3xl font-extrabold tracking-tight">Sessão Expirada</h1><p className="text-sm font-medium opacity-70">Inicie sessão novamente.</p></div>
            <button onClick={handleLogout} className="w-full py-4 rounded-2xl bg-brand-panel text-white font-extrabold shadow-lg hover:scale-[1.02] transition-transform">Fazer Login</button>
          </div>
        )}
        <div style={{ display: 'none' }}>{children}</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden transition-colors duration-700 relative z-0" style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-main)' }}>
      
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[10%] -left-[5%] w-[45vw] h-[45vw] rounded-full bg-brand-panel opacity-10 blur-[140px]"></div>
        <div className="absolute top-[60%] -right-[10%] w-[35vw] h-[35vw] rounded-full bg-brand-panel opacity-10 blur-[140px]"></div>
      </div>

      <aside className={`${isCollapsed ? 'w-[96px]' : 'w-[280px]'} hidden md:flex flex-col transition-all duration-300 relative z-40 m-4 rounded-[2.25rem] flex-shrink-0`} style={glassPanel}>
         <button onClick={() => setIsCollapsed(!isCollapsed)} className="absolute -right-3.5 top-12 flex items-center justify-center w-7 h-7 rounded-full shadow-md transition-transform hover:scale-110 z-50 cursor-pointer text-white" style={{ backgroundColor: 'var(--tab-active)', border: '2px solid var(--bg-page)' }}>
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>

        <div className={`h-24 flex items-center ${isCollapsed ? 'justify-center px-0' : 'px-6'} mt-2 transition-all`}>
          <div className="flex items-center">
            <div className="w-12 h-12 rounded-[1.25rem] bg-brand-panel flex items-center justify-center text-white shadow-lg flex-shrink-0"><LogoDooDoo className="w-7 h-7" /></div>
            <div className={`ml-3.5 whitespace-nowrap overflow-hidden transition-all duration-300 ${isCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100 w-auto'}`}>
              <div className="flex items-center space-x-1.5"><h1 className="font-extrabold text-xl tracking-tight">Doo Doo</h1><Sparkles className="w-3.5 h-3.5 opacity-60" style={{ color: 'var(--tab-active)' }} /></div>
              <p className="text-[10px] font-semibold tracking-wider uppercase opacity-40 mt-1">Portal Corporativo</p>
            </div>
          </div>
        </div>
        <div className="mx-6 h-[1px] opacity-50 mb-4" style={{ backgroundColor: 'color-mix(in srgb, var(--border-input) 80%, transparent)' }}></div>
        
        <nav className="flex-1 px-4 py-2 space-y-2 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
          {mainNav.map((item) => {
            const isActive = item.path === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.path);
            return (
              <Link key={item.name} href={item.path} title={isCollapsed ? item.name : ''} className={`flex items-center ${isCollapsed ? 'justify-center px-0 py-3.5' : 'justify-between px-4 py-3.5'} rounded-2xl transition-all group relative overflow-hidden ${isActive ? 'bg-brand-panel text-white shadow-lg scale-[1.01]' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}>
                <div className={`flex items-center relative z-10 ${isCollapsed ? 'justify-center w-full' : 'w-full'}`}>
                  <div className={`flex items-center justify-center transition-transform ${!isActive && 'group-hover:scale-110'}`}>
                    <item.icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : 'opacity-60 group-hover:opacity-100'}`} />
                  </div>
                  <span className={`ml-3.5 text-[14px] tracking-tight whitespace-nowrap flex-1 ${isActive ? 'font-bold text-white' : 'font-semibold opacity-75 group-hover:opacity-100'} ${isCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100 w-auto'}`}>{item.name}</span>
                  {item.badge && !isCollapsed && <span className="ml-auto px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-extrabold shadow-sm">{item.badge}</span>}
                </div>
              </Link>
            );
          })}
          <div className="my-3 mx-2 h-[1px] opacity-50" style={{ backgroundColor: 'color-mix(in srgb, var(--border-input) 80%, transparent)' }}></div>
          <button onClick={async () => { const { data: { session } } = await supabase.auth.getSession(); const urlIris = process.env.NEXT_PUBLIC_IRIS_URL || 'http://localhost:5173'; window.location.href = session?.access_token ? `${urlIris}/#access_token=${session.access_token}&refresh_token=${session.refresh_token}` : urlIris; }} className={`w-full flex items-center ${isCollapsed ? 'justify-center px-0 py-3.5' : 'justify-between px-4 py-3.5'} rounded-2xl group hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer text-left transition-all`}>
            <div className={`flex items-center relative z-10 ${isCollapsed ? 'justify-center w-full' : ''}`}><ExternalLink className="w-5 h-5 opacity-55 group-hover:opacity-100 group-hover:scale-110 transition-transform flex-shrink-0" /><span className={`ml-3.5 text-[14px] font-semibold opacity-75 group-hover:opacity-100 ${isCollapsed ? 'opacity-0 w-0 hidden' : 'block w-auto'}`}>Iris Gestão</span></div>
          </button>
        </nav>
        
        <div className="p-4 mt-auto relative" ref={notifRef}>
          <div className="rounded-[1.25rem] p-4 flex flex-col space-y-4" style={{ backgroundColor: 'color-mix(in srgb, var(--text-main) 3%, transparent)' }}>
            <div className={`flex items-center overflow-hidden ${isCollapsed ? 'justify-center' : ''}`}>
              <div className="relative flex-shrink-0">{currentUser?.avatar_url ? <img src={currentUser.avatar_url} alt="Avatar" className="w-10 h-10 rounded-2xl object-cover shadow-sm" /> : <div className="w-10 h-10 rounded-2xl bg-brand-panel flex items-center justify-center text-white font-bold shadow-md text-xs">{getInitials(currentUser?.nome || '')}</div>}</div>
              {!isCollapsed && (
                <div className="ml-3 overflow-hidden flex-1 min-w-0">
                  <p className="text-sm font-extrabold leading-tight truncate" title={currentUser?.nome || ''}>{currentUser?.nome}</p>
                  <p className="text-[10px] font-semibold opacity-60 uppercase mt-0.5 truncate" title={currentUser?.cargo || ''}>{currentUser?.cargo}</p>
                </div>
              )}
            </div>
            
            <div className={`flex items-center pt-3 border-t ${isCollapsed ? 'flex-col space-y-3 border-none pt-0' : 'justify-between'}`} style={{ borderColor: 'color-mix(in srgb, var(--text-main) 10%, transparent)' }}>
              
              {/* 🚀 BOTAO DE NOTIFICAÇÃO DO DESKTOP COM CONTADOR */}
              <button onClick={toggleNotifPanel} className="relative p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors" title="Notificações">
                <Bell className="w-5 h-5 opacity-80" />
                {unreadNotifCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-extrabold flex items-center justify-center border-2 shadow-sm animate-pulse" style={{ borderColor: 'var(--bg-card)' }}>
                    {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                  </span>
                )}
              </button>

              <Link href="/dashboard/configuracoes" className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors" title="Ajustes"><Settings className="w-5 h-5 opacity-80" /></Link>
              <button onClick={handleLogout} className="p-2 rounded-xl hover:bg-red-500/10 text-red-500 cursor-pointer transition-colors" title="Sair"><LogOut className="w-5 h-5 opacity-80" /></button>
            </div>
          </div>
          
          {isNotifOpen && (
            <div className={`absolute bottom-0 mb-4 rounded-[2rem] p-2 animate-in fade-in slide-in-from-bottom-4 z-[999] ${isCollapsed ? 'left-24 w-80' : 'left-[290px] w-96'}`} style={solidDropdown}>
              <div className="px-5 py-4 border-b flex justify-between items-center" style={{ borderColor: 'var(--border-input)' }}>
                <div className="flex items-center space-x-2"><h3 className="font-bold text-sm">Central de Alertas</h3>{unreadNotifCount > 0 && <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-red-500/10 text-red-500">{unreadNotifCount} novas</span>}</div>
                <button onClick={(e) => { e.stopPropagation(); markAllAsRead(); }} className="text-[10px] font-bold px-2 py-1 rounded-lg hover:bg-black/5 flex items-center cursor-pointer"><CheckCheck className="w-3.5 h-3.5 mr-1" /> Ler tudo</button>
              </div>
              <div className="p-2 max-h-[60vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] space-y-2">
                {notifications.map((n) => (
                  <div key={n.id} onClick={() => handleNotificationClick(n)} className={`p-4 rounded-2xl border cursor-pointer transition-colors ${n.unread ? 'bg-blue-500/10 border-blue-500/30' : 'hover:brightness-95 opacity-90'}`} style={!n.unread ? { backgroundColor: 'var(--bg-input)', borderColor: 'transparent' } : {}}>
                    <p className="text-xs font-bold flex justify-between"><span>{n.title}</span>{n.unread && <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm"></span>}</p>
                    <p className="text-[11px] mt-1.5 opacity-80 leading-relaxed font-medium">{n.desc}</p>
                    <p className="text-[9px] mt-2 opacity-50 font-bold uppercase tracking-wider">{n.time}</p>
                  </div>
                ))}
                {notifications.length === 0 && <p className="text-center text-xs opacity-50 py-6 font-bold">Sem notificações recentes.</p>}
              </div>
            </div>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col h-full relative overflow-hidden z-10">
        <header className={`absolute top-0 left-0 right-0 h-20 md:h-28 flex items-center justify-between px-5 md:px-10 transition-all duration-500 z-40 ${isImmersivePage ? 'md:hidden' : ''}`} style={glassHeader}>
          <div className="flex items-center gap-4">
            <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden p-3 rounded-2xl shadow-sm cursor-pointer border" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}><Menu className="w-6 h-6" /></button>
            <div className="flex flex-col justify-center">
              <div className="hidden md:flex items-center space-x-2 opacity-60 mb-1">
                <GreetingIcon className="w-4 h-4" style={{ color: 'var(--tab-active)' }} />
                <span className="text-[11px] font-extrabold uppercase tracking-widest">{greeting}{currentUser ? `, ${currentUser.nome?.split(' ')[0]}` : ''}</span>
              </div>
              <h2 className="text-xl md:text-3xl font-extrabold tracking-tight truncate">{currentPageTitle}</h2>
            </div>
          </div>
          
          <div className="flex items-center space-x-4" ref={mobileNotifRef}>
            <div className="hidden md:flex items-center px-5 py-3 rounded-3xl shadow-sm" style={glassPanel}>
              <Palette className="w-4 h-4 mr-3 opacity-40 flex-shrink-0" />
              <div className="flex items-center space-x-3">
                {themes.map((t) => (
                  <button key={t.id} onClick={() => changeTheme(t.id)} style={{ width: '18px', height: '18px', backgroundColor: t.color, borderColor: t.border, boxShadow: theme === t.id ? `0 0 0 2px var(--bg-card), 0 0 0 4px ${t.border}` : 'none' }} className={`rounded-full border transition-transform cursor-pointer ${theme === t.id ? 'scale-125' : 'opacity-75 hover:scale-110'}`} />
                ))}
              </div>
            </div>
            
            <div className="md:hidden relative">
              {/* 🚀 BOTAO DE NOTIFICAÇÃO DO MOBILE (HEADER) COM CONTADOR */}
              <button onClick={toggleNotifPanel} className="p-3 rounded-2xl shadow-sm cursor-pointer border relative" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
                <Bell className="w-6 h-6 opacity-80" />
                {unreadNotifCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-extrabold flex items-center justify-center border-2 shadow-sm animate-bounce" style={{ borderColor: 'var(--bg-card)' }}>
                    {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                  </span>
                )}
              </button>
              
              {isNotifOpen && (
                <div className="absolute top-16 right-0 w-[85vw] max-w-[340px] rounded-[2rem] p-2 animate-in fade-in slide-in-from-top-4 z-[999] shadow-2xl" style={solidDropdown}>
                  <div className="px-5 py-4 border-b flex justify-between items-center" style={{ borderColor: 'var(--border-input)' }}>
                    <div className="flex items-center space-x-2"><h3 className="font-bold text-sm">Alertas</h3></div>
                    <button onClick={(e) => { e.stopPropagation(); markAllAsRead(); }} className="text-[10px] font-bold px-2 py-1 rounded-lg hover:bg-black/5 flex items-center cursor-pointer"><CheckCheck className="w-3.5 h-3.5 mr-1" /> Ler</button>
                  </div>
                  <div className="p-2 max-h-[50vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] space-y-2">
                    {notifications.map((n) => (
                      <div key={n.id} onClick={() => handleNotificationClick(n)} className={`p-4 rounded-2xl border cursor-pointer transition-colors ${n.unread ? 'bg-blue-500/10 border-blue-500/30' : 'hover:brightness-95 opacity-90'}`} style={!n.unread ? { backgroundColor: 'var(--bg-input)', borderColor: 'transparent' } : {}}>
                        <p className="text-xs font-bold flex justify-between"><span>{n.title}</span>{n.unread && <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm"></span>}</p>
                        <p className="text-[11px] mt-1.5 opacity-80 leading-relaxed font-medium">{n.desc}</p>
                        <p className="text-[9px] mt-2 opacity-50 font-bold uppercase tracking-wider">{n.time}</p>
                      </div>
                    ))}
                    {notifications.length === 0 && <p className="text-center text-xs opacity-50 py-6 font-bold">Sem notificações.</p>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className={`flex-1 overflow-y-auto h-full w-full flex flex-col ${isImmersivePage ? 'p-0 md:p-5 pt-24 md:pt-5' : 'px-5 md:px-10 pt-24 md:pt-32 pb-4 md:pb-12'} [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']`}>
          {children}
        </main>
      </div>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[90] flex md:hidden animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)}></div>
          <aside className="relative w-[85%] max-w-sm h-full flex flex-col shadow-2xl animate-in slide-in-from-left duration-300" style={solidMobileDrawer}>
            
            <div className="p-6 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-input)' }}>
              <div className="flex items-center space-x-4 overflow-hidden flex-1 min-w-0">
                <div className="relative flex-shrink-0">{currentUser?.avatar_url ? <img src={currentUser.avatar_url} alt="Avatar" className="w-12 h-12 rounded-2xl object-cover shadow-md" /> : <div className="w-12 h-12 rounded-2xl bg-brand-panel flex items-center justify-center text-white font-bold shadow-md text-base">{getInitials(currentUser?.nome || '')}</div>}</div>
                <div className="overflow-hidden flex-1 min-w-0">
                  <p className="text-[15px] font-extrabold leading-tight truncate">{currentUser?.nome}</p>
                  <p className="text-[10px] font-bold opacity-50 uppercase mt-1 truncate">{currentUser?.cargo}</p>
                </div>
              </div>
              <button onClick={() => setIsMobileMenuOpen(false)} className="p-2.5 rounded-xl hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer flex-shrink-0 ml-2"><X className="w-5 h-5"/></button>
            </div>
            
            <nav className="flex-1 overflow-y-auto p-5 space-y-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
              <Link href="/dashboard/configuracoes" onClick={() => setIsMobileMenuOpen(false)} className="w-full flex items-center px-4 py-4 rounded-2xl border font-bold mb-6 text-[14px] transition-transform active:scale-95" style={{ backgroundColor: 'color-mix(in srgb, var(--text-main) 3%, transparent)', borderColor: 'color-mix(in srgb, var(--border-input) 50%, transparent)' }}>
                 <Settings className="w-5 h-5 mr-3.5 opacity-60" /> Meu Perfil e Ajustes
              </Link>
              {mainNav.map((item) => (
                  <Link key={item.name} href={item.path} onClick={() => setIsMobileMenuOpen(false)} className={`flex items-center px-4 py-4 rounded-2xl relative transition-colors ${pathname.startsWith(item.path) ? 'bg-brand-panel text-white font-bold shadow-md' : 'hover:bg-black/5 dark:hover:bg-white/5 font-semibold opacity-75 text-[14px]'}`}>
                    <item.icon className="w-5 h-5 mr-3.5" />{item.name}
                  </Link>
              ))}
            </nav>
            
            <div className="p-6 border-t space-y-6 pb-12" style={{ borderColor: 'var(--border-input)' }}>
               <div>
                 <span className="text-[10px] font-bold opacity-50 block uppercase tracking-wider mb-3 text-center">Mudar Tema</span>
                 <div className="flex space-x-3 justify-center">
                  {themes.map((t) => (
                    <button key={t.id} onClick={() => changeTheme(t.id)} style={{ width: '28px', height: '28px', backgroundColor: t.color, borderColor: t.border, boxShadow: theme === t.id ? `0 0 0 2px var(--bg-card), 0 0 0 4px ${t.border}` : 'none' }} className={`rounded-full border transition-all cursor-pointer ${theme === t.id ? 'scale-110' : 'opacity-60'}`} />
                  ))}
                 </div>
               </div>
               <button onClick={handleLogout} className="w-full py-4 rounded-2xl border border-red-500/30 bg-red-500/10 text-red-500 text-[14px] font-bold flex items-center justify-center space-x-2 cursor-pointer transition-transform active:scale-95">
                 <LogOut className="w-5 h-5" /><span>Encerrar Sessão</span>
               </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}