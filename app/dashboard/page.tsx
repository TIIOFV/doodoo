'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  MessageSquare, CheckSquare, Calendar, StickyNote, 
  Sparkles, ArrowUpRight, CheckCircle2, Clock, Loader2, PlayCircle 
} from 'lucide-react';
import { supabase } from './../lib/supabase';
// 🚀 LIGADO AO CÉREBRO GLOBAL DO TEMA
import { useTheme } from '../contexts/ThemeContext';

interface DBProfile {
  id: string;
  nome: string;
  cargo: string;
  setor: string;
}

interface TaskItem {
  id: string;
  titulo: string;
  status: 'pendente' | 'andamento' | 'concluida';
  prioridade: string;
  responsavel: string;
  created_at: string;
}

export default function DashboardOverviewPage() {
  const { theme } = useTheme(); // Consome o tema global sem precisar de localStorage local
  const [isMounted, setIsMounted] = useState(false);
  const [currentUser, setCurrentUser] = useState<DBProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Métricas
  const [pendingTasks, setPendingTasks] = useState(0);
  const [urgentTasks, setUrgentTasks] = useState(0);
  const [recentActivities, setRecentActivities] = useState<TaskItem[]>([]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

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

        if (!userProfile) {
          const { data: fallback } = await supabase.from('doodoo_perfis').select('*').ilike('nome', '%Pedro%').limit(1).maybeSingle();
          userProfile = fallback || await supabase.from('doodoo_perfis').select('*').limit(1).maybeSingle();
        }

        if (userProfile) {
          setCurrentUser(userProfile as DBProfile);

          const { data: tarefas } = await supabase
            .from('doodoo_tarefas')
            .select('id, titulo, status, prioridade, responsavel, created_at')
            .eq('setor', userProfile.setor)
            .order('created_at', { ascending: false });

          if (tarefas) {
            const isManager = ['administrador', 'gestor', 'coordenador'].includes(userProfile.cargo);
            const myTasks = tarefas.filter(t => t.status !== 'concluida' && (isManager || t.responsavel === userProfile.nome));
            
            setPendingTasks(myTasks.length);
            setUrgentTasks(myTasks.filter(t => t.prioridade === 'Urgente').length);
            setRecentActivities(tarefas.slice(0, 4) as TaskItem[]);
          }
        }
      } catch (error) {
        console.error("Erro ao carregar Visão Geral:", error);
      } finally {
        setIsLoading(false);
      }
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

  if (isLoading || !isMounted) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin opacity-50 text-blue-500" />
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col space-y-6 animate-in fade-in duration-300 pb-8">
      
      {/* Banner de Boas-Vindas Dinâmico */}
      <div className="p-6 md:p-8 rounded-[2.5rem] border relative overflow-hidden shadow-xl backdrop-blur-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6" 
           style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
        <div className="absolute top-0 right-0 w-96 h-96 bg-brand-panel opacity-5 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="space-y-2 relative z-10">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-extrabold bg-blue-500/10 text-blue-500">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Workspace Ativo • Setor {currentUser?.setor || 'Geral'}</span>
          </div>
          {/* 🚀 BLINDAGEM DO SPLIT NO NOME */}
          <h1 className="text-3xl font-extrabold tracking-tight">Olá, {currentUser?.nome ? currentUser.nome.split(' ')[0] : 'Usuário'}</h1>
          <p className="text-xs opacity-60 max-w-lg leading-relaxed">
            Bem-vindo ao Doo Doo Workspace. Aqui está o resumo das suas atividades, comunicados e compromissos para hoje.
          </p>
        </div>

        <div className="flex items-center space-x-3 relative z-10 w-full md:w-auto">
          <Link 
            href="/dashboard/tarefas"
            className="w-full md:w-auto justify-center px-5 py-3 rounded-2xl bg-brand-panel text-white text-xs font-extrabold shadow-lg hover:opacity-95 transition-all flex items-center space-x-2 cursor-pointer"
          >
            <span>Ver Fila Completa</span>
            <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Grid de Atalhos Rápidos com Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* 🚀 CORREÇÃO DE TERMOS PARA PT-BR */}
        <Link href="/dashboard/conversas" className="p-6 rounded-[2rem] border transition-all hover:scale-[1.02] group cursor-pointer" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-500 group-hover:scale-110 transition-transform">
              <MessageSquare className="w-6 h-6" />
            </div>
          </div>
          <h3 className="text-sm font-extrabold">Chat Corporativo</h3>
          <p className="text-xs opacity-60 mt-1">Comunicados da equipe.</p>
        </Link>

        <Link href="/dashboard/tarefas" className="p-6 rounded-[2rem] border transition-all hover:scale-[1.02] group cursor-pointer relative overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
          {urgentTasks > 0 && <div className="absolute top-0 right-0 w-16 h-16 bg-red-500/10 rounded-bl-[100%] pointer-events-none"></div>}
          <div className="flex items-center justify-between mb-4 relative z-10">
            <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-500 group-hover:scale-110 transition-transform">
              <CheckSquare className="w-6 h-6" />
            </div>
            {pendingTasks > 0 && (
              <span className={`text-xs font-extrabold px-2.5 py-1 rounded-xl border ${urgentTasks > 0 ? 'bg-red-500/10 text-red-500 border-red-500/20' : ''}`} style={urgentTasks === 0 ? { backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' } : {}}>
                {pendingTasks} pendentes
              </span>
            )}
          </div>
          <h3 className="text-sm font-extrabold">Tarefas & Rotinas</h3>
          <p className="text-xs opacity-60 mt-1">{urgentTasks > 0 ? `${urgentTasks} demandam urgência.` : 'Verifique a sua fila.'}</p>
        </Link>

        <Link href="/dashboard/agenda" className="p-6 rounded-[2rem] border transition-all hover:scale-[1.02] group cursor-pointer" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-500 group-hover:scale-110 transition-transform">
              <Calendar className="w-6 h-6" />
            </div>
            <span className="text-xs font-extrabold px-2.5 py-1 rounded-xl border" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>Hoje</span>
          </div>
          <h3 className="text-sm font-extrabold">Agenda Corporativa</h3>
          <p className="text-xs opacity-60 mt-1">Alinhamentos e reuniões.</p>
        </Link>

        <Link href="/dashboard/notas" className="p-6 rounded-[2rem] border transition-all hover:scale-[1.02] group cursor-pointer" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-2xl bg-purple-500/10 text-purple-500 group-hover:scale-110 transition-transform">
              <StickyNote className="w-6 h-6" />
            </div>
          </div>
          <h3 className="text-sm font-extrabold">Anotações Pessoais</h3>
          <p className="text-xs opacity-60 mt-1">Cadernos e credenciais.</p>
        </Link>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        <div className="lg:col-span-8 p-6 rounded-[2.25rem] border space-y-4" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
          <h3 className="font-extrabold text-sm border-b pb-3" style={{ borderColor: 'var(--border-input)' }}>Atividades Recentes no Setor {currentUser?.setor || 'Geral'}</h3>
          
          <div className="space-y-3 text-xs">
            {recentActivities.map(tarefa => (
              <div key={tarefa.id} className="p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between hover:bg-black/5 dark:hover:bg-white/5 transition-colors gap-2" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                <div className="flex items-center space-x-3">
                  {tarefa.status === 'concluida' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  ) : tarefa.status === 'andamento' ? (
                    <PlayCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  ) : (
                    <Clock className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  )}
                  <div className="overflow-hidden">
                    <p className="font-bold truncate max-w-[200px] md:max-w-md">{tarefa.titulo}</p>
                    <p className="opacity-60 text-[11px] truncate">
                      {tarefa.status === 'concluida' ? 'Concluída por' : 'Atribuída a'} {tarefa.responsavel}
                    </p>
                  </div>
                </div>
                <span className="opacity-40 text-[10px] font-bold whitespace-nowrap sm:pl-2">{formatTimeAgo(tarefa.created_at)}</span>
              </div>
            ))}
            
            {recentActivities.length === 0 && (
              <div className="text-center p-6 opacity-40 font-semibold text-xs">
                Nenhuma atividade recente no setor.
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-4 p-6 rounded-[2.25rem] border space-y-4 flex flex-col" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
          <h3 className="font-extrabold text-sm border-b pb-3" style={{ borderColor: 'var(--border-input)' }}>Status do Ambiente</h3>
          
          <div className="space-y-3 text-xs flex-1">
            <div className="p-3.5 rounded-2xl border flex items-center justify-between" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
              <span className="font-semibold">Banco de Dados</span>
              <span className="font-extrabold text-emerald-500 flex items-center"><span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span> Seguro</span>
            </div>
            <div className="p-3.5 rounded-2xl border flex items-center justify-between" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
              <span className="font-semibold">Sincronização Cloud</span>
              <span className="font-extrabold text-blue-500 flex items-center"><span className="w-2 h-2 rounded-full bg-blue-500 mr-1.5"></span> Ativa</span>
            </div>
            
            <div className="p-3.5 rounded-2xl border flex flex-col justify-center space-y-1" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
              <div className="flex justify-between w-full">
                <span className="font-semibold opacity-70">Nível de Acesso</span>
                {/* 🚀 PROTEÇÃO ADICIONADA: toUpperCase seguro */}
                <span className="font-extrabold text-brand-panel">{currentUser?.cargo?.toUpperCase() || 'COLABORADOR'}</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}