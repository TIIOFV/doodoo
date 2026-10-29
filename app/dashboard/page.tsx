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
  id: string;
  user_id: string;
  nome: string;
  cargo: string;
  setor: string;
}

interface TaskItem {
  id: string;
  titulo: string;
  status: 'pendente' | 'andamento' | 'concluida' | 'bloqueado';
  prioridade: string;
  responsavel: string;
  atribuido_por: string;
  data_limite: string;
  hora_limite: string;
  created_at: string;
}

interface NoteItem {
  id: string;
  titulo: string;
  conteudo: string;
  created_at: string;
}

const isTaskOverdue = (dueDate: string, dueTime: string, status: string): boolean => {
  if (status === 'concluida' || !dueDate) return false;
  const parts = dueDate.split('/');
  if (parts.length !== 3) return false;
  const [day, month, year] = parts.map(Number);
  const [hour, minute] = (dueTime || '23:59').split(':').map(Number);
  const deadline = new Date(year, month - 1, day, hour || 23, minute || 59);
  return new Date().getTime() > deadline.getTime();
};

export default function DashboardOverviewPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const [isMounted, setIsMounted] = useState(false);
  const [currentUser, setCurrentUser] = useState<DBProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [allowedTabs, setAllowedTabs] = useState<string[]>([]);

  // Métricas
  const [pendingTasks, setPendingTasks] = useState<TaskItem[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<TaskItem[]>([]);
  const [recentActivities, setRecentActivities] = useState<TaskItem[]>([]);
  
  // Alternativa visual: Notas Recentes
  const [recentNotes, setRecentNotes] = useState<NoteItem[]>([]);
  
  // Modal de Tarefas
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

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

          let myAllowedTabs: string[] = [];
          
          // 1. Pega Permissões para saber o que o usuário pode ver
          const { data: permissoesDb } = await supabase.from('doodoo_permissoes').select('*');
          if (permissoesDb) {
            myAllowedTabs = permissoesDb
              .filter(p => p.cargos_permitidos.includes(userProfile.cargo) || (p.usuarios_permitidos && p.usuarios_permitidos.includes(userProfile.user_id)))
              .map(p => p.aba_key.replace('tarefas_todas', 'tarefas').replace('tarefas_minha', 'tarefas'));
            
            const uniqueTabs = Array.from(new Set(myAllowedTabs));
            setAllowedTabs(uniqueTabs);
            myAllowedTabs = uniqueTabs;
          }

          // 2. Busca Tarefas APENAS se o usuário tiver acesso à aba "tarefas"
          if (myAllowedTabs.includes('tarefas')) {
            const { data: tarefas } = await supabase
              .from('doodoo_tarefas')
              .select('id, titulo, status, prioridade, responsavel, atribuido_por, data_limite, hora_limite, created_at')
              .eq('setor', userProfile.setor)
              .or(`responsavel.eq."${userProfile.nome}",atribuido_por.eq."${userProfile.nome}"`)
              .order('created_at', { ascending: false });

            if (tarefas) {
              const activeTasks = tarefas.filter(t => t.status !== 'concluida');
              const myQueue = activeTasks.filter(t => t.responsavel === userProfile.nome);
              
              setOverdueTasks(myQueue.filter(t => isTaskOverdue(t.data_limite, t.hora_limite, t.status)));
              setPendingTasks(myQueue.filter(t => !isTaskOverdue(t.data_limite, t.hora_limite, t.status)));
              setRecentActivities(tarefas.slice(0, 5) as TaskItem[]);
            }
          }

          // 3. Busca Anotações APENAS se o usuário não tiver acesso a tarefas mas tiver acesso a anotações
          // Isso serve para preencher o espaço de forma útil!
          if (!myAllowedTabs.includes('tarefas') && myAllowedTabs.includes('anotacoes') && session?.user) {
             const { data: notas } = await supabase
               .from('doodoo_notas')
               .select('id, titulo, conteudo, created_at')
               .eq('usuario_id', session.user.id)
               .order('created_at', { ascending: false })
               .limit(3);
               
             if (notas) setRecentNotes(notas as NoteItem[]);
          }
        }
      } catch (error) { console.error(error); } finally { setIsLoading(false); }
    };
    fetchData();
  }, []);

  const formatTimeAgo = (dateString: string) => {
    if (!isMounted) return ''; 
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000 / 60);
    
    if (diff < 60) return `Há ${diff} min`;
    if (diff < 1440) return `Há ${Math.floor(diff / 60)}h`;
    return `Há ${Math.floor(diff / 1440)} dias`;
  };

  const handleOpenTask = (id: string) => {
    router.push(`/dashboard/tarefas?taskId=${id}`);
    setIsTaskModalOpen(false);
  };

  if (isLoading || !isMounted) return <div className="w-full h-full flex flex-col items-center justify-center"><Loader2 className="w-8 h-8 animate-spin opacity-50 text-blue-500" /></div>;

  const hasTasksPermission = allowedTabs.includes('tarefas');
  const hasNotesPermission = allowedTabs.includes('anotacoes');

  return (
    <div className="w-full h-full flex flex-col space-y-6 animate-in fade-in duration-300 pb-8">
      
      {/* 🚀 Banner Dinâmico: Se não tiver tarefas, o banner expande-se visualmente para preencher o espaço inicial */}
      <div className={`p-6 md:p-8 rounded-[2.5rem] border relative overflow-hidden shadow-xl backdrop-blur-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6 ${!hasTasksPermission ? 'md:py-12' : ''}`} style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
        <div className="absolute top-0 right-0 w-96 h-96 bg-brand-panel opacity-5 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="space-y-2 relative z-10">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-extrabold bg-blue-500/10 text-blue-500">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Workspace Ativo • Setor {currentUser?.setor || 'Geral'}</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Olá, {currentUser?.nome?.split(' ')[0] || 'Usuário'}</h1>
          <p className="text-xs opacity-60 max-w-lg leading-relaxed">
            Bem-vindo ao Doo Doo Corporativo. Utilize o menu lateral ou os atalhos abaixo para iniciar a sua jornada diária.
          </p>
        </div>
      </div>

      {/* Grid de Atalhos: O CSS Grid adapta-se automaticamente à quantidade de colunas */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${allowedTabs.length >= 4 ? 'lg:grid-cols-4' : allowedTabs.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
        
        {allowedTabs.includes('chat') && (
          <Link href="/dashboard/conversas" className="p-6 rounded-[2rem] border transition-all hover:scale-[1.02] group cursor-pointer flex flex-col justify-between" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-500 group-hover:scale-110 transition-transform">
                <MessageSquare className="w-6 h-6" />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-extrabold">Chat Corporativo</h3>
              <p className="text-xs opacity-60 mt-1">Acessar as comunicações rápidas.</p>
            </div>
          </Link>
        )}

        {hasTasksPermission && (
          <button onClick={() => setIsTaskModalOpen(true)} className="text-left p-6 rounded-[2rem] border transition-all hover:scale-[1.02] group cursor-pointer relative overflow-hidden flex flex-col justify-between" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
            {overdueTasks.length > 0 && <div className="absolute top-0 right-0 w-16 h-16 bg-red-500/10 rounded-bl-[100%] pointer-events-none"></div>}
            <div className="flex items-center justify-between mb-4 relative z-10">
              <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-500 group-hover:scale-110 transition-transform">
                <CheckSquare className="w-6 h-6" />
              </div>
              {(pendingTasks.length > 0 || overdueTasks.length > 0) && (
                <span className={`text-xs font-extrabold px-2.5 py-1 rounded-xl border ${overdueTasks.length > 0 ? 'bg-red-500/10 text-red-500 border-red-500/20' : ''}`} style={overdueTasks.length === 0 ? { backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' } : {}}>
                  {pendingTasks.length + overdueTasks.length} ativas
                </span>
              )}
            </div>
            <div>
              <h3 className="text-sm font-extrabold">Minha Fila (Tarefas)</h3>
              <p className="text-xs opacity-60 mt-1">{overdueTasks.length > 0 ? `Atenção: ${overdueTasks.length} em atraso.` : 'Verifique o que tem para fazer.'}</p>
            </div>
          </button>
        )}

        {allowedTabs.includes('agenda') && (
          <Link href="/dashboard/agenda" className="p-6 rounded-[2rem] border transition-all hover:scale-[1.02] group cursor-pointer flex flex-col justify-between" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-500 group-hover:scale-110 transition-transform">
                <Calendar className="w-6 h-6" />
              </div>
              <span className="text-xs font-extrabold px-2.5 py-1 rounded-xl border" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>Hoje</span>
            </div>
            <div>
              <h3 className="text-sm font-extrabold">Agenda Corporativa</h3>
              <p className="text-xs opacity-60 mt-1">Alinhamentos e reuniões do time.</p>
            </div>
          </Link>
        )}

        {hasNotesPermission && (
          <Link href="/dashboard/notas" className="p-6 rounded-[2rem] border transition-all hover:scale-[1.02] group cursor-pointer flex flex-col justify-between" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-2xl bg-purple-500/10 text-purple-500 group-hover:scale-110 transition-transform">
                <StickyNote className="w-6 h-6" />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-extrabold">Anotações Pessoais</h3>
              <p className="text-xs opacity-60 mt-1">Cadernos de rascunho e credenciais.</p>
            </div>
          </Link>
        )}
      </div>

      {/* 🚀 PAINEL INFERIOR DINÂMICO */}
      {/* Se tiver permissão de tarefas, mostra atividades recentes */}
      {hasTasksPermission && (
        <div className="w-full p-6 rounded-[2.25rem] border space-y-4 shadow-sm" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
          <h3 className="font-extrabold text-sm border-b pb-3" style={{ borderColor: 'var(--border-input)' }}>Suas Atividades e Delegações Recentes</h3>
          
          <div className="space-y-3 text-xs">
            {recentActivities.map(tarefa => (
              <div key={tarefa.id} className="p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between hover:bg-black/5 dark:hover:bg-white/5 transition-colors gap-2" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                <div className="flex items-center space-x-3 overflow-hidden">
                  {tarefa.status === 'concluida' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  ) : tarefa.status === 'andamento' ? (
                    <PlayCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  ) : tarefa.status === 'bloqueado' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  ) : (
                    <Clock className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  )}
                  
                  <div className="overflow-hidden">
                    <p className="font-bold truncate" title={tarefa.titulo}>{tarefa.titulo}</p>
                    <p className="opacity-60 text-[11px] truncate flex items-center space-x-1 mt-0.5">
                      {tarefa.responsavel === currentUser?.nome ? (
                        <span className="font-semibold text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded">Para mim</span>
                      ) : (
                        <span>Delegado para <span className="font-bold">{tarefa.responsavel}</span></span>
                      )}
                    </p>
                  </div>
                </div>
                <span className="opacity-40 text-[10px] font-bold whitespace-nowrap sm:pl-2">{formatTimeAgo(tarefa.created_at)}</span>
              </div>
            ))}
            
            {recentActivities.length === 0 && (
              <div className="text-center p-8 opacity-40 font-semibold text-xs border-2 border-dashed rounded-2xl" style={{ borderColor: 'var(--border-input)' }}>
                Você ainda não tem tarefas enviadas ou recebidas.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 🚀 Se NÃO tiver tarefas mas tiver Anotações, preenche o espaço com as notas recentes! */}
      {!hasTasksPermission && hasNotesPermission && (
        <div className="w-full p-6 rounded-[2.25rem] border space-y-4 shadow-sm" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
          <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border-input)' }}>
            <h3 className="font-extrabold text-sm flex items-center space-x-2">
              <StickyNote className="w-4 h-4 text-purple-500" />
              <span>Lembretes Rápidos (Últimas Notas)</span>
            </h3>
            <Link href="/dashboard/notas" className="text-[10px] font-bold text-blue-500 hover:underline">Ver todas</Link>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {recentNotes.map(nota => (
              <Link href="/dashboard/notas" key={nota.id} className="p-4 rounded-2xl border hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer group flex flex-col h-32" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                <h4 className="font-bold truncate group-hover:text-brand-panel transition-colors">{nota.titulo}</h4>
                <p className="opacity-60 text-[11px] mt-2 line-clamp-3 leading-relaxed flex-1">
                  {nota.conteudo}
                </p>
                <span className="opacity-40 text-[9px] font-extrabold mt-2 block uppercase">{new Date(nota.created_at).toLocaleDateString('pt-BR')}</span>
              </Link>
            ))}
            
            {recentNotes.length === 0 && (
              <div className="col-span-full text-center p-8 opacity-40 font-semibold text-xs border-2 border-dashed rounded-2xl flex flex-col items-center justify-center space-y-2" style={{ borderColor: 'var(--border-input)' }}>
                <FileText className="w-6 h-6 opacity-50" />
                <span>O seu bloco de anotações está vazio.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE RESUMO DE TAREFAS */}
      {isTaskModalOpen && hasTasksPermission && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[85vh]" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
            
            <div className="px-6 py-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-input)' }}>
              <div>
                <h3 className="font-extrabold text-base flex items-center space-x-2">
                  <CheckSquare className="w-5 h-5 text-blue-500" />
                  <span>Resumo: Minha Fila</span>
                </h3>
                <p className="text-[11px] font-bold opacity-50 uppercase tracking-widest mt-1">Tarefas que dependem de si</p>
              </div>
              <button onClick={() => setIsTaskModalOpen(false)} className="p-2 rounded-xl hover:bg-black/10 cursor-pointer transition-colors"><X className="w-4 h-4" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar" style={{ backgroundColor: 'var(--bg-card)' }}>
              
              {/* TAREFAS ATRASADAS */}
              {overdueTasks.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-extrabold text-red-500 flex items-center space-x-1.5 border-b pb-2 border-red-500/20">
                    <AlertTriangle className="w-4 h-4" /> <span>Em Atraso ({overdueTasks.length})</span>
                  </h4>
                  <div className="space-y-2">
                    {overdueTasks.map(t => (
                      <div key={t.id} onClick={() => handleOpenTask(t.id)} className="p-3 rounded-xl border border-red-500/40 bg-red-500/5 hover:bg-red-500/10 cursor-pointer transition-colors">
                        <p className="text-xs font-bold leading-tight">{t.titulo}</p>
                        <p className="text-[10px] text-red-500 font-bold mt-1">Prazo era: {t.data_limite} às {t.hora_limite}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAREFAS PENDENTES / ANDAMENTO */}
              <div className="space-y-3">
                <h4 className="text-xs font-extrabold flex items-center space-x-1.5 border-b pb-2 opacity-70" style={{ borderColor: 'var(--border-input)' }}>
                  <Clock className="w-4 h-4" /> <span>Ativas e No Prazo ({pendingTasks.length})</span>
                </h4>
                {pendingTasks.length > 0 ? (
                  <div className="space-y-2">
                    {pendingTasks.map(t => (
                      <div key={t.id} onClick={() => handleOpenTask(t.id)} className="p-3 rounded-xl border hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                        <div className="flex items-start justify-between gap-2">
                           <p className="text-xs font-bold leading-tight flex-1">{t.titulo}</p>
                           {t.prioridade === 'Urgente' && <Flame className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                        </div>
                        <p className="text-[10px] opacity-60 font-semibold mt-1">Prazo: {t.data_limite || 'Sem prazo'} às {t.hora_limite}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] opacity-50 font-semibold text-center p-4 border border-dashed rounded-xl" style={{ borderColor: 'var(--border-input)' }}>Nenhuma tarefa pendente na fila.</p>
                )}
              </div>
            </div>

            <div className="p-4 border-t" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-input)' }}>
              <Link href="/dashboard/tarefas" className="w-full py-3 rounded-xl bg-brand-panel text-white text-xs font-extrabold shadow-sm flex items-center justify-center space-x-2 hover:opacity-90">
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