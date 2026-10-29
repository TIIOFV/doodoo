'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  LayoutGrid, MessageSquare, CheckSquare, Calendar, StickyNote, 
  Settings, LogOut, Bell, Palette, ChevronLeft, ChevronRight, X, Sun, Moon, CloudSun, Sparkles, ExternalLink, CheckCheck, Menu, AlertTriangle, ShieldAlert
} from 'lucide-react';
import { supabase } from './../lib/supabase';
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
  link?: string; 
}

const getInitials = (name: string) => {
  if (!name) return '..';
  const cleanName = name.replace(/^Chat:\s*/i, '').trim();
  const parts = cleanName.split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return cleanName.slice(0, 2).toUpperCase();
};

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

  const [currentUser, setCurrentUser] = useState<DBProfile | null>(null);
  const [allowedTabs, setAllowedTabs] = useState<string[]>(['visao_geral', 'chat', 'tarefas', 'agenda', 'anotacoes']);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    const savedNotifs = localStorage.getItem('doodoo_notificacoes');
    if (savedNotifs) setNotifications(JSON.parse(savedNotifs));
    else setNotifications([{ id: Date.now(), title: 'Bem-vindo', desc: 'O seu painel está pronto.', time: 'Agora', unread: true, link: '/dashboard' }]);
  }, []);

  useEffect(() => {
    if (notifications.length > 0) localStorage.setItem('doodoo_notificacoes', JSON.stringify(notifications));
  }, [notifications]);

  const isMessengerPage = pathname.startsWith('/dashboard/conversas');
  const isTaskPage = pathname.startsWith('/dashboard/tarefas');
  const isAgendaPage = pathname.startsWith('/dashboard/agenda');
  const isNotesPage = pathname.startsWith('/dashboard/notas');
  const isSettingsPage = pathname.startsWith('/dashboard/configuracoes');
  const isImmersivePage = isMessengerPage || isTaskPage || isAgendaPage || isNotesPage || isSettingsPage;
  
  const unreadNotifCount = notifications.filter(n => n.unread).length;

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
        
        if (!session?.user) {
           setAuthError(true);
           setIsLoading(false);
           return;
        }

        const { data: perfilData, error: perfilError } = await supabase.from('doodoo_perfis').select('*').eq('user_id', session.user.id).maybeSingle();
        let userProfile = perfilData;
        
        if (!userProfile) {
           const { data: fallback } = await supabase.from('doodoo_perfis').select('*').ilike('nome', '%Pedro%').limit(1).maybeSingle();
           userProfile = fallback || await supabase.from('doodoo_perfis').select('*').limit(1).maybeSingle();
        }

        if (userProfile) {
          setCurrentUser(userProfile as DBProfile);
          
          const { data: permissoesDb } = await supabase.from('doodoo_permissoes').select('*');
          if (permissoesDb && permissoesDb.length > 0) {
            const myAllowedTabs = permissoesDb
              .filter(p => p.cargos_permitidos.includes(userProfile.cargo) || (p.usuarios_permitidos && p.usuarios_permitidos.includes(userProfile.user_id)))
              .map(p => p.aba_key.replace('tarefas_todas', 'tarefas').replace('tarefas_minha', 'tarefas'));
            setAllowedTabs(Array.from(new Set(myAllowedTabs)));
          }

          const { data: canais } = await supabase.from('doodoo_canais').select('id, membros');
          const meusCanaisIds = canais?.filter(c => c.membros?.some((m:any) => m.user_id === userProfile.user_id)).map(c => c.id) || [];
          
          if (meusCanaisIds.length > 0) {
            const trintaDias = new Date();
            trintaDias.setDate(trintaDias.getDate() - 30);
            const { data: msgs } = await supabase.from('doodoo_mensagens')
              .select('sender_id, metadata, canal_id')
              .gte('created_at', trintaDias.toISOString())
              .in('canal_id', meusCanaisIds);
            
            if (msgs) {
              const unread = msgs.filter(m => m.sender_id !== userProfile.user_id && !(m.metadata?.lidoPor || []).includes(userProfile.nome)).length;
              setUnreadChatCount(unread);
            }
          }
        } else {
          setAuthError(true);
        }
      } catch (error) { 
        console.error("Erro no Layout:", error);
        setAuthError(true);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProfileAndPermissions();
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    const globalListener = supabase.channel('doodoo_bussiness_network')
      .on('broadcast', { event: 'nova_mensagem' }, (payload) => {
        const msg = payload.payload;
        if (msg.sender_id !== currentUser.user_id) {
          if (!window.location.pathname.startsWith('/dashboard/conversas')) setUnreadChatCount(prev => prev + 1);
          let title = `💬 Mensagem de ${msg.sender_nome}`;
          let desc = msg.tipo === 'image' ? 'Enviou uma imagem' : msg.tipo === 'file' ? 'Enviou um arquivo' : msg.texto;
          let link = `/dashboard/conversas?chatId=${msg.canal_id}`;
          if (msg.tipo === 'event') { title = `📅 Convite de Reunião`; desc = msg.metadata?.eventDetails?.title || 'Novo convite'; }
          window.dispatchEvent(new CustomEvent('doodoo:notify', { detail: { title, desc, link } }));
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'doodoo_tarefas' }, (payload) => {
        const task = payload.new;
        if (task.responsavel === currentUser.nome && task.atribuido_por !== currentUser.nome) {
          window.dispatchEvent(new CustomEvent('doodoo:notify', { detail: { title: `📋 Nova Tarefa`, desc: `"${task.titulo}" delegada por ${task.atribuido_por}`, link: '/dashboard/tarefas' } }));
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'doodoo_tarefas' }, (payload) => {
        const newTask = payload.new;
        const metadata = newTask.metadata || {};
        if (metadata.autor_evento && metadata.autor_evento !== currentUser.nome && (newTask.responsavel === currentUser.nome || newTask.atribuido_por === currentUser.nome)) {
          if (metadata.ultimo_evento === 'cobranca') {
            window.dispatchEvent(new CustomEvent('doodoo:notify', { detail: { title: `🔔 Cobrança de Gestão`, desc: `${metadata.autor_evento} cobrou andamento em "${newTask.titulo}"`, link: `/dashboard/tarefas` } }));
          } else if (metadata.ultimo_evento === 'bloqueio') {
            window.dispatchEvent(new CustomEvent('doodoo:notify', { detail: { title: `⚠️ Dificuldade Sinalizada`, desc: `${metadata.autor_evento} reportou um problema em "${newTask.titulo}"`, link: `/dashboard/tarefas` } }));
          } else if (metadata.ultimo_evento === 'comentario_chat') {
            window.dispatchEvent(new CustomEvent('doodoo:notify', { detail: { title: `💬 Andamento na Tarefa`, desc: `${metadata.autor_evento} registrou algo em "${newTask.titulo}"`, link: `/dashboard/tarefas` } }));
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(globalListener); };
  }, [currentUser]);

  useEffect(() => {
    const handleNewNotif = (e: any) => {
      const { title, desc, link } = e.detail;
      const timeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const newItem: AppNotification = { id: Date.now(), title: title || 'Alerta', desc: desc || '', time: timeStr, unread: true, link: link || '' };
      setNotifications(prev => [newItem, ...prev].slice(0, 50));
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

  const handleNotificationClick = (notif: AppNotification) => {
    setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, unread: false } : n));
    if (notif.link) {
      router.push(notif.link);
      setIsNotifOpen(false);
      try {
        const urlObj = new URL(notif.link, window.location.origin);
        const chatId = urlObj.searchParams.get('chatId');
        if (chatId) setTimeout(() => { window.dispatchEvent(new CustomEvent('doodoo:switch_chat', { detail: { chatId } })); }, 150);
      } catch (e) {}
    }
  };

  const themes = [
    { id: 'light', name: 'Claro', color: '#f5f5f7', border: '#d2d2d7' },
    { id: 'dark', name: 'Escuro', color: '#0f172a', border: '#475569' },
    { id: 'ocean', name: 'Oceano', color: '#005bb5', border: '#005bb5' },
    { id: 'nature', name: 'Natureza', color: '#2e8b57', border: '#2e8b57' },
    { id: 'sunset', name: 'Pôr do Sol', color: '#d9534f', border: '#d9534f' },
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

  const handleLogout = async () => { await supabase.auth.signOut(); window.location.href = '/'; };

  // 🚀 TELA GIGANTE DE ERRO OU CARREGAMENTO (Com o truque para o Next.js)
  if (authError || (!currentUser && !isLoading) || isLoading) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center transition-colors" style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-main)' }}>
        
        {isLoading ? (
          <>
            <div className="animate-spin text-blue-500 mb-4"><LogoDooDoo className="w-12 h-12" /></div>
            <p className="text-xs font-extrabold uppercase tracking-widest opacity-60">A iniciar Workspace...</p>
          </>
        ) : (
          <div className="max-w-md w-full p-10 text-center space-y-6 animate-in zoom-in-95 duration-300">
            <div className="w-24 h-24 mx-auto rounded-full bg-red-500/10 flex items-center justify-center border-4 border-red-500/20">
              <ShieldAlert className="w-12 h-12 text-red-500" />
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-extrabold tracking-tight">Sessão Expirada</h1>
              <p className="text-sm font-medium opacity-70">Por motivos de segurança, a sua sessão foi encerrada. Por favor, inicie sessão novamente para continuar.</p>
            </div>
            <button onClick={handleLogout} className="w-full py-4 rounded-2xl bg-brand-panel text-white font-extrabold shadow-lg transition-colors flex items-center justify-center text-[15px] cursor-pointer hover:opacity-90">
              <LogOut className="w-5 h-5 mr-2" /> Fazer Login
            </button>
          </div>
        )}

        {/* O SEGREDO MÁGICO: Renderizar o children oculto para o Next.js não dar o erro de "Dropped segment" */}
        <div style={{ display: 'none' }}>{children}</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden transition-colors duration-500" style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-main)' }}>
      
      {/* MENU DESKTOP */}
      <aside className={`${isCollapsed ? 'w-[92px]' : 'w-[280px]'} hidden md:flex flex-col transition-all duration-500 relative z-40 m-4 rounded-[2.25rem] shadow-2xl border`} style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
        <button onClick={() => setIsCollapsed(!isCollapsed)} className="absolute -right-3.5 top-12 flex items-center justify-center w-7 h-7 rounded-full border shadow-md transition-all hover:scale-110 z-50 cursor-pointer" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>

        <div className={`h-24 flex items-center ${isCollapsed ? 'justify-center px-0' : 'px-6'} mt-1 transition-all`}>
          <div className="flex items-center">
            <div className="w-12 h-12 rounded-2xl bg-brand-panel flex items-center justify-center text-white shadow-lg flex-shrink-0"><LogoDooDoo className="w-7 h-7" /></div>
            <div className={`ml-3.5 whitespace-nowrap overflow-hidden transition-all duration-500 ${isCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100 w-auto'}`}>
              <div className="flex items-center space-x-1.5"><h1 className="font-extrabold text-xl tracking-tight">Doo Doo</h1><Sparkles className="w-3.5 h-3.5 opacity-60" style={{ color: 'var(--tab-active)' }} /></div>
              <p className="text-[10px] font-semibold tracking-wider uppercase opacity-40 mt-1">Portal Corporativo</p>
            </div>
          </div>
        </div>

        <div className="mx-6 h-[1px] opacity-60 mb-4" style={{ backgroundColor: 'var(--border-input)' }}></div>
        
        <nav className="flex-1 px-3.5 py-2 space-y-2 overflow-y-auto custom-scrollbar">
          {mainNav.map((item) => {
            const isActive = item.path === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.path);
            return (
              <Link key={item.name} href={item.path} title={isCollapsed ? item.name : ''} className={`flex items-center ${isCollapsed ? 'justify-center px-0 py-3' : 'justify-between px-4 py-3.5'} rounded-2xl transition-all group relative overflow-hidden ${isActive ? 'bg-brand-panel text-white shadow-lg scale-[1.01]' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.04]'}`}>
                {isActive && <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent pointer-events-none"></div>}
                <div className={`flex items-center relative z-10 ${isCollapsed ? 'justify-center w-full' : 'w-full'}`}>
                  <div className={`flex items-center justify-center transition-transform ${!isActive && 'group-hover:scale-110'}`}>
                    <item.icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : 'opacity-55 group-hover:opacity-100'}`} style={{ color: !isActive ? 'var(--text-main)' : undefined }} />
                  </div>
                  <span className={`ml-3.5 text-[14px] tracking-tight whitespace-nowrap flex-1 ${isActive ? 'font-bold text-white' : 'font-semibold opacity-75 group-hover:opacity-100'} ${isCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100 w-auto'}`}>{item.name}</span>
                  {item.badge && !isCollapsed && <span className="ml-auto px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-extrabold shadow-sm">{item.badge}</span>}
                  {item.badge && isCollapsed && <span className="absolute top-0 right-1/4 w-2.5 h-2.5 rounded-full bg-red-500 border-2 shadow-sm animate-bounce" style={{ borderColor: 'var(--bg-card)' }}></span>}
                </div>
              </Link>
            );
          })}
          <div className="my-3 mx-2 h-[1px] opacity-60" style={{ backgroundColor: 'var(--border-input)' }}></div>
          <button onClick={async () => { const { data: { session } } = await supabase.auth.getSession(); const urlIris = process.env.NEXT_PUBLIC_IRIS_URL || 'http://localhost:5173'; window.location.href = session?.access_token ? `${urlIris}/#access_token=${session.access_token}&refresh_token=${session.refresh_token}` : urlIris; }} title={isCollapsed ? 'Iris Gestão' : ''} className={`w-full flex items-center ${isCollapsed ? 'justify-center px-0 py-3' : 'justify-between px-4 py-3.5'} rounded-2xl group hover:bg-black/[0.04] dark:hover:bg-white/[0.04] cursor-pointer text-left`}>
            <div className={`flex items-center relative z-10 ${isCollapsed ? 'justify-center w-full' : ''}`}>
              <ExternalLink className="w-5 h-5 opacity-55 group-hover:opacity-100 group-hover:scale-110 transition-all flex-shrink-0" style={{ color: 'var(--text-main)' }} />
              <span className={`ml-3.5 text-[14px] font-semibold opacity-75 group-hover:opacity-100 transition-all duration-500 ${isCollapsed ? 'opacity-0 w-0 hidden' : 'block w-auto'}`}>Iris Gestão</span>
            </div>
          </button>
        </nav>

        <div className="p-3.5 mt-auto relative" ref={notifRef}>
          <div className={`rounded-[1.5rem] transition-all duration-500 flex ${isCollapsed ? 'flex-col items-center space-y-4 py-2 px-0 border-transparent bg-transparent' : 'p-2.5 border items-center justify-between'}`} style={!isCollapsed ? { backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' } : {}}>
            <div className="flex items-center overflow-hidden">
              <div className="relative flex-shrink-0">
                {currentUser?.avatar_url ? <img src={currentUser.avatar_url} alt="Avatar" className="w-10 h-10 rounded-2xl object-cover shadow-md" /> : <div className="w-10 h-10 rounded-2xl bg-brand-panel flex items-center justify-center text-white font-bold shadow-md text-xs">{getInitials(currentUser?.nome || '')}</div>}
              </div>
              <div className={`ml-3 whitespace-nowrap overflow-hidden transition-all duration-500 ${isCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100 w-auto'}`}>
                <p className="text-xs font-bold leading-tight truncate">{currentUser?.nome || 'Carregando...'}</p>
                <p className="text-[10px] font-semibold opacity-50 uppercase mt-0.5">{currentUser?.cargo || 'Colaborador'}</p>
              </div>
            </div>

            <div className={`flex items-center ${isCollapsed ? 'flex-col space-y-3' : 'space-x-1 pl-1'}`}>
              <button onClick={() => setIsNotifOpen(!isNotifOpen)} className="relative p-2 rounded-xl hover:bg-black/5 opacity-80 hover:opacity-100 cursor-pointer" title="Notificações">
                <Bell className="w-5 h-5" />
                {unreadNotifCount > 0 && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 text-white text-[9px] font-extrabold flex items-center justify-center border-2 animate-bounce" style={{ borderColor: 'var(--bg-card)' }}>{unreadNotifCount}</span>}
              </button>
              <Link href="/dashboard/configuracoes" className="p-2 rounded-xl hover:bg-black/5 opacity-60 hover:opacity-100" title="Ajustes"><Settings className="w-5 h-5" /></Link>
              <button onClick={handleLogout} className="p-2 rounded-xl hover:bg-red-500/10 text-red-500 opacity-70 hover:opacity-100 cursor-pointer" title="Sair"><LogOut className="w-5 h-5" /></button>
            </div>
          </div>

          {isNotifOpen && (
            <div className={`absolute bottom-full mb-3 rounded-[1.75rem] shadow-2xl border p-2 animate-in fade-in slide-in-from-bottom-4 z-[999] ${isCollapsed ? 'left-4 w-72' : 'left-0 w-88'}`} style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
              <div className="px-4 py-3 border-b flex justify-between items-center" style={{ borderColor: 'var(--border-input)' }}>
                <div className="flex items-center space-x-2"><h3 className="font-bold text-sm">Central de Alertas</h3>{unreadNotifCount > 0 && <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-red-500/10 text-red-500">{unreadNotifCount} novas</span>}</div>
                <button onClick={markAllAsRead} className="text-[10px] font-bold px-2 py-1 rounded-lg hover:bg-black/5 flex items-center cursor-pointer"><CheckCheck className="w-3.5 h-3.5 mr-1" /> Ler</button>
              </div>
              <div className="p-1.5 max-h-72 overflow-y-auto custom-scrollbar space-y-1">
                {notifications.map((n) => (
                  <div key={n.id} onClick={() => handleNotificationClick(n)} className={`p-3.5 hover:bg-black/5 rounded-2xl cursor-pointer transition-colors ${n.unread ? 'border-l-4 border-l-blue-500' : 'opacity-60'}`}>
                    <p className="text-xs font-bold flex justify-between"><span>{n.title}</span>{n.unread && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--tab-active)' }}></span>}</p>
                    <p className="text-[11px] mt-1 opacity-75">{n.desc}</p>
                    <p className="text-[9px] mt-1.5 opacity-40 font-bold uppercase">{n.time}</p>
                  </div>
                ))}
                {notifications.length === 0 && <p className="text-center text-xs opacity-50 py-4">Sem notificações.</p>}
              </div>
            </div>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col h-full relative overflow-hidden">
        {!isImmersivePage && (
          <header className="h-24 flex items-center justify-between px-6 md:px-8 pt-2 transition-all duration-500 z-20 flex-shrink-0 border-b md:border-none" style={{ borderColor: 'var(--border-input)' }}>
            <div className="flex items-center gap-4">
              <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden p-2.5 rounded-xl border shadow-sm" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}><Menu className="w-5 h-5" /></button>
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
                  {themes.map((t) => (
                    <button key={t.id} onClick={() => changeTheme(t.id)} style={{ width: '16px', height: '16px', backgroundColor: t.color, borderColor: t.border, boxShadow: theme === t.id ? `0 0 0 2px var(--bg-card), 0 0 0 4px ${t.border}` : 'none' }} className={`rounded-full border transition-all flex-shrink-0 cursor-pointer ${theme === t.id ? 'scale-110' : 'opacity-75'}`} />
                  ))}
                </div>
              </div>
              <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden relative p-3 rounded-2xl border shadow-sm bg-white dark:bg-slate-800">
                <Bell className="w-5 h-5 opacity-80" />
                {unreadNotifCount > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-extrabold flex items-center justify-center border-2 shadow-sm animate-bounce" style={{ borderColor: 'var(--bg-card)' }}>{unreadNotifCount}</span>}
              </button>
            </div>
          </header>
        )}

        <main className={`flex-1 overflow-y-auto ${isImmersivePage ? 'p-4' : 'px-4 md:px-8 pb-10 pt-2'} custom-scrollbar`}>
          {children}
        </main>
      </div>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[99] flex md:hidden animate-in fade-in">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)}></div>
          <aside className="relative w-4/5 max-w-sm h-full flex flex-col shadow-2xl animate-in slide-in-from-left" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
            <div className="p-6 flex items-center justify-between border-b" style={{ borderColor: 'var(--border-input)' }}>
              <div className="flex items-center"><div className="w-10 h-10 rounded-xl bg-brand-panel flex items-center justify-center text-white"><LogoDooDoo className="w-6 h-6" /></div><h1 className="font-extrabold text-lg ml-3">Doo Doo</h1></div>
              <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 rounded-lg bg-black/5"><X className="w-5 h-5"/></button>
            </div>
            <nav className="flex-1 overflow-y-auto p-4 space-y-2">
              <button onClick={() => { setIsNotifOpen(true); setIsMobileMenuOpen(false); }} className="w-full flex items-center px-4 py-3.5 rounded-2xl border bg-brand-panel/5 text-brand-panel border-brand-panel/20 font-bold mb-4 text-sm relative">
                 <Bell className="w-5 h-5 mr-3" /> Central de Alertas
                 {unreadNotifCount > 0 && <span className="ml-auto bg-red-500 text-white px-2 py-0.5 rounded-full text-[10px]">{unreadNotifCount}</span>}
              </button>
              {mainNav.map((item) => (
                  <Link key={item.name} href={item.path} onClick={() => setIsMobileMenuOpen(false)} className={`flex items-center px-4 py-3.5 rounded-2xl relative ${pathname.startsWith(item.path) ? 'bg-brand-panel text-white font-bold' : 'hover:bg-black/5 font-semibold opacity-80 text-sm'}`}>
                    <item.icon className="w-5 h-5 mr-3.5" />{item.name}
                  </Link>
              ))}
            </nav>
          </aside>
        </div>
      )}
    </div>
  );
}