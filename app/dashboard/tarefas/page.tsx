'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { 
  CheckSquare, Plus, Trash2, Bell, Send, Sun, 
  X, Star, Search, Repeat, Shield, 
  CheckCircle2, AlertTriangle, ChevronRight, Palette, Loader2, LogOut, Clock, Flame, Tag
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
// 🚀 1. LIGADO AO CÉREBRO GLOBAL DO TEMA
import { useTheme } from '../../contexts/ThemeContext';

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

interface SubStep {
  id: number;
  text: string;
  done: boolean;
}

interface ChatComment {
  id: number;
  author: string;
  text: string;
  time: string;
  isAlert?: boolean;
}

interface TaskItem {
  id: string; 
  title: string;
  description: string;
  category: string;
  priority: 'Normal' | 'Urgente';
  status: 'pendente' | 'andamento' | 'concluida';
  important: boolean;
  myDay: boolean;
  isRoutine: boolean;
  assignee: string;
  sector: string;
  assignedBy: string;
  dueDate: string; // Formato DD/MM/YYYY
  dueTime: string; // Formato HH:MM
  steps: SubStep[];
  chat: ChatComment[];
}

const getInitials = (name: string) => {
  if (!name) return '..';
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

// 🚀 2. BUG DE FUSO HORÁRIO CORRIGIDO
const getLocalTodayISO = () => {
  const now = new Date();
  // Garante que o offset de fuso horário não adianta o dia
  const offset = now.getTimezoneOffset() * 60000;
  const localISOTime = (new Date(now.getTime() - offset)).toISOString().split('T')[0];
  return localISOTime;
};

const isTaskOverdue = (dueDate: string, dueTime: string, status: string): boolean => {
  if (status === 'concluida' || !dueDate) return false;
  const parts = dueDate.split('/');
  if (parts.length !== 3) return false;
  const [day, month, year] = parts.map(Number);
  const [hour, minute] = (dueTime || '23:59').split(':').map(Number);
  const deadline = new Date(year, month - 1, day, hour || 23, minute || 59);
  return new Date().getTime() > deadline.getTime();
};

const mapDbToTask = (dbTask: any): TaskItem => ({
  id: dbTask.id,
  title: dbTask.titulo || 'Sem título',
  description: dbTask.descricao || '',
  category: dbTask.categoria || 'Geral',
  priority: dbTask.prioridade === 'Urgente' ? 'Urgente' : 'Normal',
  status: dbTask.status || 'pendente',
  important: Boolean(dbTask.importante),
  myDay: Boolean(dbTask.meu_dia),
  isRoutine: Boolean(dbTask.rotina),
  assignee: dbTask.responsavel || '',
  sector: dbTask.setor || 'Geral',
  assignedBy: dbTask.atribuido_por || 'Sistema',
  dueDate: dbTask.data_limite || '',
  dueTime: dbTask.hora_limite || '17:00',
  steps: Array.isArray(dbTask.etapas) ? dbTask.etapas : [],
  chat: Array.isArray(dbTask.chat) ? dbTask.chat : []
});

const TASK_CATEGORIES = [
  'Infraestrutura & Redes',
  'Suporte / Helpdesk',
  'Sistemas & ERP',
  'Manutenção Preventiva',
  'Administrativo',
  'Urgência Clínica',
  'Geral'
];

export default function TarefasPage() {
  const { theme, changeTheme } = useTheme(); // Consome o Tema Global

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const themes = [
    { id: 'light', name: 'Claro', color: '#f5f5f7', border: '#d2d2d7' },
    { id: 'dark', name: 'Escuro', color: '#0f172a', border: '#475569' },
    { id: 'ocean', name: 'Oceano', color: '#005bb5', border: '#005bb5' },
    { id: 'nature', name: 'Natureza', color: '#2e8b57', border: '#2e8b57' },
    { id: 'sunset', name: 'Pôr do Sol', color: '#d9534f', border: '#d9534f' },
  ];

  const [currentUser, setCurrentUser] = useState<DBProfile | null>(null);
  const [teamMembers, setTeamMembers] = useState<DBProfile[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(false);

  const [smartList, setSmartList] = useState<'meu-dia' | 'todas' | 'importante' | 'rotinas' | 'concluidas'>('meu-dia');
  const [selectedPersonFilter, setSelectedPersonFilter] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState('Geral');
  const [newPriority, setNewPriority] = useState<'Normal' | 'Urgente'>('Normal');
  const [newIsRoutine, setNewIsRoutine] = useState(false);
  const [newAssignee, setNewAssignee] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('17:00');
  const [newSteps, setNewSteps] = useState<string[]>([]);
  const [tempStepInput, setTempStepInput] = useState('');

  const [stepInput, setStepInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [isDifficultyAlert, setIsDifficultyAlert] = useState(false);
  const taskChatEndRef = useRef<HTMLDivElement>(null);

  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const notifyBell = useCallback((title: string, desc: string) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('doodoo:notify', { detail: { title, desc } }));
    }
  }, []);

  const handleForceLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        setIsLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        let perfilAtual: DBProfile | null = null;

        if (session?.user) {
          const { data } = await supabase.from('doodoo_perfis').select('*').eq('user_id', session.user.id).maybeSingle();
          perfilAtual = data;
        }

        if (!perfilAtual) {
          const { data: fallbackUser } = await supabase.from('doodoo_perfis').select('*').ilike('nome', '%Pedro%').limit(1).maybeSingle();
          perfilAtual = fallbackUser || (await supabase.from('doodoo_perfis').select('*').limit(1).maybeSingle()).data;
        }

        if (perfilAtual) {
          setCurrentUser(perfilAtual);
          setNewAssignee(perfilAtual.nome);
          
          const [equipeRes, tarefasRes] = await Promise.all([
            supabase.from('doodoo_perfis').select('*').eq('setor', perfilAtual.setor).eq('status', 'ativo'),
            supabase.from('doodoo_tarefas').select('*').eq('setor', perfilAtual.setor).order('created_at', { ascending: false })
          ]);

          if (equipeRes.data) setTeamMembers(equipeRes.data as DBProfile[]);
          if (tarefasRes.data) setTasks(tarefasRes.data.map(mapDbToTask));
        } else {
          setAuthError(true);
        }
      } catch (error) {
        console.error("Erro crítico:", error);
        setAuthError(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAllData();
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    const taskSubscription = supabase
      .channel(`doodoo_tasks_realtime_${currentUser.setor}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'doodoo_tarefas' }, (payload) => {
          const incoming = mapDbToTask(payload.new);
          if (incoming.sector !== currentUser.setor) return;

          setTasks(prev => {
            if (prev.some(t => t.id === incoming.id)) return prev;
            const tempIdx = prev.findIndex(t => t.id.startsWith('temp-') && t.title === incoming.title);
            if (tempIdx !== -1) {
              const clone = [...prev];
              clone[tempIdx] = incoming;
              return clone;
            }
            return [incoming, ...prev];
          });

          if (incoming.assignee === currentUser.nome && incoming.assignedBy !== currentUser.nome) {
            notifyBell('📋 Nova Tarefa na Fila', `${incoming.assignedBy} atribuiu "${incoming.title}" para você.`);
          }
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'doodoo_tarefas' }, (payload) => {
          const updated = mapDbToTask(payload.new);
          setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
        }
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'doodoo_tarefas' }, (payload) => {
          const deletedId = payload.old.id;
          setTasks(prev => prev.filter(t => t.id !== deletedId));
          setSelectedTaskId(prevId => prevId === deletedId ? null : prevId);
        }
      )
      .subscribe();

    const syncInterval = setInterval(async () => {
      const { data } = await supabase.from('doodoo_tarefas').select('*').eq('setor', currentUser.setor).order('created_at', { ascending: false });
      if (data) {
        const mapped = data.map(mapDbToTask);
        setTasks(prev => {
          const pendingTemp = prev.filter(t => t.id.startsWith('temp-'));
          if (pendingTemp.length === 0 && JSON.stringify(prev) === JSON.stringify(mapped)) return prev;
          return [...pendingTemp, ...mapped];
        });
      }
    }, 6000);

    return () => {
      supabase.removeChannel(taskSubscription);
      clearInterval(syncInterval);
    };
  }, [currentUser, notifyBell]);

  const allowedAssignees = useMemo(() => {
    if (!currentUser) return [];
    let visibleUsers: DBProfile[] = [];

    switch (currentUser.cargo) {
      case 'administrador':
      case 'gestor':
      case 'coordenador':
        visibleUsers = teamMembers;
        break;
      case 'supervisor':
      case 'analista':
        visibleUsers = teamMembers.filter(u => ['administrador', 'gestor', 'coordenador', 'supervisor', 'analista'].includes(u.cargo) || u.id === currentUser.id);
        break;
      default:
        visibleUsers = teamMembers.filter(u => u.id === currentUser.id);
    }

    return visibleUsers.map(u => {
      let label = u.nome;
      if (u.id === currentUser.id) label = `${u.nome} (Minha Fila)`;
      else if (['administrador', 'gestor', 'coordenador'].includes(u.cargo)) label = `${u.nome} (Gestão)`;
      else {
        const cargoFormatado = u.cargo.charAt(0).toUpperCase() + u.cargo.slice(1);
        label = `${u.nome} (${cargoFormatado})`;
      }
      return { label, value: u.nome };
    });
  }, [currentUser, teamMembers]);

  const visibleTasks = useMemo(() => {
    if (!currentUser) return [];
    
    return tasks.filter(task => {
      if (task.sector !== currentUser.setor) return false;

      const isChefia = ['administrador', 'gestor', 'coordenador'].includes(currentUser.cargo);
      if (!isChefia) {
        const isMine = task.assignee === currentUser.nome;
        const requestedByMe = task.assignedBy === currentUser.nome;
        if (!isMine && !requestedByMe) return false;
      }

      if (selectedPersonFilter !== 'todos' && task.assignee !== selectedPersonFilter) return false;

      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        return (
          task.title.toLowerCase().includes(q) ||
          task.description.toLowerCase().includes(q) ||
          task.category.toLowerCase().includes(q) ||
          task.assignee.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [tasks, currentUser, selectedPersonFilter, searchQuery]);

  const filteredTasks = useMemo(() => {
    return visibleTasks.filter(t => {
      if (smartList === 'concluidas') return t.status === 'concluida';
      if (t.status === 'concluida') return false;
      if (smartList === 'meu-dia') return t.myDay;
      if (smartList === 'importante') return t.important || t.priority === 'Urgente';
      if (smartList === 'rotinas') return t.isRoutine;
      return true;
    });
  }, [visibleTasks, smartList]);

  const selectedTask = useMemo(() => tasks.find(t => t.id === selectedTaskId) || null, [tasks, selectedTaskId]);

  // 🚀 3. PROTEÇÃO DE REFERÊNCIA NULA (Garante que o elemento existe antes de fazer scroll)
  useEffect(() => {
    if (selectedTask && taskChatEndRef.current) {
      setTimeout(() => {
        taskChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [selectedTask?.id, selectedTask?.chat.length]);

  const openCreateModal = () => {
    setNewTitle('');
    setNewDesc('');
    setNewCategory(TASK_CATEGORIES[0]);
    setNewPriority('Normal');
    setNewIsRoutine(smartList === 'rotinas');
    setNewAssignee(currentUser?.nome || '');
    setNewDate(getLocalTodayISO());
    setNewTime('17:00');
    setNewSteps([]);
    setTempStepInput('');
    setIsCreateModalOpen(true);
  };

  const handleAddTempStep = () => {
    if (!tempStepInput.trim()) return;
    setNewSteps(prev => [...prev, tempStepInput.trim()]);
    setTempStepInput('');
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !currentUser) return;

    const target = newAssignee || currentUser.nome;
    const formattedDate = newDate ? newDate.split('-').reverse().join('/') : getLocalTodayISO().split('-').reverse().join('/');
    const stepsPayload = newSteps.map((s, idx) => ({ id: Date.now() + idx, text: s, done: false }));
    const isUrgent = newPriority === 'Urgente';

    const tempId = `temp-${Date.now()}`;
    const optimisticTask: TaskItem = {
      id: tempId, title: newTitle.trim(), description: newDesc.trim() || 'Sem observações adicionais.',
      category: newCategory, priority: newPriority, status: 'pendente', important: isUrgent,
      myDay: true, isRoutine: newIsRoutine, assignee: target, sector: currentUser.setor,
      assignedBy: currentUser.nome, dueDate: formattedDate, dueTime: newTime, steps: stepsPayload, chat: []
    };

    setTasks(prev => [optimisticTask, ...prev]);
    setSelectedTaskId(tempId);
    setIsCreateModalOpen(false);

    const { data, error } = await supabase.from('doodoo_tarefas').insert([{
        usuario_id: currentUser.user_id, titulo: optimisticTask.title, descricao: optimisticTask.description,
        categoria: optimisticTask.category, prioridade: optimisticTask.priority, status: 'pendente',
        importante: optimisticTask.important, meu_dia: true, rotina: optimisticTask.isRoutine,
        responsavel: target, setor: currentUser.setor, atribuido_por: currentUser.nome,
        data_limite: formattedDate, hora_limite: newTime, etapas: stepsPayload, chat: []
      }]).select().single();

    if (data && !error) {
      const realTask = mapDbToTask(data);
      setTasks(prev => {
        if (prev.some(t => t.id === realTask.id)) return prev.filter(t => t.id !== tempId);
        return prev.map(t => t.id === tempId ? realTask : t);
      });
      setSelectedTaskId(prev => prev === tempId ? realTask.id : prev);
      if (target !== currentUser.nome) notifyBell('Nova Demanda Atribuída', `${currentUser.nome} atribuiu "${realTask.title}" para ${target}.`);
      else notifyBell('Tarefa Criada', `"${realTask.title}" foi adicionada à sua fila.`);
    } else {
      setTasks(prev => prev.filter(t => t.id !== tempId));
      setSelectedTaskId(null);
      notifyBell('Erro ao Salvar', 'Não foi possível gravar a tarefa no banco.');
    }
  };

  const changeTaskStatus = async (taskId: string, status: 'pendente' | 'andamento' | 'concluida', e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const targetTask = tasks.find(t => t.id === taskId);
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t));
    await supabase.from('doodoo_tarefas').update({ status }).eq('id', taskId);
    if (targetTask) notifyBell('Status Atualizado', `"${targetTask.title}" foi marcada como ${status.toUpperCase()}.`);
  };

  const toggleTaskFlag = async (taskId: string, field: 'important' | 'myDay' | 'isRoutine', e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const newValue = !task[field];
    const dbColumn = field === 'important' ? 'importante' : field === 'myDay' ? 'meu_dia' : 'rotina';
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, [field]: newValue } : t));
    await supabase.from('doodoo_tarefas').update({ [dbColumn]: newValue }).eq('id', taskId);
  };

  const updateTaskMetadata = async (taskId: string, field: 'priority' | 'assignee', value: string) => {
    const dbColumn = field === 'priority' ? 'prioridade' : 'responsavel';
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, [field]: value as any } : t));
    await supabase.from('doodoo_tarefas').update({ [dbColumn]: value }).eq('id', taskId);
    notifyBell('Tarefa Atualizada', `Alteração salva com sucesso.`);
  };

  const toggleSubStep = async (taskId: string, stepId: number) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const updatedSteps = task.steps.map(s => s.id === stepId ? { ...s, done: !s.done } : s);
    const allDone = updatedSteps.length > 0 && updatedSteps.every(s => s.done);
    const newStatus = allDone ? 'concluida' : updatedSteps.some(s => s.done) ? 'andamento' : 'pendente';
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, steps: updatedSteps, status: newStatus } : t));
    await supabase.from('doodoo_tarefas').update({ etapas: updatedSteps, status: newStatus }).eq('id', taskId);
  };

  const handleAddStep = async (taskId: string) => {
    if (!stepInput.trim()) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const updatedSteps = [...task.steps, { id: Date.now(), text: stepInput.trim(), done: false }];
    setStepInput('');
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, steps: updatedSteps } : t));
    await supabase.from('doodoo_tarefas').update({ etapas: updatedSteps }).eq('id', taskId);
  };

  const handleDeleteStep = async (taskId: string, stepId: number) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const updatedSteps = task.steps.filter(s => s.id !== stepId);
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, steps: updatedSteps } : t));
    await supabase.from('doodoo_tarefas').update({ etapas: updatedSteps }).eq('id', taskId);
  };

  const handleSendChat = async (taskId: string) => {
    if (!chatInput.trim() || !currentUser || !isMounted) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const msg: ChatComment = { id: Date.now(), author: currentUser.nome, text: chatInput.trim(), time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), isAlert: isDifficultyAlert };
    const newChat = [...task.chat, msg];
    setChatInput(''); setIsDifficultyAlert(false);
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, chat: newChat } : t));
    await supabase.from('doodoo_tarefas').update({ chat: newChat }).eq('id', taskId);
  };

  const handleSendReminder = async (task: TaskItem) => {
    if (!currentUser || !isMounted) return;
    const reminder: ChatComment = { id: Date.now(), author: currentUser.nome, text: `🔔 Solicitou posicionamento / atualização de status para ${task.assignee}.`, time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), isAlert: true };
    const newChat = [...task.chat, reminder];
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, chat: newChat } : t));
    await supabase.from('doodoo_tarefas').update({ chat: newChat }).eq('id', task.id);
    notifyBell('⚠️ Cobrança Enviada', `Solicitação de status registrada na tarefa de ${task.assignee}.`);
  };

  const confirmDeleteTask = (id: string, title: string) => {
    setConfirmModal({
      isOpen: true, title: 'Excluir Tarefa', message: `Tem certeza que deseja excluir permanentemente a tarefa "${title}"? Todos os checklists e o histórico serão apagados.`,
      onConfirm: async () => {
        setTasks(prev => prev.filter(t => t.id !== id));
        setSelectedTaskId(null);
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        await supabase.from('doodoo_tarefas').delete().eq('id', id);
        notifyBell('Tarefa Excluída', 'A demanda foi removida com sucesso.');
      }
    });
  };

  if (isLoading || !isMounted) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin opacity-50 text-blue-500" />
        <span className="text-xs font-bold opacity-50 mt-2">Sincronizando Fila de Tarefas...</span>
      </div>
    );
  }

  if (authError || !currentUser) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center space-y-5 animate-in fade-in zoom-in-95 duration-300">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center"><AlertTriangle className="w-10 h-10 text-red-500 opacity-80" /></div>
        <div className="text-center space-y-1.5">
          <h3 className="text-xl font-extrabold tracking-tight">Sessão Expirada</h3>
          <p className="text-xs font-medium opacity-60 max-w-sm mx-auto leading-relaxed">Não foi possível validar sua sessão. Por favor, autentique-se novamente.</p>
        </div>
        <button onClick={handleForceLogout} className="mt-2 px-6 py-3 rounded-2xl bg-brand-panel text-white text-xs font-extrabold cursor-pointer flex items-center space-x-2 shadow-lg">
          <LogOut className="w-4 h-4" /><span>Sair e Entrar Novamente</span>
        </button>
      </div>
    );
  }

  const isManagerView = ['administrador', 'gestor', 'coordenador'].includes(currentUser.cargo);

  return (
    <div className="w-full h-full flex flex-col animate-in fade-in duration-300">
      
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 rounded-[2.5rem] border overflow-hidden shadow-2xl backdrop-blur-xl" 
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
        
        {/* COLUNA 1: MENU DE LISTAS INTELIGENTES */}
        <div className="lg:col-span-3 border-r p-5 flex flex-col justify-between" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
          <div className="space-y-4">
            
            <div className="space-y-3 pb-4 border-b" style={{ borderColor: 'var(--border-input)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-sm tracking-tight">Tarefas & Rotinas</h3>
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">Setor {currentUser.setor}</p>
                </div>

                <div className="flex items-center px-2 py-1 rounded-xl border shadow-sm" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
                  <Palette className="w-3.5 h-3.5 mr-1.5 opacity-40 flex-shrink-0" />
                  <div className="flex items-center space-x-1">
                    {themes.map((t) => {
                      const isSelected = theme === t.id;
                      return (
                        <button
                          key={t.id}
                          onClick={() => changeTheme(t.id)}
                          style={{ 
                            width: '10px', height: '10px',
                            backgroundColor: t.color, borderColor: t.border,
                            boxShadow: isSelected ? `0 0 0 2px var(--bg-card), 0 0 0 2.5px ${t.border}` : 'none'
                          }}
                          className={`rounded-full border transition-all duration-300 flex-shrink-0 cursor-pointer ${isSelected ? 'scale-110' : 'opacity-70 hover:opacity-100'}`}
                          title={t.name}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2.5 px-3 py-2 rounded-xl border" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
                <div className="w-7 h-7 rounded-lg bg-brand-panel text-white font-extrabold flex items-center justify-center text-[10px] flex-shrink-0">
                  {getInitials(currentUser.nome)}
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="truncate w-full text-xs font-extrabold leading-tight">{currentUser.nome}</span>
                  <span className="text-[9px] font-bold opacity-50 uppercase tracking-wider">{currentUser.cargo}</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-[10px] font-extrabold uppercase tracking-widest opacity-40 px-2 mb-1">Listas Inteligentes</p>
              
              <button 
                onClick={() => setSmartList('meu-dia')}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${smartList === 'meu-dia' ? 'bg-brand-panel text-white shadow-xs' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-75'}`}
              >
                <div className="flex items-center space-x-2.5">
                  <Sun className={`w-4 h-4 ${smartList === 'meu-dia' ? 'text-white' : 'text-amber-500'}`} />
                  <span>Meu Dia</span>
                </div>
                <span className="text-[11px] font-extrabold">{visibleTasks.filter(t => t.myDay && t.status !== 'concluida').length}</span>
              </button>

              <button 
                onClick={() => setSmartList('todas')}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${smartList === 'todas' ? 'bg-brand-panel text-white shadow-xs' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-75'}`}
              >
                <div className="flex items-center space-x-2.5">
                  <CheckSquare className="w-4 h-4" />
                  <span>Todas em Aberto</span>
                </div>
                <span className="text-[11px] font-extrabold">{visibleTasks.filter(t => t.status !== 'concluida').length}</span>
              </button>

              <button 
                onClick={() => setSmartList('importante')}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${smartList === 'importante' ? 'bg-brand-panel text-white shadow-xs' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-75'}`}
              >
                <div className="flex items-center space-x-2.5">
                  <Star className={`w-4 h-4 ${smartList === 'importante' ? 'text-white' : 'text-amber-400'}`} />
                  <span>Importantes & Urgentes</span>
                </div>
                <span className="text-[11px] font-extrabold">{visibleTasks.filter(t => (t.important || t.priority === 'Urgente') && t.status !== 'concluida').length}</span>
              </button>

              <button 
                onClick={() => setSmartList('rotinas')}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${smartList === 'rotinas' ? 'bg-brand-panel text-white shadow-xs' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-75'}`}
              >
                <div className="flex items-center space-x-2.5">
                  <Repeat className={`w-4 h-4 ${smartList === 'rotinas' ? 'text-white' : 'text-blue-500'}`} />
                  <span>Rotinas do Setor</span>
                </div>
                <span className="text-[11px] font-extrabold">{visibleTasks.filter(t => t.isRoutine && t.status !== 'concluida').length}</span>
              </button>

              <button 
                onClick={() => setSmartList('concluidas')}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${smartList === 'concluidas' ? 'bg-brand-panel text-white shadow-xs' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-75'}`}
              >
                <div className="flex items-center space-x-2.5">
                  <CheckCircle2 className={`w-4 h-4 ${smartList === 'concluidas' ? 'text-white' : 'text-emerald-500'}`} />
                  <span>Concluídas</span>
                </div>
                <span className="text-[11px] font-extrabold">{visibleTasks.filter(t => t.status === 'concluida').length}</span>
              </button>
            </div>
          </div>

          {isManagerView && (
            <div className="pt-3 border-t space-y-1.5" style={{ borderColor: 'var(--border-input)' }}>
              <label className="text-[10px] font-bold uppercase tracking-wider opacity-50 block px-1">
                 Auditar Fila por Colaborador
              </label>
              <select 
                value={selectedPersonFilter}
                onChange={(e) => setSelectedPersonFilter(e.target.value)}
                className="w-full p-2.5 rounded-xl border text-xs font-semibold outline-none cursor-pointer"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
              >
                <option value="todos">Toda a equipe ({currentUser.setor})</option>
                {teamMembers.map(m => (
                  <option key={m.user_id} value={m.nome}>{m.nome} ({m.cargo})</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* COLUNA 2: LISTA CENTRAL DE TAREFAS */}
        <div className={`${selectedTask ? 'lg:col-span-5 border-r' : 'lg:col-span-9'} flex flex-col h-full overflow-hidden`} style={{ borderColor: 'var(--border-input)' }}>
          <div className="p-4 border-b flex items-center justify-between gap-3" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-card)' }}>
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-40" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pesquisar por título, categoria ou responsável..."
                className="w-full pl-9 pr-4 py-2 rounded-xl border text-xs font-medium outline-none focus:border-blue-500"
                style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
              />
            </div>
            <button 
              onClick={openCreateModal}
              className="px-4 py-2 rounded-xl bg-brand-panel text-white text-xs font-extrabold shadow-sm hover:opacity-95 transition-all flex items-center space-x-1.5 cursor-pointer flex-shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Tarefa</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2.5 custom-scrollbar" style={{ backgroundColor: 'var(--bg-input)' }}>
            {filteredTasks.map(task => {
              const isSelected = selectedTask?.id === task.id;
              const isDone = task.status === 'concluida';
              const doneSteps = task.steps.filter(s => s.done).length;
              const overdue = isTaskOverdue(task.dueDate, task.dueTime, task.status);

              return (
                <div 
                  key={task.id}
                  onClick={() => setSelectedTaskId(task.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected ? 'ring-2 ring-blue-500/50 shadow-sm' : 'hover:opacity-95'
                  }`}
                  style={{ 
                    backgroundColor: isSelected ? 'var(--bg-input)' : 'var(--bg-card)', 
                    borderColor: overdue ? 'rgba(239, 68, 68, 0.4)' : 'var(--border-input)' 
                  }}
                >
                  <div className="flex items-start space-x-3 overflow-hidden w-full">
                    {/* Checkbox Rápido Estilo Microsoft To-Do */}
                    <button
                      type="button"
                      onClick={(e) => changeTaskStatus(task.id, isDone ? 'pendente' : 'concluida', e)}
                      className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all cursor-pointer ${
                        isDone ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-400 hover:border-blue-500'
                      }`}
                      title={isDone ? 'Reabrir tarefa' : 'Concluir tarefa'}
                    >
                      {isDone && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </button>

                    <div className="overflow-hidden flex-1">
                      <div className="flex items-center space-x-2">
                        {task.priority === 'Urgente' && !isDone && (
                          <span className="px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-500 text-[9px] font-extrabold uppercase flex items-center space-x-0.5 flex-shrink-0">
                            <Flame className="w-2.5 h-2.5 mr-0.5" /> Urgente
                          </span>
                        )}
                        {overdue && (
                          <span className="px-1.5 py-0.5 rounded-md bg-red-500 text-white text-[9px] font-extrabold uppercase flex-shrink-0">
                            Atrasada
                          </span>
                        )}
                        {task.isRoutine && (
                          <span className="px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-500 text-[9px] font-extrabold uppercase flex-shrink-0">
                            🔁 Rotina
                          </span>
                        )}
                        <p className={`text-xs font-extrabold leading-snug truncate ${isDone ? 'line-through opacity-45' : ''}`}>
                          {task.title}
                        </p>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] opacity-60 font-medium">
                        <span className="font-extrabold text-blue-500">{task.assignee === currentUser.nome ? 'Minha Fila' : task.assignee}</span>
                        <span>•</span>
                        <span className="px-1.5 py-0.2 rounded border text-[10px]" style={{ borderColor: 'var(--border-input)' }}>{task.category}</span>
                        <span>•</span>
                        <span className={overdue ? 'text-red-500 font-bold' : ''}>📅 {task.dueDate} às {task.dueTime}</span>
                        {task.steps.length > 0 && (
                          <>
                            <span>•</span>
                            <span className="font-bold">{doneSteps}/{task.steps.length} etapas</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Ações Rápidas do Card (Estrela + Status) */}
                  <div className="flex items-center space-x-2 flex-shrink-0">
                    {task.status === 'andamento' && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/20">
                        Em andamento
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => toggleTaskFlag(task.id, 'important', e)}
                      className="p-1.5 rounded-lg hover:bg-black/5 cursor-pointer transition-transform hover:scale-110"
                      title={task.important ? 'Remover dos importantes' : 'Marcar como importante'}
                    >
                      <Star className={`w-4 h-4 ${task.important ? 'fill-amber-400 text-amber-400' : 'opacity-30'}`} />
                    </button>
                    <ChevronRight className="w-4 h-4 opacity-30" />
                  </div>
                </div>
              );
            })}

            {filteredTasks.length === 0 && (
              <div className="h-60 flex flex-col items-center justify-center text-center opacity-40 space-y-2">
                <CheckCircle2 className="w-8 h-8 stroke-1" />
                <p className="text-xs font-semibold">Nenhuma tarefa encontrada nesta visualização.</p>
              </div>
            )}
          </div>
        </div>

        {/* COLUNA 3: PAINEL LATERAL DE DETALHES & GESTÃO DA TAREFA */}
        {selectedTask && (
          <div className="lg:col-span-4 flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-200" style={{ backgroundColor: 'var(--bg-card)' }}>
            
            <div className="p-5 border-b flex items-start justify-between gap-3" style={{ borderColor: 'var(--border-input)' }}>
              <div className="overflow-hidden">
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-45">
                    Criado por: {selectedTask.assignedBy}
                  </span>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-500 flex items-center space-x-1">
                    <Tag className="w-3 h-3" />
                    <span>{selectedTask.category}</span>
                  </span>
                </div>
                <h3 className="text-sm font-extrabold leading-snug mt-1 break-words">
                  {selectedTask.title}
                </h3>
              </div>
              <button 
                onClick={() => setSelectedTaskId(null)} 
                className="p-1.5 rounded-xl hover:bg-black/5 opacity-50 hover:opacity-100 cursor-pointer flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
              
              {/* Botões Rápidos de Organização (Meu Dia / Importante / Rotina) */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => toggleTaskFlag(selectedTask.id, 'myDay')}
                  className={`py-2 px-2 rounded-xl border text-[11px] font-bold flex items-center justify-center space-x-1.5 cursor-pointer transition-all ${
                    selectedTask.myDay ? 'bg-amber-500/10 text-amber-500 border-amber-500/30' : 'opacity-60 hover:opacity-100'
                  }`}
                  style={!selectedTask.myDay ? { backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' } : undefined}
                >
                  <Sun className="w-3.5 h-3.5" />
                  <span>Meu Dia</span>
                </button>

                <button
                  type="button"
                  onClick={() => toggleTaskFlag(selectedTask.id, 'important')}
                  className={`py-2 px-2 rounded-xl border text-[11px] font-bold flex items-center justify-center space-x-1.5 cursor-pointer transition-all ${
                    selectedTask.important ? 'bg-amber-500/10 text-amber-500 border-amber-500/30' : 'opacity-60 hover:opacity-100'
                  }`}
                  style={!selectedTask.important ? { backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' } : undefined}
                >
                  <Star className={`w-3.5 h-3.5 ${selectedTask.important ? 'fill-amber-400' : ''}`} />
                  <span>Destacar</span>
                </button>

                <button
                  type="button"
                  onClick={() => toggleTaskFlag(selectedTask.id, 'isRoutine')}
                  className={`py-2 px-2 rounded-xl border text-[11px] font-bold flex items-center justify-center space-x-1.5 cursor-pointer transition-all ${
                    selectedTask.isRoutine ? 'bg-blue-500/10 text-blue-500 border-blue-500/30' : 'opacity-60 hover:opacity-100'
                  }`}
                  style={!selectedTask.isRoutine ? { backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' } : undefined}
                >
                  <Repeat className="w-3.5 h-3.5" />
                  <span>Rotina</span>
                </button>
              </div>

              {/* Controles de Status, Prioridade e Responsável */}
              <div className="grid grid-cols-2 gap-2.5 p-3.5 rounded-2xl border" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                <div>
                  <span className="text-[10px] font-semibold opacity-50 block mb-1">Status</span>
                  <select 
                    value={selectedTask.status}
                    onChange={(e) => changeTaskStatus(selectedTask.id, e.target.value as any)}
                    className="w-full p-2 rounded-xl border text-xs font-bold outline-none cursor-pointer"
                    style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                  >
                    <option value="pendente">⏳ Pendente</option>
                    <option value="andamento">▶️ Em andamento</option>
                    <option value="concluida">✅ Concluída</option>
                  </select>
                </div>

                <div>
                  <span className="text-[10px] font-semibold opacity-50 block mb-1">Prioridade</span>
                  <select 
                    value={selectedTask.priority}
                    onChange={(e) => updateTaskMetadata(selectedTask.id, 'priority', e.target.value)}
                    className="w-full p-2 rounded-xl border text-xs font-bold outline-none cursor-pointer"
                    style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                  >
                    <option value="Normal">Normal</option>
                    <option value="Urgente">🔥 Urgente</option>
                  </select>
                </div>

                <div className="col-span-2 pt-1">
                  <span className="text-[10px] font-semibold opacity-50 block mb-1">Responsável pela Execução</span>
                  {isManagerView ? (
                    <select
                      value={selectedTask.assignee}
                      onChange={(e) => updateTaskMetadata(selectedTask.id, 'assignee', e.target.value)}
                      className="w-full p-2 rounded-xl border text-xs font-bold text-blue-500 outline-none cursor-pointer"
                      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}
                    >
                      {allowedAssignees.map(a => (
                        <option key={a.value} value={a.value}>{a.label}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="p-2 rounded-xl border text-xs font-bold text-blue-500 truncate" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
                      {selectedTask.assignee === currentUser.nome ? `${currentUser.nome} (Minha Fila)` : selectedTask.assignee}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <span className="text-[11px] font-bold opacity-50 block mb-1">Instruções / Observações</span>
                <p className="text-xs opacity-80 leading-relaxed whitespace-pre-wrap p-3 rounded-2xl border" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                  {selectedTask.description}
                </p>
              </div>

              {isManagerView && selectedTask.assignee !== currentUser.nome && (
                <button 
                  onClick={() => handleSendReminder(selectedTask)}
                  className="w-full py-2.5 px-3 rounded-xl border border-amber-500/30 text-amber-500 bg-amber-500/5 text-xs font-extrabold flex items-center justify-center space-x-2 hover:bg-amber-500/10 transition-colors cursor-pointer"
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span>Cobrar Posicionamento / Status</span>
                </button>
              )}

              {/* CHECKLIST COM BARRA DE PROGRESSO E EXCLUSÃO */}
              <div className="space-y-2.5 pt-3 border-t" style={{ borderColor: 'var(--border-input)' }}>
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="opacity-70">Checklist de Execução</span>
                  <span className="opacity-60">{selectedTask.steps.filter(s => s.done).length}/{selectedTask.steps.length}</span>
                </div>

                {selectedTask.steps.length > 0 && (
                  <div className="w-full h-1.5 rounded-full overflow-hidden bg-black/10 dark:bg-white/10">
                    <div 
                      className="h-full bg-emerald-500 transition-all duration-300" 
                      style={{ width: `${Math.round((selectedTask.steps.filter(s => s.done).length / selectedTask.steps.length) * 100)}%` }}
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  {selectedTask.steps.map(step => (
                    <div 
                      key={step.id} 
                      className="group flex items-center justify-between p-2.5 rounded-xl border text-xs"
                      style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}
                    >
                      <label className="flex items-center space-x-2.5 cursor-pointer flex-1 overflow-hidden">
                        <input 
                          type="checkbox" 
                          checked={step.done}
                          onChange={() => toggleSubStep(selectedTask.id, step.id)}
                          className="w-4 h-4 rounded accent-blue-600 cursor-pointer flex-shrink-0"
                        />
                        <span className={`break-words ${step.done ? 'line-through opacity-45' : 'font-medium'}`}>{step.text}</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => handleDeleteStep(selectedTask.id, step.id)}
                        className="opacity-0 group-hover:opacity-100 text-red-500 p-1 hover:scale-110 transition-all cursor-pointer ml-2"
                        title="Remover etapa"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex items-center space-x-2">
                  <input 
                    type="text" 
                    value={stepInput}
                    onChange={(e) => setStepInput(e.target.value)}
                    placeholder="Adicionar nova etapa..."
                    className="flex-1 px-3 py-2 rounded-xl border text-xs outline-none focus:border-blue-500"
                    style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddStep(selectedTask.id); } }}
                  />
                  <button 
                    type="button"
                    onClick={() => handleAddStep(selectedTask.id)}
                    className="px-3.5 py-2 rounded-xl bg-brand-panel text-white text-xs font-extrabold cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* MINI-CHAT DE ANDAMENTO E BLOQUEIOS */}
              <div className="space-y-2.5 pt-3 border-t" style={{ borderColor: 'var(--border-input)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold opacity-70">Diário de Bordo & Bloqueios</span>
                  <label className="flex items-center space-x-1.5 text-[11px] font-bold cursor-pointer text-amber-500">
                    <input 
                      type="checkbox" 
                      checked={isDifficultyAlert}
                      onChange={(e) => setIsDifficultyAlert(e.target.checked)}
                      className="rounded accent-amber-500 cursor-pointer"
                    />
                    <span>Sinalizar bloqueio</span>
                  </label>
                </div>

                <div className="space-y-2 max-h-44 overflow-y-auto custom-scrollbar pr-1">
                  {selectedTask.chat.map(c => (
                    <div 
                      key={c.id} 
                      className={`p-2.5 rounded-xl border text-xs space-y-0.5 ${c.isAlert ? 'border-amber-500/40 bg-amber-500/5' : ''}`}
                      style={!c.isAlert ? { backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' } : undefined}
                    >
                      <div className="flex justify-between text-[10px] opacity-65 font-bold">
                        <span className={c.isAlert ? 'text-amber-500' : ''}>{c.author} {c.isAlert ? '• ⚠️ Alerta' : ''}</span>
                        <span>{c.time}</span>
                      </div>
                      <p className="leading-relaxed break-words">{c.text}</p>
                    </div>
                  ))}
                  {selectedTask.chat.length === 0 && (
                    <p className="text-[11px] opacity-40 py-2 text-center">Nenhuma atualização registrada nesta tarefa.</p>
                  )}
                  <div ref={taskChatEndRef} />
                </div>

                <div className="flex items-center space-x-2">
                  <input 
                    type="text" 
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={isDifficultyAlert ? 'Descreva o impedimento técnico...' : 'Registrar andamento...'}
                    className="flex-1 px-3 py-2 rounded-xl border text-xs outline-none focus:border-blue-500"
                    style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSendChat(selectedTask.id); } }}
                  />
                  <button 
                    type="button"
                    onClick={() => handleSendChat(selectedTask.id)}
                    className="p-2.5 rounded-xl bg-brand-panel text-white cursor-pointer hover:opacity-90"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

            </div>

            <div className="p-4 border-t flex items-center justify-between text-xs" style={{ borderColor: 'var(--border-input)' }}>
              <span className="opacity-55 text-[11px] font-semibold">Prazo: {selectedTask.dueDate} às {selectedTask.dueTime}</span>
              <button 
                onClick={() => confirmDeleteTask(selectedTask.id, selectedTask.title)}
                className="text-red-500 hover:underline font-bold flex items-center space-x-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir Tarefa</span>
              </button>
            </div>

          </div>
        )}
      </div>

      {/* MODAL: NOVA TAREFA COMPLETO */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-3xl border shadow-xl overflow-hidden max-h-[90vh] flex flex-col" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-input)' }}>
              <h3 className="font-extrabold text-base">Nova Demanda ({currentUser?.setor})</h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="p-1.5 rounded-lg hover:bg-black/5 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
              <div>
                <label className="text-xs font-bold opacity-60 block mb-1">Título da Demanda *</label>
                <input 
                  type="text" 
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ex: Verificar link dedicado / Atualizar servidor..."
                  className="w-full px-3.5 py-2.5 rounded-xl border text-xs font-semibold outline-none focus:border-blue-500"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold opacity-60 block mb-1">Categoria</label>
                  <select 
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border text-xs font-semibold outline-none cursor-pointer focus:border-blue-500"
                    style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                  >
                    {TASK_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold opacity-60 block mb-1">Nível de Prioridade</label>
                  <select 
                    value={newPriority}
                    onChange={(e: any) => setNewPriority(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border text-xs font-bold outline-none cursor-pointer focus:border-blue-500"
                    style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                  >
                    <option value="Normal">Normal</option>
                    <option value="Urgente">🔥 Urgente (Alta Prioridade)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold opacity-60 block mb-1">Instruções / Detalhes</label>
                <textarea 
                  rows={2}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Contexto técnico ou observações..."
                  className="w-full px-3.5 py-2.5 rounded-xl border text-xs outline-none resize-none focus:border-blue-500"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold opacity-60 block mb-1">Responsável</label>
                  <select 
                    value={newAssignee}
                    onChange={(e) => setNewAssignee(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border text-xs font-semibold outline-none cursor-pointer focus:border-blue-500"
                    style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                  >
                    {allowedAssignees.map(a => (
                      <option key={a.value} value={a.value}>{a.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold opacity-60 block mb-1">Data Limite</label>
                  <input 
                    type="date" 
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border text-xs font-semibold outline-none focus:border-blue-500"
                    style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold opacity-60 block mb-1">Horário</label>
                  <input 
                    type="time" 
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border text-xs font-semibold outline-none focus:border-blue-500"
                    style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                  />
                </div>
              </div>

              <label className="flex items-center justify-between p-3 rounded-xl border cursor-pointer" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                <div className="flex items-center space-x-2">
                  <Repeat className="w-4 h-4 text-blue-500" />
                  <div>
                    <span className="text-xs font-bold block">Classificar como Rotina do Setor</span>
                    <span className="text-[10px] opacity-60">Ficará acessível na lista inteligente de Rotinas.</span>
                  </div>
                </div>
                <input 
                  type="checkbox" 
                  checked={newIsRoutine} 
                  onChange={(e) => setNewIsRoutine(e.target.checked)} 
                  className="w-4 h-4 rounded accent-blue-600 cursor-pointer" 
                />
              </label>

              <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border-input)' }}>
                <label className="text-xs font-bold opacity-60 block">Checklist / Etapas Iniciais ({newSteps.length})</label>
                
                {newSteps.length > 0 && (
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {newSteps.map((st, i) => (
                      <div key={i} className="text-xs px-3 py-1.5 rounded-lg border flex justify-between items-center" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                        <span>{i + 1}. {st}</span>
                        <button type="button" onClick={() => setNewSteps(prev => prev.filter((_, idx) => idx !== i))} className="opacity-50 hover:opacity-100 cursor-pointer">✕</button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex space-x-2">
                  <input 
                    type="text" 
                    value={tempStepInput}
                    onChange={(e) => setTempStepInput(e.target.value)}
                    placeholder="Digitar sub-etapa e apertar Enter..."
                    className="flex-1 px-3 py-2 rounded-xl border text-xs outline-none focus:border-blue-500"
                    style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTempStep();
                      }
                    }}
                  />
                  <button 
                    type="button"
                    onClick={handleAddTempStep}
                    className="px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer hover:opacity-80"
                    style={{ borderColor: 'var(--border-input)' }}
                  >
                    + Etapa
                  </button>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t" style={{ borderColor: 'var(--border-input)' }}>
                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="px-4 py-2 rounded-xl border text-xs font-bold cursor-pointer hover:opacity-80" style={{ borderColor: 'var(--border-input)' }}>
                  Cancelar
                </button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-brand-panel text-white text-xs font-bold cursor-pointer hover:opacity-90">
                  Salvar Tarefa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO PARA EXCLUSÃO */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-full max-w-sm rounded-3xl border shadow-2xl overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-input)' }}>
              <div className="flex items-center space-x-2 text-red-500">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="font-extrabold text-sm">{confirmModal.title}</h3>
              </div>
              <button 
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} 
                className="p-1.5 rounded-lg hover:bg-black/5 cursor-pointer opacity-50 hover:opacity-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-6">
              <p className="text-xs font-semibold opacity-80 leading-relaxed">
                {confirmModal.message}
              </p>
            </div>
            
            <div className="flex justify-end space-x-2 px-6 py-4 border-t" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-input)' }}>
              <button 
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} 
                className="px-4 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-colors hover:opacity-80" 
                style={{ borderColor: 'var(--border-input)' }}
              >
                Cancelar
              </button>
              <button 
                onClick={confirmModal.onConfirm} 
                className="px-5 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-bold cursor-pointer transition-colors shadow-sm"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}