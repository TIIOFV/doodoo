'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  MessageSquare, CheckSquare, Calendar, StickyNote, 
  Sparkles, ArrowUpRight, CheckCircle2, Clock, Loader2, PlayCircle, X, Flame, AlertTriangle, FileText
} from 'lucide-react';
import { supabase } from './../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';

interface DBProfile {
  id: string; user_id: string; nome: string; cargo: string; setor: string; avatar_url?: string;
}

interface TaskItem {
  id: string; titulo: string; status: 'pendente' | 'andamento' | 'concluida' | 'bloqueado'; prioridade: string; responsavel: string; atribuido_por: string; data_limite: string; hora_limite: string; created_at: string;
}
interface NoteItem {
  id: string; titulo: string; conteudo: string; created_at: string; cor: string;
}

const isTaskOverdue = (dueDate: string, dueTime: string, status: string): boolean => {
  if (status === 'concluida' || !dueDate) return false;
  const parts = dueDate.split('/');
  if (parts.length !== 3) return false;
  const [day, month, year] = parts.map(Number);
  const [hour, minute] = (dueTime || '23:59').split(':').map(Number);
  return new Date().getTime() > new Date(year, month - 1, day, hour || 23, minute || 59).getTime();
};

export default function DashboardOverviewPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const [isMounted, setIsMounted] = useState(false);
  
  const [currentUser, setCurrentUser] = useState<DBProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [allowedTabs, setAllowedTabs] = useState<string[]>([]);
  const [pendingTasks, setPendingTasks] = useState<TaskItem[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<TaskItem[]>([]);
  const [recentActivities, setRecentActivities] = useState<TaskItem[]>([]);
  const [recentNotes, setRecentNotes] = useState<NoteItem[]>([]);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  // 🚀 ESTILOS LIQUID GLASS PRO (Design Unificado e Premium)
  const glassCardStyle = { 
    backgroundColor: 'color-mix(in srgb, var(--bg-card) 60%, transparent)', 
    backdropFilter: 'blur(20px)', 
    WebkitBackdropFilter: 'blur(20px)', 
    border: '1px solid color-mix(in srgb, var(--border-input) 40%, transparent)', 
    boxShadow: '0 8px 30px rgba(0, 0, 0, 0.06)' 
  };
  
  const solidItemStyle = { 
    backgroundColor: 'var(--bg-input)', 
    border: '1px solid var(--border-input)' 
  };

  useEffect(() => { setIsMounted(true); }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        
        let userProfile = null;
        if (session?.user) {
          const { data } = await supabase.from('doodoo_perfis').select('*').eq('user_id', session.user.id).maybeSingle();
          userProfile = data;
        }

        if (userProfile) {
          setCurrentUser(userProfile as DBProfile);
          
          // Permissões
          let myAllowedTabs: string[] = [];
          const { data: permissoesDb } = await supabase.from('doodoo_permissoes').select('*');
          if (permissoesDb) {
            myAllowedTabs = permissoesDb.filter(p => p.cargos_permitidos.includes(userProfile.cargo) || (p.usuarios_permitidos && p.usuarios_permitidos.includes(userProfile.user_id))).map(p => p.aba_key.replace('tarefas_todas', 'tarefas').replace('tarefas_minha', 'tarefas'));
            const uniqueTabs = Array.from(new Set(myAllowedTabs));
            setAllowedTabs(uniqueTabs); myAllowedTabs = uniqueTabs;
          }

          // Tarefas
          if (myAllowedTabs.includes('tarefas')) {
            const { data: tarefas } = await supabase.from('doodoo_tarefas').select('id, titulo, status, prioridade, responsavel, atribuido_por, data_limite, hora_limite, created_at').eq('setor', userProfile.setor).or(`responsavel.eq."${userProfile.nome}",atribuido_por.eq."${userProfile.nome}"`).order('created_at', { ascending: false });
            if (tarefas) {
              const activeTasks = tarefas.filter(t => t.status !== 'concluida');
              const myQueue = activeTasks.filter(t => t.responsavel === userProfile.nome);
              setOverdueTasks(myQueue.filter(t => isTaskOverdue(t.data_limite, t.hora_limite, t.status)));
              setPendingTasks(myQueue.filter(t => !isTaskOverdue(t.data_limite, t.hora_limite, t.status)));
              setRecentActivities(tarefas.slice(0, 5) as TaskItem[]);
            }
          }

          // Anotações
          if (myAllowedTabs.includes('anotacoes') && session?.user) {
             const { data: notas } = await supabase.from('doodoo_notas').select('id, titulo, conteudo, cor, created_at').eq('usuario_id', session.user.id).order('updated_at', { ascending: false }).limit(3);
             if (notas) setRecentNotes(notas as NoteItem[]);
          }
        }
      } catch (error) { console.error(error); } finally { setIsLoading(false); }
    };
    fetchData();
  }, []);

  const formatTimeAgo = (dateString: string) => {
    if (!isMounted) return ''; 
    const diff = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 1000 / 60);
    if (diff < 60) return `Há ${diff} min`;
    if (diff < 1440) return `Há ${Math.floor(diff / 60)}h`;
    return `Há ${Math.floor(diff / 1440)} dias`;
  };

  const handleOpenTask = (id: string) => { router.push(`/dashboard/tarefas?taskId=${id}`); setIsTaskModalOpen(false); };

  if (isLoading || !isMounted) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center">
        <div className="w-16 h-16 rounded-[1.5rem] flex items-center justify-center animate-pulse" style={{ backgroundColor: 'var(--bg-card)' }}>
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--tab-active)' }} />
        </div>
      </div>
    );
  }

  const hasTasksPermission = allowedTabs.includes('tarefas');
  const hasNotesPermission = allowedTabs.includes('anotacoes');

  return (
    <div className="w-full flex flex-col space-y-4 md:space-y-6 animate-in fade-in duration-500 relative z-0">
      
      {/* BANNER DINÂMICO LIQUID GLASS (Ajustado para Mobile App Feel) */}
      <div className="w-full p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] relative overflow-hidden flex flex-col justify-center min-h-[140px] md:min-h-[160px]" style={glassCardStyle}>
        <div className="absolute top-0 right-0 w-64 md:w-96 h-64 md:h-96 bg-brand-panel opacity-10 rounded-full blur-[80px] pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-48 md:w-72 h-48 md:h-72 bg-brand-panel opacity-10 rounded-full blur-[80px] pointer-events-none"></div>
        
        <div className="relative z-10 flex items-center space-x-2 mb-1.5 md:mb-3">
          <Sparkles className="w-3.5 h-3.5 md:w-5 md:h-5 text-blue-500" />
          <span className="text-[10px] md:text-sm font-extrabold uppercase tracking-widest opacity-60 truncate">Setor {currentUser?.setor || 'Geral'}</span>
        </div>
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight relative z-10 truncate">
          Olá, {currentUser?.nome?.split(' ')[0] || 'Usuário'}
        </h1>
      </div>

      {/* GRID DE ATALHOS - ALTO CONTRASTE */}
      <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
        
        {allowedTabs.includes('chat') && (
          <Link href="/dashboard/conversas" className="w-full p-5 md:p-6 rounded-[1.75rem] md:rounded-[2rem] transition-transform hover:-translate-y-1 group cursor-pointer flex flex-row md:flex-col items-center md:items-start justify-start relative overflow-hidden shadow-sm active:scale-95 md:active:scale-100" style={glassCardStyle}>
            <div className="p-3 md:p-4 rounded-2xl bg-blue-500/10 text-blue-500 group-hover:scale-110 transition-transform flex-shrink-0 mr-4 md:mr-0 border border-blue-500/20">
              <MessageSquare className="w-6 h-6 md:w-7 md:h-7" />
            </div>
            <div className="flex-1 min-w-0 md:mt-6 text-left">
              <h3 className="text-[15px] md:text-lg font-extrabold truncate">Chat Corporativo</h3>
              <p className="text-[11px] md:text-[13px] opacity-60 mt-0.5 md:mt-1 truncate font-medium">Comunicações rápidas.</p>
            </div>
          </Link>
        )}

        {hasTasksPermission && (
          <button onClick={() => setIsTaskModalOpen(true)} className="w-full text-left p-5 md:p-6 rounded-[1.75rem] md:rounded-[2rem] transition-transform hover:-translate-y-1 group cursor-pointer flex flex-row md:flex-col items-center md:items-start justify-start relative overflow-hidden shadow-sm active:scale-95 md:active:scale-100" style={glassCardStyle}>
            {overdueTasks.length > 0 && <div className="absolute top-0 right-0 w-24 md:w-28 h-24 md:h-28 bg-red-500/10 rounded-bl-[100%] pointer-events-none transition-all group-hover:scale-110"></div>}
            
            <div className="p-3 md:p-4 rounded-2xl bg-emerald-500/10 text-emerald-500 group-hover:scale-110 transition-transform flex-shrink-0 mr-4 md:mr-0 relative z-10 border border-emerald-500/20">
              <CheckSquare className="w-6 h-6 md:w-7 md:h-7" />
            </div>
            
            <div className="flex-1 min-w-0 md:mt-6 text-left flex flex-col justify-center">
              <h3 className="text-[15px] md:text-lg font-extrabold truncate">Minha Fila</h3>
              <p className="text-[11px] md:text-[13px] opacity-60 mt-0.5 md:mt-1 truncate font-medium">{overdueTasks.length > 0 ? <span className="text-red-500 font-bold">Atenção: {overdueTasks.length} atrasos</span> : 'Fila de tarefas ativas.'}</p>
            </div>

            {(pendingTasks.length > 0 || overdueTasks.length > 0) && (
              <div className="flex-shrink-0 ml-3 md:absolute md:top-6 md:right-6">
                <span className={`text-[10px] md:text-[11px] font-extrabold px-3 py-1.5 rounded-xl border ${overdueTasks.length > 0 ? 'bg-red-500/10 text-red-500 border-red-500/30' : 'bg-black/5 dark:bg-white/5 border-transparent'}`}>
                  {pendingTasks.length + overdueTasks.length} Ativas
                </span>
              </div>
            )}
          </button>
        )}

        {allowedTabs.includes('agenda') && (
          <Link href="/dashboard/agenda" className="w-full p-5 md:p-6 rounded-[1.75rem] md:rounded-[2rem] transition-transform hover:-translate-y-1 group cursor-pointer flex flex-row md:flex-col items-center md:items-start justify-start relative overflow-hidden shadow-sm active:scale-95 md:active:scale-100" style={glassCardStyle}>
            <div className="p-3 md:p-4 rounded-2xl bg-amber-500/10 text-amber-500 group-hover:scale-110 transition-transform flex-shrink-0 mr-4 md:mr-0 border border-amber-500/20">
              <Calendar className="w-6 h-6 md:w-7 md:h-7" />
            </div>
            <div className="flex-1 min-w-0 md:mt-6 text-left">
              <h3 className="text-[15px] md:text-lg font-extrabold truncate">Agenda Central</h3>
              <p className="text-[11px] md:text-[13px] opacity-60 mt-0.5 md:mt-1 truncate font-medium">Alinhamentos da equipe.</p>
            </div>
            <div className="flex-shrink-0 ml-3 md:absolute md:top-6 md:right-6">
              <span className="text-[10px] md:text-[11px] font-extrabold px-3 py-1.5 rounded-xl bg-black/5 dark:bg-white/5 border-transparent">Hoje</span>
            </div>
          </Link>
        )}

        {hasNotesPermission && (
          <Link href="/dashboard/notas" className="w-full p-5 md:p-6 rounded-[1.75rem] md:rounded-[2rem] transition-transform hover:-translate-y-1 group cursor-pointer flex flex-row md:flex-col items-center md:items-start justify-start relative overflow-hidden shadow-sm active:scale-95 md:active:scale-100" style={glassCardStyle}>
            <div className="p-3 md:p-4 rounded-2xl bg-purple-500/10 text-purple-500 group-hover:scale-110 transition-transform flex-shrink-0 mr-4 md:mr-0 border border-purple-500/20">
              <StickyNote className="w-6 h-6 md:w-7 md:h-7" />
            </div>
            <div className="flex-1 min-w-0 md:mt-6 text-left">
              <h3 className="text-[15px] md:text-lg font-extrabold truncate">Anotações</h3>
              <p className="text-[11px] md:text-[13px] opacity-60 mt-0.5 md:mt-1 truncate font-medium">Bloco de rascunhos pessoal.</p>
            </div>
          </Link>
        )}
      </div>

      {/* PAINEL INFERIOR DINÂMICO */}
      {hasTasksPermission && (
        <div className="w-full p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] space-y-5 md:space-y-6 shadow-sm" style={glassCardStyle}>
          <h3 className="font-extrabold text-[15px] md:text-lg border-b pb-4 opacity-80" style={{ borderColor: 'var(--border-input)' }}>Atividades e Delegações Recentes</h3>
          
          <div className="space-y-3">
            {recentActivities.map(tarefa => (
              <div key={tarefa.id} className="p-4 md:p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between hover:scale-[1.01] transition-transform gap-3" style={solidItemStyle}>
                <div className="flex items-center space-x-4 overflow-hidden">
                  {tarefa.status === 'concluida' ? <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" /> : tarefa.status === 'andamento' ? <PlayCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" /> : tarefa.status === 'bloqueado' ? <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" /> : <Clock className="w-5 h-5 text-blue-500 flex-shrink-0" />}
                  <div className="overflow-hidden min-w-0">
                    <p className="font-extrabold text-[14px] md:text-[15px] truncate" title={tarefa.titulo}>{tarefa.titulo}</p>
                    <p className="opacity-60 text-[11px] md:text-xs truncate flex items-center space-x-2 mt-1">
                      {tarefa.responsavel === currentUser?.nome ? <span className="font-bold text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded flex-shrink-0">Para mim</span> : <span className="truncate">Delegado para <span className="font-extrabold">{tarefa.responsavel}</span></span>}
                    </p>
                  </div>
                </div>
                <span className="opacity-40 text-[10px] md:text-[11px] font-extrabold uppercase tracking-widest whitespace-nowrap sm:pl-4">{formatTimeAgo(tarefa.created_at)}</span>
              </div>
            ))}
            {recentActivities.length === 0 && <div className="text-center p-8 opacity-40 font-semibold text-xs md:text-sm border-2 border-dashed rounded-2xl" style={{ borderColor: 'var(--border-input)' }}>Nenhum histórico de atividade no momento.</div>}
          </div>
        </div>
      )}

      {/* Espaço preenchido por Anotações se não tiver tarefas */}
      {!hasTasksPermission && hasNotesPermission && (
        <div className="w-full p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] space-y-5 md:space-y-6 shadow-sm" style={glassCardStyle}>
          <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: 'var(--border-input)' }}>
            <h3 className="font-extrabold text-[15px] md:text-lg flex items-center space-x-2 opacity-80"><StickyNote className="w-5 h-5 text-purple-500" /><span>Lembretes Rápidos</span></h3>
            <Link href="/dashboard/notas" className="text-[11px] md:text-xs font-bold text-blue-500 hover:underline">Ver todas</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {recentNotes.map(nota => (
              <Link href="/dashboard/notas" key={nota.id} className="w-full p-5 md:p-6 rounded-3xl hover:-translate-y-1 transition-transform cursor-pointer group flex flex-col h-32 md:h-44 min-w-0" style={solidItemStyle}>
                <div className="flex items-center justify-between mb-3">
                   <span className="text-[9px] font-extrabold uppercase tracking-widest opacity-50 bg-black/5 dark:bg-white/5 px-2 py-1 rounded-md">{nota.cor || 'Geral'}</span>
                </div>
                <h4 className="font-extrabold truncate group-hover:text-brand-panel transition-colors text-[14px] md:text-[15px]">{nota.titulo}</h4>
                <p className="opacity-60 text-[12px] md:text-[13px] mt-2 line-clamp-2 leading-relaxed flex-1 font-medium">{nota.conteudo}</p>
                <span className="opacity-40 text-[9px] md:text-[10px] font-extrabold mt-3 block uppercase">{new Date(nota.created_at).toLocaleDateString('pt-BR')}</span>
              </Link>
            ))}
            {recentNotes.length === 0 && <div className="col-span-full text-center p-8 opacity-40 font-semibold text-xs md:text-sm border-2 border-dashed rounded-3xl flex flex-col items-center justify-center space-y-3" style={{ borderColor: 'var(--border-input)' }}><FileText className="w-8 h-8 opacity-50" /><span>O seu bloco de anotações está vazio.</span></div>}
          </div>
        </div>
      )}

      {/* 🚀 ESPAÇADOR VITAL PARA O MOBILE PWA - PREVINE COLISÕES COM A BOTTOM NAV */}
      <div className="h-32 md:h-10 w-full flex-shrink-0 pointer-events-none"></div>

      {/* MODAL DE RESUMO DE TAREFAS */}
      {isTaskModalOpen && hasTasksPermission && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-input)' }}>
            
            <div className="px-5 py-4 md:px-6 md:py-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-input)' }}>
              <div>
                <h3 className="font-extrabold text-sm md:text-base flex items-center space-x-2"><CheckSquare className="w-5 h-5 text-blue-500" /><span>Resumo: Minha Fila</span></h3>
                <p className="text-[11px] font-bold opacity-50 uppercase tracking-widest mt-1">Tarefas que dependem de si</p>
              </div>
              <button onClick={() => setIsTaskModalOpen(false)} className="p-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors active:scale-95"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
              {overdueTasks.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-[11px] md:text-xs font-extrabold text-red-500 flex items-center space-x-2 border-b pb-2.5 border-red-500/20"><AlertTriangle className="w-4 h-4" /> <span>Em Atraso ({overdueTasks.length})</span></h4>
                  <div className="space-y-3">
                    {overdueTasks.map(t => (
                      <div key={t.id} onClick={() => handleOpenTask(t.id)} className="p-4 rounded-2xl border border-red-500/40 bg-red-500/5 hover:bg-red-500/10 cursor-pointer transition-colors shadow-sm">
                        <p className="text-[14px] font-extrabold leading-tight">{t.titulo}</p>
                        <p className="text-[11px] text-red-500 font-bold mt-2 uppercase tracking-wide">Prazo era: {t.data_limite} às {t.hora_limite}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <h4 className="text-[11px] md:text-xs font-extrabold flex items-center space-x-2 border-b pb-2.5 opacity-70" style={{ borderColor: 'var(--border-input)' }}><Clock className="w-4 h-4" /> <span>Ativas e No Prazo ({pendingTasks.length})</span></h4>
                {pendingTasks.length > 0 ? (
                  <div className="space-y-3">
                    {pendingTasks.map(t => (
                      <div key={t.id} onClick={() => handleOpenTask(t.id)} className="p-4 rounded-2xl border hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors shadow-sm" style={solidItemStyle}>
                        <div className="flex items-start justify-between gap-3">
                           <p className="text-[14px] font-extrabold leading-tight flex-1">{t.titulo}</p>
                           {t.prioridade === 'Urgente' && <Flame className="w-4 h-4 text-amber-500 flex-shrink-0" />}
                        </div>
                        <p className="text-[11px] opacity-60 font-bold mt-2 uppercase tracking-wide">Prazo: {t.data_limite || 'Sem prazo'} às {t.hora_limite}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] md:text-xs opacity-50 font-semibold text-center p-5 border border-dashed rounded-2xl" style={{ borderColor: 'var(--border-input)' }}>Nenhuma tarefa pendente na fila.</p>
                )}
              </div>
            </div>

            <div className="p-5 border-t" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-input)' }}>
              <Link href="/dashboard/tarefas" className="w-full py-4 rounded-xl bg-brand-panel text-white text-[13px] font-extrabold shadow-lg flex items-center justify-center space-x-2 hover:scale-[1.02] active:scale-[0.98] transition-transform">
                 <span>Abrir Painel Completo Kanban</span>
                 <ArrowUpRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}