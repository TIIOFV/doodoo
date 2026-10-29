'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { 
  CheckSquare, Plus, Trash2, Bell, Send, Sun, 
  X, Star, Search, Repeat, Shield, 
  CheckCircle2, AlertTriangle, ChevronRight, Palette, Loader2, LogOut, Clock, Flame, Tag, Edit2
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
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
  note?: string;
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
  status: 'pendente' | 'andamento' | 'bloqueado' | 'concluida';
  important: boolean;
  myDay: boolean;
  isRoutine: boolean;
  assignee: string;
  sector: string;
  assignedBy: string;
  dueDate: string; 
  dueTime: string; 
  steps: SubStep[];
  chat: ChatComment[];
}

interface TaskCategory {
  id: string;
  nome: string;
  cor: string;
}

const getInitials = (name: string) => {
  if (!name) return '..';
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

const getLocalTodayISO = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return (new Date(now.getTime() - offset)).toISOString().split('T')[0];
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

export default function TarefasPage() {
  const { theme, changeTheme } = useTheme();

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

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
  const [taskCategories, setTaskCategories] = useState<TaskCategory[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(false);

  const [smartList, setSmartList] = useState<'meu-dia' | 'todas' | 'importante' | 'rotinas' | 'concluidas'>('meu-dia');
  const [selectedPersonFilter, setSelectedPersonFilter] = useState<string>('minha_fila');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const [isEditingTask, setIsEditingTask] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState('Geral');
  const [newPriority, setNewPriority] = useState<'Normal' | 'Urgente'>('Normal');
  const [newIsRoutine, setNewIsRoutine] = useState(false);
  const [newAssignee, setNewAssignee] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('17:00');
  
  const [newSteps, setNewSteps] = useState<{text: string; note: string}[]>([]);
  const [newStepText, setNewStepText] = useState('');
  const [newStepNote, setNewStepNote] = useState('');

  const [stepInput, setStepInput] = useState('');
  const [stepNoteInput, setStepNoteInput] = useState('');
  const [editingStepId, setEditingStepId] = useState<number | null>(null);
  const [editStepText, setEditStepText] = useState('');
  const [editStepNote, setEditStepNote] = useState('');

  const [chatInput, setChatInput] = useState('');
  const [isDifficultyAlert, setIsDifficultyAlert] = useState(false);
  const taskChatEndRef = useRef<HTMLDivElement>(null);

  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const notifyBell = useCallback((title: string, desc: string) => {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('doodoo:notify', { detail: { title, desc } }));
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
          
          const [equipeRes, tarefasRes, categoriasRes] = await Promise.all([
            supabase.from('doodoo_perfis').select('*').eq('setor', perfilAtual.setor).eq('status', 'ativo'),
            supabase.from('doodoo_tarefas').select('*').eq('setor', perfilAtual.setor).order('created_at', { ascending: false }),
            supabase.from('doodoo_tarefas_categorias').select('*').order('created_at', { ascending: true }) 
          ]);

          if (equipeRes.data) setTeamMembers(equipeRes.data as DBProfile[]);
          if (tarefasRes.data) setTasks(tarefasRes.data.map(mapDbToTask));
          if (categoriasRes.data && categoriasRes.data.length > 0) {
            setTaskCategories(categoriasRes.data);
            setNewCategory(categoriasRes.data[0].nome);
          } else {
            setTaskCategories([{ id: '1', nome: 'Geral', cor: '#3B82F6' }]);
          }
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
              const clone = [...prev]; clone[tempIdx] = incoming; return clone;
            }
            return [incoming, ...prev];
          });
          if (incoming.assignee === currentUser.nome && incoming.assignedBy !== currentUser.nome) {
            notifyBell('📋 Nova Tarefa', `${incoming.assignedBy} atribuiu "${incoming.title}" para você.`);
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

    return () => { supabase.removeChannel(taskSubscription); clearInterval(syncInterval); };
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
      case 'colaborador':
        visibleUsers = teamMembers.filter(u => ['administrador', 'gestor', 'coordenador'].includes(u.cargo) || u.id === currentUser.id); 
        break;
      default: 
        visibleUsers = teamMembers.filter(u => u.id === currentUser.id);
    }

    return visibleUsers.map(u => {
      let label = u.nome;
      if (u.id === currentUser.id) label = `${u.nome} (Minha Fila)`;
      else if (['administrador', 'gestor', 'coordenador'].includes(u.cargo)) label = `${u.nome} (Gestão)`;
      else { const cargoFormatado = u.cargo.charAt(0).toUpperCase() + u.cargo.slice(1); label = `${u.nome} (${cargoFormatado})`; }
      return { label, value: u.nome };
    });
  }, [currentUser, teamMembers]);

  const auditDropdownOptions = useMemo(() => {
    if (!currentUser) return [];
    let options = teamMembers.filter(m => m.nome !== currentUser.nome);
    if (!['administrador', 'gestor', 'coordenador'].includes(currentUser.cargo)) {
        options = options.filter(m => ['administrador', 'gestor', 'coordenador'].includes(m.cargo));
    }
    return options;
  }, [teamMembers, currentUser]);

  const visibleTasks = useMemo(() => {
    if (!currentUser) return [];
    
    return tasks.filter(task => {
      if (task.sector !== currentUser.setor) return false;
      
      if (selectedPersonFilter === 'minha_fila') {
        if (task.assignee !== currentUser.nome) return false;
      } else {
        if (task.assignee !== selectedPersonFilter) return false;
        const requestedByMe = task.assignedBy === currentUser.nome;
        const isAdmin = currentUser.cargo === 'administrador';
        
        if (!requestedByMe && !isAdmin) return false;
      }
      
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        return ( task.title.toLowerCase().includes(q) || task.description.toLowerCase().includes(q) || task.category.toLowerCase().includes(q) || task.assignee.toLowerCase().includes(q) );
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
  const isManagerView = ['administrador', 'gestor', 'coordenador'].includes(currentUser?.cargo || '');
  
  const canEditTask = selectedTask && currentUser && (selectedTask.assignedBy === currentUser.nome || isManagerView);

  useEffect(() => {
    setIsEditingTask(false);
    setEditingStepId(null);
  }, [selectedTaskId]);

  useEffect(() => {
    if (selectedTask && taskChatEndRef.current) {
      setTimeout(() => { taskChatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, 100);
    }
  }, [selectedTask?.id, selectedTask?.chat.length]);

  const openCreateModal = () => {
    setNewTitle(''); setNewDesc(''); setNewCategory(taskCategories[0]?.nome || 'Geral'); setNewPriority('Normal');
    setNewIsRoutine(smartList === 'rotinas'); setNewAssignee(currentUser?.nome || ''); setNewDate(getLocalTodayISO());
    setNewTime('17:00'); setNewSteps([]); setNewStepText(''); setNewStepNote(''); setIsCreateModalOpen(true);
  };

  const handleAddTempStep = () => { 
    if (!newStepText.trim()) return; 
    setNewSteps(prev => [...prev, { text: newStepText.trim(), note: newStepNote.trim() }]); 
    setNewStepText(''); 
    setNewStepNote(''); 
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !currentUser) return;
    const target = newAssignee || currentUser.nome;
    const formattedDate = newDate ? newDate.split('-').reverse().join('/') : getLocalTodayISO().split('-').reverse().join('/');
    const stepsPayload = newSteps.map((s, idx) => ({ id: Date.now() + idx, text: s.text, note: s.note, done: false }));
    const isUrgent = newPriority === 'Urgente';

    const tempId = `temp-${Date.now()}`;
    const optimisticTask: TaskItem = {
      id: tempId, title: newTitle.trim(), description: newDesc.trim() || 'Sem observações adicionais.', category: newCategory, priority: newPriority, status: 'pendente', important: isUrgent,
      myDay: true, isRoutine: newIsRoutine, assignee: target, sector: currentUser.setor, assignedBy: currentUser.nome, dueDate: formattedDate, dueTime: newTime, steps: stepsPayload, chat: []
    };

    setTasks(prev => [optimisticTask, ...prev]); setSelectedTaskId(tempId); setIsCreateModalOpen(false);

    const { data, error } = await supabase.from('doodoo_tarefas').insert([{
        usuario_id: currentUser.user_id, titulo: optimisticTask.title, descricao: optimisticTask.description, categoria: optimisticTask.category, prioridade: optimisticTask.priority, status: 'pendente',
        importante: optimisticTask.important, meu_dia: true, rotina: optimisticTask.isRoutine, responsavel: target, setor: currentUser.setor, atribuido_por: currentUser.nome,
        data_limite: formattedDate, hora_limite: newTime, etapas: stepsPayload, chat: [], metadata: {}
      }]).select().single();

    if (data && !error) {
      const realTask = mapDbToTask(data);
      setTasks(prev => {
        if (prev.some(t => t.id === realTask.id)) return prev.filter(t => t.id !== tempId);
        return prev.map(t => t.id === tempId ? realTask : t);
      });
      setSelectedTaskId(prev => prev === tempId ? realTask.id : prev);
      if (target !== currentUser.nome) notifyBell('Tarefa Atribuída', `Atribuiu "${realTask.title}" para ${target}.`);
      else notifyBell('Tarefa Criada', `Adicionada à sua fila.`);
    } else {
      setTasks(prev => prev.filter(t => t.id !== tempId)); setSelectedTaskId(null); notifyBell('Erro', 'Não foi possível gravar.');
    }
  };

  const handleSaveTaskInfo = async () => {
    if (!selectedTask || !editTitle.trim()) return;
    const finalTitle = editTitle.trim();
    const finalDesc = editDesc.trim() || 'Sem observações adicionais.';

    setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, title: finalTitle, description: finalDesc } : t));
    setIsEditingTask(false);

    await supabase.from('doodoo_tarefas').update({ 
      titulo: finalTitle, 
      descricao: finalDesc 
    }).eq('id', selectedTask.id);
    
    notifyBell('Tarefa Atualizada', 'Título e descrição salvos com sucesso.');
  };

  const changeTaskStatus = async (taskId: string, status: TaskItem['status'], e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t));
    await supabase.from('doodoo_tarefas').update({ status }).eq('id', taskId);
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
  };

  const toggleSubStep = async (taskId: string, stepId: number) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const updatedSteps = task.steps.map(s => s.id === stepId ? { ...s, done: !s.done } : s);
    const allDone = updatedSteps.length > 0 && updatedSteps.every(s => s.done);
    const newStatus: TaskItem['status'] = allDone ? 'concluida' : updatedSteps.some(s => s.done) ? 'andamento' : 'pendente';
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, steps: updatedSteps, status: newStatus } : t));
    await supabase.from('doodoo_tarefas').update({ etapas: updatedSteps, status: newStatus }).eq('id', taskId);
  };

  const handleAddStep = async (taskId: string) => {
    if (!stepInput.trim()) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const updatedSteps = [...task.steps, { id: Date.now(), text: stepInput.trim(), note: stepNoteInput.trim(), done: false }];
    setStepInput(''); setStepNoteInput('');
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, steps: updatedSteps } : t));
    await supabase.from('doodoo_tarefas').update({ etapas: updatedSteps }).eq('id', taskId);
  };

  const handleSaveStepEdit = async (taskId: string, stepId: number) => {
    if (!editStepText.trim()) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const updatedSteps = task.steps.map(s => s.id === stepId ? { ...s, text: editStepText.trim(), note: editStepNote.trim() } : s);
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, steps: updatedSteps } : t));
    setEditingStepId(null);
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
    
    const newStatus = isDifficultyAlert ? 'bloqueado' : task.status;
    
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, chat: newChat, status: newStatus } : t));
    
    await supabase.from('doodoo_tarefas').update({ 
      chat: newChat, 
      status: newStatus,
      metadata: { ultimo_evento: isDifficultyAlert ? 'bloqueio' : 'comentario_chat', autor_evento: currentUser.nome }
    }).eq('id', taskId);
    
    if (isDifficultyAlert) notifyBell('Dificuldade Sinalizada', 'A sua dificuldade foi registada.');
  };

  const handleSendReminder = async (task: TaskItem) => {
    if (!currentUser || !isMounted) return;
    const reminder: ChatComment = { id: Date.now(), author: currentUser.nome, text: `🔔 Solicitou posicionamento / atualização de status para ${task.assignee}.`, time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), isAlert: true };
    const newChat = [...task.chat, reminder];
    
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, chat: newChat } : t));
    
    await supabase.from('doodoo_tarefas').update({ 
      chat: newChat,
      metadata: { ultimo_evento: 'cobranca', autor_evento: currentUser.nome }
    }).eq('id', task.id);
    
    notifyBell('⚠️ Cobrança Enviada', `Notificámos ${task.assignee} a pedir atualização.`);
  };

  const confirmDeleteTask = (id: string, title: string) => {
    setConfirmModal({
      isOpen: true, title: 'Excluir Tarefa', message: `Tem certeza que deseja excluir "${title}"? O histórico será apagado.`,
      onConfirm: async () => {
        setTasks(prev => prev.filter(t => t.id !== id)); setSelectedTaskId(null); setConfirmModal(prev => ({ ...prev, isOpen: false }));
        await supabase.from('doodoo_tarefas').delete().eq('id', id);
        notifyBell('Tarefa Excluída', 'A demanda foi removida.');
      }
    });
  };

  if (isLoading || !isMounted) return <div className="w-full h-full flex flex-col items-center justify-center"><Loader2 className="w-8 h-8 animate-spin opacity-50 text-blue-500" /></div>;
  if (authError || !currentUser) return <div className="w-full h-full flex flex-col items-center justify-center"><button onClick={handleForceLogout} className="px-6 py-3 rounded-2xl bg-brand-panel text-white font-bold"><LogOut className="w-4 h-4 mr-2 inline" />Sair</button></div>;

  return (
    <div className="w-full h-full flex flex-col animate-in fade-in duration-300">
      
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 rounded-[2.5rem] border overflow-hidden shadow-2xl backdrop-blur-xl" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
        
        {/* COLUNA 1: MENU DE LISTAS */}
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
                    {themes.map((t) => (
                      <button key={t.id} onClick={() => changeTheme(t.id)} style={{ width: '10px', height: '10px', backgroundColor: t.color, borderColor: t.border, boxShadow: theme === t.id ? `0 0 0 2px var(--bg-card), 0 0 0 2.5px ${t.border}` : 'none' }} className={`rounded-full border transition-all flex-shrink-0 ${theme === t.id ? 'scale-110' : 'opacity-70 hover:opacity-100'}`} />
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2.5 px-3 py-2 rounded-xl border" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
                <div className="w-7 h-7 rounded-lg bg-brand-panel text-white font-extrabold flex items-center justify-center text-[10px] flex-shrink-0">{getInitials(currentUser.nome)}</div>
                <div className="flex flex-col overflow-hidden"><span className="truncate w-full text-xs font-extrabold leading-tight">{currentUser.nome}</span><span className="text-[9px] font-bold opacity-50 uppercase tracking-wider">{currentUser.cargo}</span></div>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-[10px] font-extrabold uppercase tracking-widest opacity-40 px-2 mb-1">Listas Inteligentes</p>
              <button onClick={() => setSmartList('meu-dia')} className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${smartList === 'meu-dia' ? 'bg-brand-panel text-white shadow-xs' : 'hover:bg-black/5 opacity-75'}`}>
                <div className="flex items-center space-x-2.5"><Sun className={`w-4 h-4 ${smartList === 'meu-dia' ? 'text-white' : 'text-amber-500'}`} /><span>Meu Dia</span></div>
                <span className="text-[11px] font-extrabold">{visibleTasks.filter(t => t.myDay && t.status !== 'concluida').length}</span>
              </button>
              <button onClick={() => setSmartList('todas')} className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${smartList === 'todas' ? 'bg-brand-panel text-white shadow-xs' : 'hover:bg-black/5 opacity-75'}`}>
                <div className="flex items-center space-x-2.5"><CheckSquare className="w-4 h-4" /><span>Todas em Aberto</span></div>
                <span className="text-[11px] font-extrabold">{visibleTasks.filter(t => t.status !== 'concluida').length}</span>
              </button>
              <button onClick={() => setSmartList('importante')} className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${smartList === 'importante' ? 'bg-brand-panel text-white shadow-xs' : 'hover:bg-black/5 opacity-75'}`}>
                <div className="flex items-center space-x-2.5"><Star className={`w-4 h-4 ${smartList === 'importante' ? 'text-white' : 'text-amber-400'}`} /><span>Urgentes & VIPs</span></div>
                <span className="text-[11px] font-extrabold">{visibleTasks.filter(t => (t.important || t.priority === 'Urgente') && t.status !== 'concluida').length}</span>
              </button>
              <button onClick={() => setSmartList('rotinas')} className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${smartList === 'rotinas' ? 'bg-brand-panel text-white shadow-xs' : 'hover:bg-black/5 opacity-75'}`}>
                <div className="flex items-center space-x-2.5"><Repeat className={`w-4 h-4 ${smartList === 'rotinas' ? 'text-white' : 'text-blue-500'}`} /><span>Rotinas do Setor</span></div>
                <span className="text-[11px] font-extrabold">{visibleTasks.filter(t => t.isRoutine && t.status !== 'concluida').length}</span>
              </button>
              <button onClick={() => setSmartList('concluidas')} className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${smartList === 'concluidas' ? 'bg-brand-panel text-white shadow-xs' : 'hover:bg-black/5 opacity-75'}`}>
                <div className="flex items-center space-x-2.5"><CheckCircle2 className={`w-4 h-4 ${smartList === 'concluidas' ? 'text-white' : 'text-emerald-500'}`} /><span>Concluídas</span></div>
                <span className="text-[11px] font-extrabold">{visibleTasks.filter(t => t.status === 'concluida').length}</span>
              </button>
            </div>
          </div>

          <div className="pt-3 border-t space-y-1.5" style={{ borderColor: 'var(--border-input)' }}>
            <label className="text-[10px] font-bold uppercase tracking-wider opacity-50 block px-1">Auditar Filas de Trabalho</label>
            <select 
              value={selectedPersonFilter} 
              onChange={(e) => { setSelectedPersonFilter(e.target.value); setSelectedTaskId(null); }} 
              className="w-full p-2.5 rounded-xl border text-xs font-bold outline-none cursor-pointer focus:border-blue-500 transition-colors" 
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
            >
              <option value="minha_fila">Minha Fila (Para mim)</option>
              {auditDropdownOptions.map(m => ( <option key={m.user_id} value={m.nome}>{m.nome} ({m.cargo})</option> ))}
            </select>
          </div>
        </div>

        {/* COLUNA 2: LISTA DE TAREFAS */}
        <div className={`${selectedTask ? 'lg:col-span-5 border-r' : 'lg:col-span-9'} flex flex-col h-full overflow-hidden`} style={{ borderColor: 'var(--border-input)' }}>
          <div className="p-4 border-b flex items-center justify-between gap-3" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-card)' }}>
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-40" />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Pesquisar tarefas..." className="w-full pl-9 pr-4 py-2 rounded-xl border text-xs font-medium outline-none focus:border-blue-500" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }} />
            </div>
            <button onClick={openCreateModal} className="px-4 py-2 rounded-xl bg-brand-panel text-white text-xs font-extrabold shadow-sm hover:opacity-95 flex items-center space-x-1.5 flex-shrink-0">
              <Plus className="w-4 h-4" /><span>Nova Tarefa</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2.5 custom-scrollbar" style={{ backgroundColor: 'var(--bg-input)' }}>
            {filteredTasks.map(task => {
              const isSelected = selectedTask?.id === task.id;
              const isDone = task.status === 'concluida';
              const isBlocked = task.status === 'bloqueado';
              const overdue = isTaskOverdue(task.dueDate, task.dueTime, task.status);
              const catColor = taskCategories.find(c => c.nome === task.category)?.cor || '#3B82F6';

              return (
                <div key={task.id} onClick={() => setSelectedTaskId(task.id)} className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${isSelected ? 'shadow-sm' : 'hover:opacity-95'}`} style={{ backgroundColor: isSelected ? 'var(--bg-input)' : 'var(--bg-card)', borderColor: overdue ? 'rgba(239, 68, 68, 0.4)' : isBlocked ? 'rgba(245, 158, 11, 0.4)' : 'var(--border-input)', boxShadow: isSelected ? `0 0 0 2px ${catColor}` : undefined }}>
                  <div className="flex items-start space-x-3 overflow-hidden w-full">
                    <button type="button" onClick={(e) => changeTaskStatus(task.id, isDone ? 'pendente' : 'concluida', e)} className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isDone ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-400 hover:border-blue-500'}`}>{isDone && <CheckCircle2 className="w-3.5 h-3.5" />}</button>
                    <div className="overflow-hidden flex-1">
                      <div className="flex items-center space-x-2">
                        {task.priority === 'Urgente' && !isDone && <span className="px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-500 text-[9px] font-extrabold uppercase flex items-center space-x-0.5 flex-shrink-0"><Flame className="w-2.5 h-2.5 mr-0.5" /> Urgente</span>}
                        {isBlocked && !isDone && <span className="px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-500 text-[9px] font-extrabold uppercase flex items-center space-x-0.5 flex-shrink-0"><AlertTriangle className="w-2.5 h-2.5 mr-0.5" /> Bloqueada</span>}
                        {overdue && <span className="px-1.5 py-0.5 rounded-md bg-red-500 text-white text-[9px] font-extrabold uppercase flex-shrink-0">Atrasada</span>}
                        <p className={`text-xs font-extrabold leading-snug truncate ${isDone ? 'line-through opacity-45' : ''}`}>{task.title}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] opacity-60 font-medium">
                        <span className="font-extrabold text-blue-500">{task.assignee === currentUser.nome ? 'Minha Fila' : task.assignee}</span>
                        <span>•</span>
                        <span className="px-1.5 flex items-center" style={{ color: catColor }}><div className="w-1.5 h-1.5 rounded-full mr-1" style={{ backgroundColor: catColor }}></div>{task.category}</span>
                        <span>•</span>
                        <span className={overdue ? 'text-red-500 font-bold' : ''}>📅 {task.dueDate}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 flex-shrink-0">
                    {task.status === 'andamento' && <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">Em andamento</span>}
                    <button type="button" onClick={(e) => toggleTaskFlag(task.id, 'important', e)} className="p-1.5 rounded-lg hover:bg-black/5 cursor-pointer"><Star className={`w-4 h-4 ${task.important ? 'fill-amber-400 text-amber-400' : 'opacity-30'}`} /></button>
                  </div>
                </div>
              );
            })}
            {filteredTasks.length === 0 && <div className="h-60 flex flex-col items-center justify-center text-center opacity-40"><CheckCircle2 className="w-8 h-8 stroke-1" /><p className="text-xs mt-2 font-semibold">Tudo limpo nesta fila.</p></div>}
          </div>
        </div>

        {/* COLUNA 3: DETALHES E EDIÇÃO DA TAREFA */}
        {selectedTask && (
          <div className="lg:col-span-4 flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-200" style={{ backgroundColor: 'var(--bg-card)' }}>
            
            <div className="p-5 border-b flex items-start justify-between gap-3" style={{ borderColor: 'var(--border-input)' }}>
              <div className="overflow-hidden w-full">
                <div className="flex items-center space-x-2 mb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-45">Criado por: {selectedTask.assignedBy}</span>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-500 flex items-center space-x-1"><Tag className="w-3 h-3" /><span>{selectedTask.category}</span></span>
                </div>

                {isEditingTask ? (
                  <div className="space-y-2 mt-2 pr-4">
                    <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full p-2.5 rounded-xl border text-sm font-extrabold outline-none focus:border-blue-500" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }} />
                  </div>
                ) : (
                  <h3 className="text-sm font-extrabold leading-snug break-words flex items-start">
                    <span className="flex-1">{selectedTask.title}</span>
                    {canEditTask && (
                      <button onClick={() => { setIsEditingTask(true); setEditTitle(selectedTask.title); setEditDesc(selectedTask.description); }} className="ml-2 p-1.5 rounded-lg text-blue-500 hover:bg-blue-500/10 transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                  </h3>
                )}
              </div>
              
              {!isEditingTask && (
                <button onClick={() => setSelectedTaskId(null)} className="p-1.5 rounded-xl hover:bg-black/5 opacity-50 hover:opacity-100 cursor-pointer flex-shrink-0"><X className="w-4 h-4" /></button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
              
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => toggleTaskFlag(selectedTask.id, 'myDay')} className={`py-2 px-2 rounded-xl border text-[11px] font-bold flex items-center justify-center space-x-1.5 cursor-pointer ${selectedTask.myDay ? 'bg-amber-500/10 text-amber-500 border-amber-500/30' : 'opacity-60'}`} style={!selectedTask.myDay ? { backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' } : undefined}><Sun className="w-3.5 h-3.5" /><span>Meu Dia</span></button>
                <button type="button" onClick={() => toggleTaskFlag(selectedTask.id, 'important')} className={`py-2 px-2 rounded-xl border text-[11px] font-bold flex items-center justify-center space-x-1.5 cursor-pointer ${selectedTask.important ? 'bg-amber-500/10 text-amber-500 border-amber-500/30' : 'opacity-60'}`} style={!selectedTask.important ? { backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' } : undefined}><Star className={`w-3.5 h-3.5 ${selectedTask.important ? 'fill-amber-400' : ''}`} /><span>Destacar</span></button>
                <button type="button" onClick={() => toggleTaskFlag(selectedTask.id, 'isRoutine')} className={`py-2 px-2 rounded-xl border text-[11px] font-bold flex items-center justify-center space-x-1.5 cursor-pointer ${selectedTask.isRoutine ? 'bg-blue-500/10 text-blue-500 border-blue-500/30' : 'opacity-60'}`} style={!selectedTask.isRoutine ? { backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' } : undefined}><Repeat className="w-3.5 h-3.5" /><span>Rotina</span></button>
              </div>

              <div className="grid grid-cols-2 gap-2.5 p-3.5 rounded-2xl border" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                <div>
                  <span className="text-[10px] font-semibold opacity-50 block mb-1">Status</span>
                  <select value={selectedTask.status} onChange={(e) => changeTaskStatus(selectedTask.id, e.target.value as TaskItem['status'])} className="w-full p-2 rounded-xl border text-xs font-bold outline-none cursor-pointer" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}>
                    <option value="pendente">⏳ Pendente</option><option value="andamento">▶️ Em andamento</option><option value="bloqueado">⚠️ Bloqueado</option><option value="concluida">✅ Concluída</option>
                  </select>
                </div>
                <div>
                  <span className="text-[10px] font-semibold opacity-50 block mb-1">Prioridade</span>
                  <select value={selectedTask.priority} onChange={(e) => updateTaskMetadata(selectedTask.id, 'priority', e.target.value)} className="w-full p-2 rounded-xl border text-xs font-bold outline-none cursor-pointer" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}>
                    <option value="Normal">Normal</option><option value="Urgente">🔥 Urgente</option>
                  </select>
                </div>
                <div className="col-span-2 pt-1">
                  <span className="text-[10px] font-semibold opacity-50 block mb-1">Responsável pela Execução</span>
                  {canEditTask ? (
                    <select value={selectedTask.assignee} onChange={(e) => updateTaskMetadata(selectedTask.id, 'assignee', e.target.value)} className="w-full p-2 rounded-xl border text-xs font-bold text-blue-500 outline-none cursor-pointer" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
                      {allowedAssignees.map(a => ( <option key={a.value} value={a.value}>{a.label}</option> ))}
                    </select>
                  ) : ( <div className="p-2 rounded-xl border text-xs font-bold text-blue-500" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>{selectedTask.assignee === currentUser.nome ? `${currentUser.nome} (Minha Fila)` : selectedTask.assignee}</div> )}
                </div>
              </div>

              <div>
                <span className="text-[11px] font-bold opacity-50 block mb-1">Instruções / Observações</span>
                {isEditingTask ? (
                  <div className="space-y-2">
                    <textarea rows={4} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="w-full p-3 rounded-2xl border text-xs leading-relaxed outline-none focus:border-blue-500 resize-none" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }} />
                    <div className="flex justify-end space-x-2">
                      <button onClick={() => setIsEditingTask(false)} className="px-3 py-1.5 rounded-lg border text-xs font-bold hover:opacity-80" style={{ borderColor: 'var(--border-input)' }}>Cancelar</button>
                      <button onClick={handleSaveTaskInfo} className="px-4 py-1.5 rounded-lg bg-brand-panel text-white text-xs font-bold shadow-sm">Salvar Alterações</button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs opacity-80 leading-relaxed whitespace-pre-wrap p-3 rounded-2xl border" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>{selectedTask.description}</p>
                )}
              </div>

              {selectedTask.assignee !== currentUser.nome && selectedTask.status !== 'concluida' && (
                <button onClick={() => handleSendReminder(selectedTask)} className="w-full py-2.5 px-3 rounded-xl border border-amber-500/30 text-amber-500 bg-amber-500/5 text-xs font-extrabold flex items-center justify-center space-x-2 hover:bg-amber-500/10 cursor-pointer">
                  <Bell className="w-3.5 h-3.5" /><span>Cobrar Posicionamento / Status</span>
                </button>
              )}

              <div className="space-y-3 pt-3 border-t" style={{ borderColor: 'var(--border-input)' }}>
                <div className="flex items-center justify-between text-xs font-bold"><span className="opacity-70">Checklist ({selectedTask.steps.filter(s => s.done).length}/{selectedTask.steps.length})</span></div>
                {selectedTask.steps.length > 0 && (
                  <div className="w-full h-1.5 rounded-full overflow-hidden bg-black/10 dark:bg-white/10">
                    <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${Math.round((selectedTask.steps.filter(s => s.done).length / selectedTask.steps.length) * 100)}%` }} />
                  </div>
                )}
                
                <div className="space-y-2">
                  {selectedTask.steps.map(step => (
                    <div key={step.id}>
                      {editingStepId === step.id ? (
                        <div className="p-3 rounded-xl border space-y-2 shadow-sm" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
                          <input type="text" value={editStepText} onChange={e => setEditStepText(e.target.value)} placeholder="Título da etapa" className="w-full p-2 rounded-lg border text-xs font-bold outline-none focus:border-blue-500" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }} />
                          <textarea rows={2} value={editStepNote} onChange={e => setEditStepNote(e.target.value)} placeholder="Detalhes, links ou o que foi feito..." className="w-full p-2 rounded-lg border text-xs outline-none focus:border-blue-500 resize-none" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }} />
                          <div className="flex justify-end space-x-2 pt-1">
                            <button onClick={() => setEditingStepId(null)} className="px-3 py-1.5 rounded-lg border text-[11px] font-bold hover:opacity-80" style={{ borderColor: 'var(--border-input)' }}>Cancelar</button>
                            <button onClick={() => handleSaveStepEdit(selectedTask.id, step.id)} className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-[11px] font-bold">Salvar</button>
                          </div>
                        </div>
                      ) : (
                        <div className="group flex items-start justify-between p-2.5 rounded-xl border text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/5" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                          <label className="flex items-start space-x-2.5 cursor-pointer flex-1 overflow-hidden mt-0.5">
                            <input type="checkbox" checked={step.done} onChange={() => toggleSubStep(selectedTask.id, step.id)} className="w-4 h-4 rounded accent-blue-600 cursor-pointer flex-shrink-0" />
                            <div className="flex flex-col">
                              <span className={`break-words ${step.done ? 'line-through opacity-45' : 'font-bold'}`}>{step.text}</span>
                              {step.note && <span className="text-[10px] opacity-60 mt-0.5 leading-relaxed whitespace-pre-wrap">{step.note}</span>}
                            </div>
                          </label>
                          <div className="flex items-center space-x-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditingStepId(step.id); setEditStepText(step.text); setEditStepNote(step.note || ''); }} className="p-1.5 text-blue-500 hover:bg-blue-500/10 rounded-md cursor-pointer"><Edit2 className="w-3.5 h-3.5" /></button>
                            <button onClick={() => handleDeleteStep(selectedTask.id, step.id)} className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-md cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="p-3 rounded-xl border space-y-2" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                  <input type="text" value={stepInput} onChange={(e) => setStepInput(e.target.value)} placeholder="Nova etapa (título)..." className="w-full px-3 py-2 rounded-lg border text-xs font-bold outline-none focus:border-blue-500" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddStep(selectedTask.id); } }} />
                  <textarea rows={1} value={stepNoteInput} onChange={(e) => setStepNoteInput(e.target.value)} placeholder="Observações da etapa (opcional)" className="w-full px-3 py-2 rounded-lg border text-[11px] outline-none resize-none focus:border-blue-500" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }} />
                  <button type="button" onClick={() => handleAddStep(selectedTask.id)} className="w-full py-2 rounded-lg bg-brand-panel text-white text-xs font-extrabold shadow-sm">+ Adicionar Etapa</button>
                </div>
              </div>

              <div className="space-y-2.5 pt-3 border-t" style={{ borderColor: 'var(--border-input)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold opacity-70">Diário & Impeditivos</span>
                  <label className="flex items-center space-x-1.5 text-[11px] font-bold cursor-pointer text-amber-500">
                    <input type="checkbox" checked={isDifficultyAlert} onChange={(e) => setIsDifficultyAlert(e.target.checked)} className="rounded accent-amber-500 cursor-pointer" /><span>Sinalizar Dificuldade</span>
                  </label>
                </div>
                <div className="space-y-2 max-h-44 overflow-y-auto custom-scrollbar pr-1">
                  {selectedTask.chat.map(c => (
                    <div key={c.id} className={`p-2.5 rounded-xl border text-xs space-y-0.5 ${c.isAlert ? 'border-amber-500/40 bg-amber-500/5' : ''}`} style={!c.isAlert ? { backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' } : undefined}>
                      <div className="flex justify-between text-[10px] opacity-65 font-bold"><span className={c.isAlert ? 'text-amber-500' : ''}>{c.author} {c.isAlert ? '• ⚠️ Alerta' : ''}</span><span>{c.time}</span></div>
                      <p className="leading-relaxed break-words">{c.text}</p>
                    </div>
                  ))}
                  {selectedTask.chat.length === 0 && <p className="text-[11px] opacity-40 py-2 text-center">Nenhuma atualização registrada.</p>}
                  <div ref={taskChatEndRef} />
                </div>
                <div className="flex items-center space-x-2">
                  <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder={isDifficultyAlert ? 'Descreva a dificuldade...' : 'Registrar andamento...'} className="flex-1 px-3 py-2 rounded-xl border text-xs outline-none focus:border-blue-500" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSendChat(selectedTask.id); } }} />
                  <button type="button" onClick={() => handleSendChat(selectedTask.id)} className="p-2.5 rounded-xl bg-brand-panel text-white cursor-pointer"><Send className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>

            <div className="p-4 border-t flex items-center justify-between text-xs" style={{ borderColor: 'var(--border-input)' }}>
              <span className="opacity-55 text-[11px] font-semibold">Prazo Final: {selectedTask.dueDate} às {selectedTask.dueTime}</span>
              {canEditTask && (
                <button onClick={() => confirmDeleteTask(selectedTask.id, selectedTask.title)} className="text-red-500 hover:underline font-bold flex items-center space-x-1 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /><span>Excluir</span></button>
              )}
            </div>
          </div>
        )}
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-3xl border shadow-xl overflow-hidden max-h-[90vh] flex flex-col" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-input)' }}><h3 className="font-extrabold text-base">Nova Demanda ({currentUser?.setor})</h3><button onClick={() => setIsCreateModalOpen(false)} className="p-1.5 rounded-lg hover:bg-black/5 cursor-pointer"><X className="w-4 h-4" /></button></div>
            <form onSubmit={handleCreateTask} className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
              <div><label className="text-xs font-bold opacity-60 block mb-1">Título da Demanda *</label><input type="text" required value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Ex: Verificar link dedicado..." className="w-full px-3.5 py-2.5 rounded-xl border text-xs font-semibold outline-none focus:border-blue-500" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold opacity-60 block mb-1">Categoria</label>
                  <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl border text-xs font-semibold outline-none cursor-pointer focus:border-blue-500" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}>
                    {taskCategories.map(cat => <option key={cat.id} value={cat.nome}>{cat.nome}</option>)}
                  </select>
                </div>
                <div><label className="text-xs font-bold opacity-60 block mb-1">Prioridade</label><select value={newPriority} onChange={(e: any) => setNewPriority(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl border text-xs font-bold outline-none cursor-pointer focus:border-blue-500" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}><option value="Normal">Normal</option><option value="Urgente">🔥 Urgente</option></select></div>
              </div>
              <div><label className="text-xs font-bold opacity-60 block mb-1">Observações (opcional)</label><textarea rows={2} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Contexto técnico..." className="w-full px-3.5 py-2.5 rounded-xl border text-xs outline-none resize-none focus:border-blue-500" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><label className="text-xs font-bold opacity-60 block mb-1">Responsável</label><select value={newAssignee} onChange={(e) => setNewAssignee(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border text-xs font-semibold outline-none cursor-pointer focus:border-blue-500" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}>{allowedAssignees.map(a => ( <option key={a.value} value={a.value}>{a.label}</option> ))}</select></div>
                <div><label className="text-xs font-bold opacity-60 block mb-1">Data Limite</label><input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-xs font-semibold outline-none focus:border-blue-500" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }} /></div>
                <div><label className="text-xs font-bold opacity-60 block mb-1">Horário</label><input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-xs font-semibold outline-none focus:border-blue-500" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }} /></div>
              </div>
              <label className="flex items-center justify-between p-3 rounded-xl border cursor-pointer" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                <div className="flex items-center space-x-2"><Repeat className="w-4 h-4 text-blue-500" /><div><span className="text-xs font-bold block">Classificar como Rotina</span><span className="text-[10px] opacity-60">Ficará na lista inteligente de Rotinas.</span></div></div>
                <input type="checkbox" checked={newIsRoutine} onChange={(e) => setNewIsRoutine(e.target.checked)} className="w-4 h-4 rounded accent-blue-600 cursor-pointer" />
              </label>
              
              <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border-input)' }}>
                <label className="text-xs font-bold opacity-60 block">Checklist Inicial ({newSteps.length})</label>
                {newSteps.length > 0 && (
                  <div className="space-y-1 max-h-28 overflow-y-auto custom-scrollbar">
                    {newSteps.map((st, i) => ( 
                      <div key={i} className="px-3 py-2 rounded-lg border flex justify-between items-start" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                        <div className="flex flex-col">
                          <span className="text-[11px] font-bold">{i + 1}. {st.text}</span>
                          {st.note && <span className="text-[9px] opacity-60 truncate max-w-[200px] mt-0.5">{st.note}</span>}
                        </div>
                        <button type="button" onClick={() => setNewSteps(prev => prev.filter((_, idx) => idx !== i))} className="opacity-50 hover:opacity-100 text-red-500 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                      </div> 
                    ))}
                  </div>
                )}
                <div className="p-3 border rounded-xl space-y-2" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                  <input type="text" value={newStepText} onChange={(e) => setNewStepText(e.target.value)} placeholder="Título da etapa..." className="w-full px-3 py-2 rounded-lg border text-xs font-bold outline-none focus:border-blue-500" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTempStep(); } }} />
                  <textarea rows={1} value={newStepNote} onChange={(e) => setNewStepNote(e.target.value)} placeholder="Descrição (opcional)..." className="w-full px-3 py-2 rounded-lg border text-[11px] outline-none resize-none focus:border-blue-500" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }} />
                  <button type="button" onClick={handleAddTempStep} className="w-full py-2 rounded-lg bg-brand-panel text-white text-xs font-extrabold cursor-pointer shadow-sm">+ Adicionar ao Checklist</button>
                </div>
              </div>
              <div className="flex justify-end space-x-2 pt-4 border-t" style={{ borderColor: 'var(--border-input)' }}><button type="button" onClick={() => setIsCreateModalOpen(false)} className="px-4 py-2 rounded-xl border text-xs font-bold cursor-pointer">Cancelar</button><button type="submit" className="px-5 py-2 rounded-xl bg-brand-panel text-white text-xs font-bold cursor-pointer hover:opacity-90">Salvar Tarefa</button></div>
            </form>
          </div>
        </div>
      )}

      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl border shadow-2xl overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-input)' }}><div className="flex items-center space-x-2 text-red-500"><AlertTriangle className="w-5 h-5" /><h3 className="font-extrabold text-sm">{confirmModal.title}</h3></div><button onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} className="p-1.5 rounded-lg hover:bg-black/5 cursor-pointer"><X className="w-4 h-4" /></button></div>
            <div className="p-6"><p className="text-xs font-semibold opacity-80 leading-relaxed">{confirmModal.message}</p></div>
            <div className="flex justify-end space-x-2 px-6 py-4 border-t" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-input)' }}><button onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} className="px-4 py-2 rounded-xl border text-xs font-bold cursor-pointer">Cancelar</button><button onClick={confirmModal.onConfirm} className="px-5 py-2 rounded-xl bg-red-500 text-white text-xs font-bold cursor-pointer">Sim, Excluir</button></div>
          </div>
        </div>
      )}
    </div>
  );
}