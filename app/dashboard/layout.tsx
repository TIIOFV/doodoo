'use client';
import { panelStyle } from '../components/ui';
import { environment } from '../lib/environment';

import type { Session } from '@supabase/supabase-js';
import {
Bell,
Calendar,
CheckCheck,
CheckSquare,
ChevronLeft,ChevronRight,
ExternalLink,
LayoutGrid,
LogOut,
MessageSquare,
Settings,
ShieldAlert,
Sparkles,
StickyNote,
Sun
} from 'lucide-react';
import Link from 'next/link';
import { usePathname,useRouter } from 'next/navigation';
import { useEffect,useRef,useState } from 'react';
import { createPortal } from 'react-dom';
import { EmptyState,LoadingState,ThemeSelect } from '../components/ui';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from './../lib/supabase';

type RoleType = 'administrador' | 'gestor' | 'coordenador' | 'supervisor' | 'analista' | 'colaborador';
interface DBProfile { id: string; user_id: string; nome: string; email: string; cargo: RoleType; setor: string; avatar_url?: string; status?: string; }

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

  const [feedback, setFeedback] = useState<{ title: string; desc: string } | null>(null);
  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const greeting = 'Seu workspace';
  const GreetingIcon = Sun;

  const notifRef = useRef<HTMLDivElement>(null);
  const mobileNotifRef = useRef<HTMLDivElement>(null);

  const [currentUser, setCurrentUser] = useState<DBProfile | null>(null);
  const [allowedTabs, setAllowedTabs] = useState<string[]>([]);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const sessionId = session?.user.id;
  const [accessVersion,setAccessVersion]=useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(false);

  const [mobileChatActive, setHideBottomNavOnMobile] = useState(false);
  const hideBottomNavOnMobile = mobileChatActive && pathname.startsWith('/dashboard/conversas');

  const meusCanaisRef = useRef<string[]>([]);

  const glassPanel = panelStyle;
  const solidDropdown = panelStyle;
  const glassHeader = { backgroundColor: 'color-mix(in srgb, var(--bg-page) 60%, transparent)', borderBottom: '1px solid color-mix(in srgb, var(--text-main) 3%, transparent)' };
  const glassBottomNav = { backgroundColor: 'var(--bg-card)', borderTop: '1px solid var(--border-input)' };

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data, error }) => { if (mounted) setSession(error ? null : data.session); }).catch(()=>{if(mounted)setSession(null);});
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => { if (mounted) setSession(next); });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (currentUser && currentUser.user_id === sessionId) { try { localStorage.setItem('doodoo_notificacoes:' + currentUser.user_id, JSON.stringify(notifications)); } catch { /* Notifications remain available in memory when storage is disabled. */ } }
  }, [notifications, currentUser, sessionId]);

  useEffect(() => {
    const handleUpdateChatBadge = (e: Event) => setUnreadChatCount((e as CustomEvent<number>).detail);
    window.addEventListener('doodoo:update_unread_chat', handleUpdateChatBadge);

    const handleChatState = (e: Event) => setHideBottomNavOnMobile((e as CustomEvent<{isInsideChat:boolean}>).detail.isInsideChat);
    window.addEventListener('doodoo:mobile_chat_state', handleChatState);

    return () => {
      window.removeEventListener('doodoo:update_unread_chat', handleUpdateChatBadge);
      window.removeEventListener('doodoo:mobile_chat_state', handleChatState);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!sessionId) return;
      try {
        const { data: profile, error: profileError } = await supabase.from('doodoo_perfis').select('*').eq('user_id', sessionId).maybeSingle();
        if (profileError || !profile || profile.status === 'bloqueado') throw new Error('Acesso indisponível');
        const { data: permissions, error } = await supabase.from('doodoo_permissoes').select('*');
        if (error) throw error;
        const tabs = (permissions || []).filter(p => p.cargos_permitidos?.includes(profile.cargo) || p.usuarios_permitidos?.includes(profile.user_id)).map(p => p.aba_key.replace('tarefas_todas', 'tarefas').replace('tarefas_minha', 'tarefas'));
        const { data: channels } = await supabase.from('doodoo_canais').select('id,membros');
        if (!active) return;
        meusCanaisRef.current = (channels || []).filter(c => c.membros?.some((m: {user_id: string}) => m.user_id === profile.user_id)).map(c => c.id);
        setAllowedTabs(Array.from(new Set(tabs)));
        setCurrentUser(profile as DBProfile);
        setAuthError(false);
        setUnreadChatCount(0);
        setFeedback(null);
        try { const saved = JSON.parse(localStorage.getItem('doodoo_notificacoes:' + profile.user_id) || '[]'); setNotifications(Array.isArray(saved) ? saved.filter(n => n && typeof n.title === 'string' && typeof n.desc === 'string').slice(0,30) : []); } catch { setNotifications([]); }
      } catch { if (active) setAuthError(true); }
      finally { if (active) setIsLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [sessionId,accessVersion]);

  useEffect(() => {
    if (!currentUser || currentUser.user_id!==sessionId) return;
    const globalListener = supabase.channel('doodoo_global_network')
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'doodoo_perfis',filter:'user_id=eq.'+currentUser.user_id},payload=>{
        if(['cargo','setor','status','nome'].some(field=>field in payload.new && payload.new[field] !== currentUser[field as keyof DBProfile])){setCurrentUser(null);setAccessVersion(v=>v+1);}
        else if('avatar_url' in payload.new)setCurrentUser(prev=>prev?{...prev,avatar_url:payload.new.avatar_url}:prev);
      })
      .on('postgres_changes',{event:'*',schema:'public',table:'doodoo_permissoes'},()=>{setAccessVersion(v=>v+1);});
    if(allowedTabs.includes('chat'))globalListener
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
      ;
    if(allowedTabs.includes('tarefas'))globalListener.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'doodoo_tarefas' }, (payload) => {
        const task = payload.new;
        if (task.responsavel === currentUser.nome && task.atribuido_por !== currentUser.nome) {
           window.dispatchEvent(new CustomEvent('doodoo:notify', { detail: { title: `Nova Tarefa`, desc: `"${task.titulo}" delegada por ${task.atribuido_por}`, link: '/dashboard/tarefas' } }));
        }
      })
      ;
    globalListener.subscribe();

    return () => { supabase.removeChannel(globalListener); };
  }, [currentUser,sessionId,allowedTabs]);

  const markAllAsRead = () => { setNotifications(prev => prev.map(n => ({ ...n, unread: false }))); };

  useEffect(() => {
    const handleNewNotif = (e: Event) => {
      const { title, desc, link } = (e as CustomEvent<{title?:string;desc?:string;link?:string}>).detail;
      setFeedback({ title: title || 'Alerta', desc: desc || '' });
      const timeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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
    if(notif.link){
      try{
        const url=new URL(notif.link,window.location.origin);
        if(url.origin!==window.location.origin||!url.pathname.startsWith('/dashboard'))throw new Error('Destino inválido');
        router.push(url.pathname+url.search);setIsNotifOpen(false);
        const chatId=url.searchParams.get('chatId');if(chatId&&pathname.startsWith('/dashboard/conversas'))window.dispatchEvent(new CustomEvent('doodoo:switch_chat',{detail:{chatId}}));
      }catch{setFeedback({title:'Destino indisponível',desc:'A notificação não aponta para uma página válida do portal.'});}
    }
  };

  const rawNav = [
    { name: 'Visão Geral', icon: LayoutGrid, path: '/dashboard', badge: null, key: 'visao_geral' },
    { name: 'Chat', icon: MessageSquare, path: '/dashboard/conversas', badge: unreadChatCount > 0 ? unreadChatCount : null, key: 'chat' },
    { name: 'Tarefas', icon: CheckSquare, path: '/dashboard/tarefas', badge: null, key: 'tarefas' },
    { name: 'Agenda', icon: Calendar, path: '/dashboard/agenda', badge: null, key: 'agenda' },
    { name: 'Anotações', icon: StickyNote, path: '/dashboard/notas', badge: null, key: 'anotacoes' },
  ];

  const mainNav = rawNav.filter(item => allowedTabs.includes(item.key));
  const currentPageTitle = mainNav.find((item) => item.path === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.path))?.name || 'Configurações';

  const isImmersivePage = pathname.startsWith('/dashboard/conversas') || pathname.startsWith('/dashboard/tarefas') || pathname.startsWith('/dashboard/agenda') || pathname.startsWith('/dashboard/notas') || pathname.startsWith('/dashboard/configuracoes');
  const unreadNotifCount = notifications.filter(n => n.unread).length;

  const handleLogout = async () => { await supabase.auth.signOut(); router.replace('/'); };

  if (session === undefined || (sessionId && (isLoading || currentUser?.user_id !== sessionId) && !authError)) return <LoadingState label="Verificando acesso..." />;

  if (!sessionId || authError || !currentUser) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center transition-colors duration-500" style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-main)' }}>
        {isLoading && sessionId ? (
          <div className="animate-pulse flex flex-col items-center"><LogoDooDoo className="w-14 h-14 mb-4" style={{ color: 'var(--tab-active)' }} /></div>
        ) : (
          <div className="max-w-md w-full p-10 text-center space-y-6 rounded-xl border mx-4" style={glassPanel}>
            <div className="w-24 h-24 mx-auto rounded-full flex items-center justify-center border-4 border-red-500/20 bg-red-500/10"><ShieldAlert className="w-12 h-12 text-[var(--error-text)]" /></div>
            <div className="space-y-2"><h1 className="text-3xl font-semibold tracking-tight">Sessão Expirada</h1><p className="text-sm font-medium opacity-70">Inicie sessão novamente.</p></div>
            <button onClick={handleLogout} className="w-full py-4 rounded-2xl bg-brand-panel text-white font-semibold shadow-sm hover:scale-[1.02] transition-transform">Fazer Login</button>
          </div>
        )}

      </div>
    );
  }

  const routeKey = pathname.startsWith('/dashboard/configuracoes') ? null : rawNav.find(item => item.path === '/dashboard' ? pathname === item.path : pathname.startsWith(item.path))?.key;
  const permitted = !routeKey || allowedTabs.includes(routeKey);
  return (
    <div className="app-shell flex h-[100dvh] overflow-hidden transition-colors duration-700 relative z-0" style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-main)' }}>

      {feedback && createPortal(<div data-modal-live role="status" aria-live="polite" className="pointer-events-none fixed top-[max(.75rem,env(safe-area-inset-top))] left-1/2 z-[1100] w-[min(90vw,380px)] -translate-x-1/2 rounded-2xl border p-4 shadow-sm" style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', borderColor: 'var(--border-input)' }}><strong className="text-sm">{feedback.title}</strong><p className="mt-1 text-sm">{feedback.desc}</p></div>, document.body)}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[10%] -left-[5%] w-[45vw] h-[45vw] rounded-full bg-brand-panel opacity-10 hidden"></div>
        <div className="absolute top-[60%] -right-[10%] w-[35vw] h-[35vw] rounded-full bg-brand-panel opacity-10 hidden"></div>
      </div>

      <aside className={`${isCollapsed ? 'w-[80px]' : 'w-[256px]'} hidden lg:flex flex-col transition-all duration-300 relative z-40 m-0 border-y-0 border-l-0 rounded-none flex-shrink-0`} style={glassPanel}>
         <button aria-label={isCollapsed ? 'Expandir menu' : 'Recolher menu'} aria-expanded={!isCollapsed} onClick={() => setIsCollapsed(!isCollapsed)} className="absolute -right-3.5 top-12 flex items-center justify-center w-7 h-7 rounded-full shadow-sm transition-transform hover:scale-110 z-50 cursor-pointer text-white" style={{ backgroundColor: 'var(--tab-active)', border: '2px solid var(--bg-page)' }}>
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>

        <div className={`h-[72px] shrink-0 flex items-center ${isCollapsed ? 'justify-center px-0' : 'px-6'} mt-2 transition-all`}>
          <div className="flex items-center">
            <div className="w-12 h-12 rounded-[1.25rem] bg-brand-panel flex items-center justify-center text-white shadow-sm flex-shrink-0"><LogoDooDoo className="w-7 h-7" /></div>
            <div className={`ml-3.5 whitespace-nowrap overflow-hidden transition-all duration-300 ${isCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100 w-auto'}`}>
              <div className="flex items-center space-x-1.5"><h1 className="font-semibold text-xl tracking-tight">Doo Doo</h1><Sparkles className="w-3.5 h-3.5 opacity-60" style={{ color: 'var(--tab-active)' }} /></div>
              <p className="text-xs font-semibold tracking-wider uppercase opacity-40 mt-1">Portal Corporativo</p>
            </div>
          </div>
        </div>
        <div className="mx-6 h-[1px] opacity-50 mb-4" style={{ backgroundColor: 'var(--border-input)' }}></div>

        <nav className="flex-1 px-4 py-2 space-y-2 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
          {mainNav.map((item) => {
            const isActive = item.path === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.path);
            return (
              <Link key={item.name} href={item.path} aria-current={isActive ? 'page' : undefined} title={isCollapsed ? item.name : ''} className={`flex items-center ${isCollapsed ? 'justify-center px-0 py-3.5' : 'justify-between px-4 py-3.5'} rounded-2xl transition-all group relative overflow-hidden ${isActive ? 'bg-brand-panel text-white shadow-sm scale-[1.01]' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}>
                <div className={`flex items-center relative z-10 ${isCollapsed ? 'justify-center w-full' : 'w-full'}`}>
                  <div className={`flex items-center justify-center transition-transform ${!isActive && 'group-hover:scale-110'}`}>
                    <item.icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : 'opacity-60 group-hover:opacity-100'}`} />
                  </div>
                  <span className={`ml-3.5 text-[14px] tracking-tight whitespace-nowrap flex-1 ${isActive ? 'font-medium text-white' : 'font-semibold opacity-75 group-hover:opacity-100'} ${isCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100 w-auto'}`}>{item.name}</span>
                  {item.badge && !isCollapsed && <span className="ml-auto px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-semibold shadow-sm">{item.badge}</span>}
                </div>
              </Link>
            );
          })}
          <div className="my-3 mx-2 h-[1px] opacity-50" style={{ backgroundColor: 'var(--border-input)' }}></div>
          <button disabled={environment!=='shared'} title={environment!=='shared'?'Integração Iris desativada neste ambiente':undefined} onClick={async () => { if(environment!=='shared')return; const { data: { session } } = await supabase.auth.getSession(); const urlIris = process.env.NEXT_PUBLIC_IRIS_URL || 'http://localhost:5173'; window.location.href = session?.access_token ? `${urlIris}/#access_token=${session.access_token}&refresh_token=${session.refresh_token}` : urlIris; }} className={`w-full flex items-center ${isCollapsed ? 'justify-center px-0 py-3.5' : 'justify-between px-4 py-3.5'} rounded-2xl group hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer text-left transition-all`}>
            <div className={`flex items-center relative z-10 ${isCollapsed ? 'justify-center w-full' : ''}`}><ExternalLink className="w-5 h-5 opacity-55 group-hover:opacity-100 group-hover:scale-110 transition-transform flex-shrink-0" /><span className={`ml-3.5 text-[14px] font-semibold opacity-75 group-hover:opacity-100 ${isCollapsed ? 'opacity-0 w-0 hidden' : 'block w-auto'}`}>Iris Gestão</span></div>
          </button>
        </nav>

        <div className="p-4 mt-auto relative" ref={notifRef}>
          <div className="rounded-[1.25rem] p-4 flex flex-col space-y-4" style={{ backgroundColor: 'color-mix(in srgb, var(--text-main) 3%, transparent)' }}>
            <div className={`flex items-center overflow-hidden ${isCollapsed ? 'justify-center' : ''}`}>
              <div className="relative flex-shrink-0">{currentUser?.avatar_url ? <img src={currentUser.avatar_url} alt="Avatar" className="w-10 h-10 rounded-2xl object-cover shadow-sm" /> : <div className="w-10 h-10 rounded-2xl bg-brand-panel flex items-center justify-center text-white font-medium shadow-sm text-xs">{getInitials(currentUser?.nome || '')}</div>}</div>
              {!isCollapsed && (
                <div className="ml-3 overflow-hidden flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-tight truncate" title={currentUser?.nome || ''}>{currentUser?.nome}</p>
                  <p className="text-xs font-semibold opacity-60 uppercase mt-0.5 truncate" title={currentUser?.cargo || ''}>{currentUser?.cargo}</p>
                </div>
              )}
            </div>

            <div className={`flex items-center pt-3 border-t ${isCollapsed ? 'flex-col space-y-3 border-none pt-0' : 'justify-between'}`} style={{ borderColor: 'color-mix(in srgb, var(--text-main) 10%, transparent)' }}>

              <button aria-label="Notificações" aria-expanded={isNotifOpen} onClick={toggleNotifPanel} className="relative p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors" title="Notificações">
                <Bell className="w-5 h-5 opacity-80" />
                {unreadNotifCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-xs font-semibold flex items-center justify-center border-2 shadow-sm animate-pulse" style={{ borderColor: 'var(--bg-card)' }}>
                    {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                  </span>
                )}
              </button>

              <Link href="/dashboard/configuracoes" className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors" title="Ajustes"><Settings className="w-5 h-5 opacity-80" /></Link>
              <button aria-label="Sair" onClick={handleLogout} className="p-2 rounded-xl hover:bg-red-500/10 text-[var(--error-text)] cursor-pointer transition-colors" title="Sair"><LogOut className="w-5 h-5 opacity-80" /></button>
            </div>
          </div>

          {isNotifOpen && (
            <div className={`absolute bottom-0 mb-4 rounded-xl p-2 animate-in fade-in slide-in-from-bottom-4 z-[999] ${isCollapsed ? 'left-24 w-80' : 'left-[290px] w-96'}`} style={solidDropdown}>
              <div className="px-5 py-4 border-b flex justify-between items-center" style={{ borderColor: 'var(--border-input)' }}>
                <div className="flex items-center space-x-2"><h3 className="font-medium text-sm">Central de Alertas</h3>{unreadNotifCount > 0 && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-[var(--error-text)]">{unreadNotifCount} novas</span>}</div>
                <button onClick={(e) => { e.stopPropagation(); markAllAsRead(); }} className="text-xs font-medium px-2 py-1 rounded-lg hover:bg-black/5 flex items-center cursor-pointer"><CheckCheck className="w-3.5 h-3.5 mr-1" /> Ler tudo</button>
              </div>
              <div className="p-2 max-h-[60vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] space-y-2">
                {notifications.map((n) => (
                  <div role="button" tabIndex={0} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.currentTarget.click(); } }} key={n.id} onClick={() => handleNotificationClick(n)} className={`p-4 rounded-2xl border cursor-pointer transition-colors ${n.unread ? 'bg-blue-500/10 border-blue-500/30' : 'hover:brightness-95 opacity-90'}`} style={!n.unread ? { backgroundColor: 'var(--bg-input)', borderColor: 'transparent' } : {}}>
                    <p className="text-xs font-medium flex justify-between"><span>{n.title}</span>{n.unread && <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm"></span>}</p>
                    <p className="text-xs mt-1.5 opacity-80 leading-relaxed font-medium">{n.desc}</p>
                    <p className="text-xs mt-2 opacity-50 font-medium uppercase tracking-wider">{n.time}</p>
                  </div>
                ))}
                {notifications.length === 0 && <p className="text-center text-xs opacity-50 py-6 font-medium">Sem notificações recentes.</p>}
              </div>
            </div>
          )}
        </div>
      </aside>

      <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">

        {/* Em páginas imersivas, o cabeçalho aparece apenas no desktop.
            Z-index reduzido para não cobrir modais abertos na área de conteúdo. */}
        <header className={`relative z-20 shrink-0 h-16 md:h-[72px] items-center justify-between px-5 md:px-10 transition-all duration-500 ${hideBottomNavOnMobile ? 'hidden' : isImmersivePage ? 'hidden lg:flex' : 'flex'}`} style={glassHeader}>
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex min-w-0 flex-col justify-center">
              <div className="hidden md:flex items-center space-x-2 opacity-60 mb-1">
                <GreetingIcon className="w-4 h-4" style={{ color: 'var(--tab-active)' }} />
                <span className="text-xs font-semibold uppercase tracking-widest">{greeting}{currentUser ? `, ${currentUser.nome?.split(' ')[0]}` : ''}</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-semibold tracking-tight truncate">{currentPageTitle}</h2>
            </div>
          </div>

          <div className="flex items-center space-x-4" ref={mobileNotifRef}>
            <div className="hidden sm:block"><ThemeSelect value={theme} onChange={changeTheme}/></div>

            <div className="lg:hidden relative">
              <button onClick={toggleNotifPanel} className="p-3 rounded-2xl shadow-sm cursor-pointer border relative" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
                <Bell className="w-6 h-6 opacity-80" />
                {unreadNotifCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-semibold flex items-center justify-center border-2 shadow-sm animate-bounce" style={{ borderColor: 'var(--bg-card)' }}>
                    {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                  </span>
                )}
              </button>

              {isNotifOpen && (
                <div className="absolute top-16 right-0 w-[85vw] max-w-[340px] rounded-xl p-2 animate-in fade-in slide-in-from-top-4 z-[999] shadow-sm" style={solidDropdown}>
                  <div className="px-5 py-4 border-b flex justify-between items-center" style={{ borderColor: 'var(--border-input)' }}>
                    <div className="flex items-center space-x-2"><h3 className="font-medium text-sm">Alertas</h3></div>
                    <button onClick={(e) => { e.stopPropagation(); markAllAsRead(); }} className="text-xs font-medium px-2 py-1 rounded-lg hover:bg-black/5 flex items-center cursor-pointer"><CheckCheck className="w-3.5 h-3.5 mr-1" /> Ler</button>
                  </div>
                  <div className="p-2 max-h-[50vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] space-y-2">
                    {notifications.map((n) => (
                      <div role="button" tabIndex={0} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.currentTarget.click(); } }} key={n.id} onClick={() => handleNotificationClick(n)} className={`p-4 rounded-2xl border cursor-pointer transition-colors ${n.unread ? 'bg-blue-500/10 border-blue-500/30' : 'hover:brightness-95 opacity-90'}`} style={!n.unread ? { backgroundColor: 'var(--bg-input)', borderColor: 'transparent' } : {}}>
                        <p className="text-xs font-medium flex justify-between"><span>{n.title}</span>{n.unread && <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm"></span>}</p>
                        <p className="text-xs mt-1.5 opacity-80 leading-relaxed font-medium">{n.desc}</p>
                        <p className="text-xs mt-2 opacity-50 font-medium uppercase tracking-wider">{n.time}</p>
                      </div>
                    ))}
                    {notifications.length === 0 && <p className="text-center text-xs opacity-50 py-6 font-medium">Sem notificações.</p>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* A área rolável precisa de min-h-0 em um contêiner flex.
            O modal deve ser renderizado no body por um portal (ver ModalShell.tsx). */}
        <main className={`flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-y-auto overscroll-contain ${isImmersivePage ? (hideBottomNavOnMobile ? 'p-0' : 'p-0 md:p-5') : 'px-4 md:px-8 pt-5'} ${hideBottomNavOnMobile ? 'pb-0 lg:pb-5' : 'pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-5'} [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']`}>
          {permitted ? <div key={currentUser.user_id} className="contents">{children}</div> : <EmptyState title="Acesso não permitido">Seu perfil não tem acesso a esta aba. Solicite a liberação ao administrador.</EmptyState>}
        </main>

        {/* BOTTOM NAVIGATION (MOBILE PWA STYLE) - ESCONDE QUANDO NO CHAT INDIVIDUAL */}
        <nav className={`lg:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around pb-safe pt-2 px-2 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] transition-transform duration-300 ${hideBottomNavOnMobile ? 'translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'}`} style={glassBottomNav}>
          {mainNav.map((item) => {
            const isActive = item.path === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.path);
            return (
              <Link key={item.name} href={item.path} aria-current={isActive ? 'page' : undefined} className="relative flex flex-col items-center justify-center px-1 py-2 min-w-0 flex-1 h-14 cursor-pointer transition-transform active:scale-90">
                <item.icon className={`w-[22px] h-[22px] mb-1 transition-all ${isActive ? 'scale-110' : 'opacity-50'}`} style={{ color: isActive ? 'var(--tab-active)' : 'var(--text-main)' }} />
                <span className={`text-xs sm:text-xs font-medium tracking-normal transition-all ${isActive ? 'opacity-100' : 'opacity-50'}`} style={{ color: isActive ? 'var(--tab-active)' : 'var(--text-main)' }}>{item.name.split(' ')[0]}</span>
                {item.badge && <span className="absolute top-1 right-2.5 min-w-[14px] h-3.5 px-1 rounded-full bg-red-500 text-white text-[8px] font-semibold flex items-center justify-center border-2 shadow-sm" style={{ borderColor: 'var(--bg-card)' }}>{item.badge}</span>}
              </Link>
            );
          })}

          <Link href="/dashboard/configuracoes" className="relative flex flex-col items-center justify-center p-2 w-16 h-14 cursor-pointer transition-transform active:scale-90">
             {currentUser?.avatar_url ? (
               <img src={currentUser.avatar_url} alt="Perfil" className={`w-[22px] h-[22px] rounded-full object-cover mb-1 border-2 transition-all ${pathname.startsWith('/dashboard/configuracoes') ? 'scale-110' : 'opacity-60 border-transparent'}`} style={{ borderColor: pathname.startsWith('/dashboard/configuracoes') ? 'var(--tab-active)' : 'var(--text-main)' }} />
             ) : (
               <Settings className={`w-[22px] h-[22px] mb-1 transition-all ${pathname.startsWith('/dashboard/configuracoes') ? 'scale-110' : 'opacity-50'}`} style={{ color: pathname.startsWith('/dashboard/configuracoes') ? 'var(--tab-active)' : 'var(--text-main)' }} />
             )}
             <span className={`text-xs font-medium tracking-wide transition-all ${pathname.startsWith('/dashboard/configuracoes') ? 'opacity-100' : 'opacity-50'}`} style={{ color: pathname.startsWith('/dashboard/configuracoes') ? 'var(--tab-active)' : 'var(--text-main)' }}>Perfil</span>
          </Link>
        </nav>
      </div>
    </div>
  );
}
