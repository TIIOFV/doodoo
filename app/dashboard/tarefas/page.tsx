'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { 
  CheckSquare, Plus, Trash2, Bell, Send, Sun, 
  X, Star, Search, Repeat, Shield, 
  CheckCircle2, AlertTriangle, ChevronRight, Palette, Loader2, LogOut, Clock, Flame, Tag, Edit2, ArrowLeft, Calendar
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../contexts/ThemeContext';

type RoleType = 'administrador' | 'gestor' | 'coordenador' | 'supervisor' | 'analista' | 'colaborador';

interface DBProfile { id: string; user_id: string; nome: string; email: string; cargo: RoleType; setor: string; avatar_url?: string; }
interface SubStep { id: number; text: string; note?: string; done: boolean; }
interface ChatComment { id: number; author: string; text: string; time: string; isAlert?: boolean; }

interface TaskItem {
  id: string; title: string; description: string; category: string; priority: 'Normal' | 'Urgente'; status: 'pendente' | 'andamento' | 'bloqueado' | 'concluida';
  important: boolean; myDay: boolean; isRoutine: boolean; assignee: string; sector: string; assignedBy: string; dueDate: string; dueTime: string; createdAt: string; 
  steps: SubStep[]; chat: ChatComment[];
}

interface TaskCategory { id: string; nome: string; cor: string; }

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
  id: dbTask.id, title: dbTask.titulo || 'Sem título', description: dbTask.descricao || '', category: dbTask.categoria || 'Geral',
  priority: dbTask.prioridade === 'Urgente' ? 'Urgente' : 'Normal', status: dbTask.status || 'pendente', important: Boolean(dbTask.importante),
  myDay: Boolean(dbTask.meu_dia), isRoutine: Boolean(dbTask.rotina), assignee: dbTask.responsavel || '', sector: dbTask.setor || 'Geral',
  assignedBy: dbTask.atribuido_por || 'Sistema', dueDate: dbTask.data_limite || '', dueTime: dbTask.hora_limite || '17:00',
  createdAt: dbTask.created_at || '', steps: Array.isArray(dbTask.etapas) ? dbTask.etapas : [], chat: Array.isArray(dbTask.chat) ? dbTask.chat : []
});

const formatLinks = (text: string) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.split(urlRegex).map((part, i) => 
    urlRegex.test(part) ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80 transition-opacity break-words text-blue-500">{part}</a> : part
  );
};

export default function TarefasPage() {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  const [currentUser, setCurrentUser] = useState<DBProfile | null>(null);
  const [teamMembers, setTeamMembers] = useState<DBProfile[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [taskCategories, setTaskCategories] = useState<TaskCategory[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [isSaving, setIsSaving] = useState(false); 

  const [smartList, setSmartList] = useState<'meu-dia' | 'todas' | 'importante' | 'rotinas' | 'concluidas'>('meu-dia');
  const [viewMode, setViewMode] = useState<'minha' | 'delegadas'>('minha');
  const [delegatedFilterPerson, setDelegatedFilterPerson] = useState<string>('todos'); 
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
  const inputFieldRef = useRef<HTMLTextAreaElement>(null);

  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const glassContainerStyle = { backgroundColor: 'color-mix(in srgb, var(--bg-card) 50%, transparent)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', border: '1px solid color-mix(in srgb, var(--border-input) 40%, transparent)', boxShadow: '0 12px 40px rgba(0, 0, 0, 0.08)' };
  const glassSidebarStyle = { backgroundColor: 'color-mix(in srgb, var(--bg-input) 30%, transparent)', borderRight: '1px solid color-mix(in srgb, var(--border-input) 40%, transparent)' };
  const glassItemStyle = { backgroundColor: 'color-mix(in srgb, var(--bg-card) 70%, transparent)', border: '1px solid color-mix(in srgb, var(--border-input) 50%, transparent)' };
  const solidCardStyle = { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-input)', boxShadow: '0 12px 40px rgba(0, 0, 0, 0.15)' };
  const solidInputStyle = { backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-main)' };

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

    return () => { supabase.removeChannel(taskSubscription); };
  }, [currentUser, notifyBell]);

  const allowedAssignees = useMemo(() => {
    if (!currentUser) return [];
    const isManager = ['administrador', 'gestor', 'coordenador'].includes(currentUser.cargo);

    if (isManager) {
      return teamMembers.map(u => ({
        label: u.id === currentUser.id ? `${u.nome} (Minha Fila)` : `${u.nome} (${u.cargo})`,
        value: u.nome
      }));
    } else {
      return teamMembers
        .filter(u => u.id === currentUser.id || ['administrador', 'gestor', 'coordenador'].includes(u.cargo))
        .map(u => ({
          label: u.id === currentUser.id ? `${u.nome} (Para mim)` : `${u.nome} (Gestão / Escalar)`,
          value: u.nome
        }));
    }
  }, [currentUser, teamMembers]);

  const delegatedCount = useMemo(() => {
    if (!currentUser) return 0;
    return tasks.filter(t => t.assignedBy === currentUser.nome && t.assignee !== currentUser.nome && t.status !== 'concluida').length;
  }, [tasks, currentUser]);

  const delegatedPeopleList = useMemo(() => {
    if (!currentUser) return [];
    const names = tasks.filter(t => t.assignedBy === currentUser.nome && t.assignee !== currentUser.nome).map(t => t.assignee);
    return Array.from(new Set(names));
  }, [tasks, currentUser]);

  const visibleTasks = useMemo(() => {
    if (!currentUser) return [];
    
    return tasks.filter(task => {
      if (task.sector !== currentUser.setor) return false;
      
      if (viewMode === 'minha') {
        if (task.assignee !== currentUser.nome) return false;
      } else {
        if (task.assignedBy !== currentUser.nome || task.assignee === currentUser.nome) return false;
        if (delegatedFilterPerson !== 'todos' && task.assignee !== delegatedFilterPerson) return false;
      }
      
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        return (task.title.toLowerCase().includes(q) || task.description.toLowerCase().includes(q) || task.category.toLowerCase().includes(q) || task.assignee.toLowerCase().includes(q));
      }
      return true;
    });
  }, [tasks, currentUser, viewMode, delegatedFilterPerson, searchQuery]);

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
    if (!newTitle.trim() || !currentUser || isSaving) return;
    setIsSaving(true);
    
    const target = newAssignee || currentUser.nome;
    const formattedDate = newDate ? newDate.split('-').reverse().join('/') : getLocalTodayISO().split('-').reverse().join('/');
    const stepsPayload = newSteps.map((s, idx) => ({ id: Date.now() + idx, text: s.text, note: s.note, done: false }));
    const isUrgent = newPriority === 'Urgente';

    const tempId = `temp-${Date.now()}`;
    const optimisticTask: TaskItem = {
      id: tempId, title: newTitle.trim(), description: newDesc.trim() || 'Sem observações adicionais.', category: newCategory, priority: newPriority, status: 'pendente', important: isUrgent,
      myDay: true, isRoutine: newIsRoutine, assignee: target, sector: currentUser.setor, assignedBy: currentUser.nome, dueDate: formattedDate, dueTime: newTime, steps: stepsPayload, chat: [], createdAt: new Date().toISOString()
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
    setIsSaving(false);
  };

  const handleSaveTaskInfo = async () => {
    if (!selectedTask || !editTitle.trim()) return;
    const finalTitle = editTitle.trim();
    const finalDesc = editDesc.trim() || 'Sem observações adicionais.';

    setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, title: finalTitle, description: finalDesc } : t));
    setIsEditingTask(false);

    await supabase.from('doodoo_tarefas').update({ titulo: finalTitle, descricao: finalDesc }).eq('id', selectedTask.id);
    notifyBell('Tarefa Atualizada', 'Título e descrição salvos com sucesso.');
  };

  // 🚀 MOTOR DE RENOVAÇÃO DE ROTINAS (Gera a próxima semana automaticamente)
  const completeTaskAndCloneRoutine = async (taskId: string, finalSteps?: SubStep[]) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const stepsToSave = finalSteps || task.steps;

    // 1. Marca a atual como concluída
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'concluida', steps: stepsToSave } : t));
    await supabase.from('doodoo_tarefas').update({ status: 'concluida', etapas: stepsToSave }).eq('id', taskId);

    // 2. Se for rotina, duplica para a próxima semana
    if (task.isRoutine) {
      let nextDateStr = '';
      if (task.dueDate) {
        const parts = task.dueDate.split('/');
        if (parts.length === 3) {
          const [day, month, year] = parts.map(Number);
          const nextDateObj = new Date(year, month - 1, day);
          nextDateObj.setDate(nextDateObj.getDate() + 7); // + 1 semana fixa para rotinas padrão
          nextDateStr = `${String(nextDateObj.getDate()).padStart(2, '0')}/${String(nextDateObj.getMonth() + 1).padStart(2, '0')}/${nextDateObj.getFullYear()}`;
        }
      }
      if (!nextDateStr) {
         const now = new Date();
         now.setDate(now.getDate() + 7);
         nextDateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
      }

      // Reinicia a checklist para a próxima semana
      const cleanSteps = stepsToSave.map(s => ({ ...s, done: false, id: Date.now() + Math.random() }));
      const tempId = `temp-routine-${Date.now()}`;
      
      const newTask: TaskItem = {
          ...task,
          id: tempId,
          status: 'pendente',
          dueDate: nextDateStr,
          chat: [],
          steps: cleanSteps,
          myDay: false, // Desmarca de hoje para não poluir
          createdAt: new Date().toISOString()
      };

      setTasks(prev => [newTask, ...prev]);

      const { data, error } = await supabase.from('doodoo_tarefas').insert([{
          usuario_id: currentUser?.user_id,
          titulo: task.title,
          descricao: task.description,
          categoria: task.category,
          prioridade: task.priority,
          status: 'pendente',
          importante: task.important,
          meu_dia: false,
          rotina: true,
          responsavel: task.assignee,
          setor: task.sector,
          atribuido_por: task.assignedBy,
          data_limite: nextDateStr,
          hora_limite: task.dueTime,
          etapas: cleanSteps,
          chat: [],
          metadata: { clonedFrom: task.id }
      }]).select().single();

      if (data && !error) {
          const realTask = mapDbToTask(data);
          setTasks(prev => prev.map(t => t.id === tempId ? realTask : t));
          notifyBell('🔁 Rotina Renovada', `A próxima ocorrência foi agendada automaticamente para ${nextDateStr}.`);
      }
    }
  };

  // 🚀 Lógica Centralizada de Troca de Status
  const changeTaskStatus = async (taskId: string, newStatus: TaskItem['status'], e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    if (newStatus === 'concluida' && task.isRoutine && task.status !== 'concluida') {
        await completeTaskAndCloneRoutine(taskId);
    } else {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
        await supabase.from('doodoo_tarefas').update({ status: newStatus }).eq('id', taskId);
    }
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
    
    const isCompleting = allDone && task.status !== 'concluida';
    const newStatus = allDone ? 'concluida' : updatedSteps.some(s => s.done) ? 'andamento' : 'pendente';
    
    if (isCompleting && task.isRoutine) {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, steps: updatedSteps } : t));
        completeTaskAndCloneRoutine(taskId, updatedSteps);
    } else {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, steps: updatedSteps, status: newStatus } : t));
        await supabase.from('doodoo_tarefas').update({ etapas: updatedSteps, status: newStatus }).eq('id', taskId);
    }
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

  // 🚀 LÓGICA DE TEXTAREA AUTO-EXPANSÍVEL PARA O CHAT DA TAREFA
  const handleInputResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setChatInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); 
      if (chatInput.trim() && selectedTask) {
        handleSendChat(selectedTask.id);
      }
    }
  };

  const handleSendChat = async (taskId: string) => {
    if (!chatInput.trim() || !currentUser || !isMounted) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const now = new Date();
    const formattedTime = `${now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    
    const msg: ChatComment = { id: Date.now(), author: currentUser.nome, text: chatInput.trim(), time: formattedTime, isAlert: isDifficultyAlert };
    const newChat = [...task.chat, msg];
    
    setChatInput(''); 
    setIsDifficultyAlert(false);
    if (inputFieldRef.current) inputFieldRef.current.style.height = 'auto'; // Reset tamanho do textarea
    
    const newStatus = isDifficultyAlert ? 'bloqueado' : task.status;
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, chat: newChat, status: newStatus } : t));
    
    await supabase.from('doodoo_tarefas').update({ 
      chat: newChat, 
      status: newStatus,
      metadata: { ultimo_evento: isDifficultyAlert ? 'bloqueio' : 'comentario_chat', autor_evento: currentUser.nome }
    }).eq('id', taskId);
    
    if (isDifficultyAlert) notifyBell('Dificuldade Sinalizada', 'A sua dificuldade foi registada.');
    setTimeout(() => { taskChatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, 100);
  };

  const handleSendReminder = async (task: TaskItem) => {
    if (!currentUser || !isMounted) return;
    
    const now = new Date();
    const formattedTime = `${now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    
    const reminder: ChatComment = { id: Date.now(), author: currentUser.nome, text: `🔔 Solicitou posicionamento / atualização de status para ${task.assignee}.`, time: formattedTime, isAlert: true };
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
      isOpen: true, title: 'Excluir Tarefa', message: `Tem certeza que deseja excluir permanentemente "${title}"? O histórico será apagado.`,
      onConfirm: async () => {
        setTasks(prev => prev.filter(t => t.id !== id)); setSelectedTaskId(null); setConfirmModal(prev => ({ ...prev, isOpen: false }));
        await supabase.from('doodoo_tarefas').delete().eq('id', id);
        notifyBell('Tarefa Excluída', 'A demanda foi removida com sucesso.');
      }
    });
  };

  const formatCreatedAt = (dateString: string) => {
    if (!dateString) return 'Data desconhecida';
    const date = new Date(dateString);
    return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  };

  if (isLoading || !isMounted) return <div className="w-full h-full flex flex-col items-center justify-center"><Loader2 className="w-10 h-10 animate-spin opacity-50 text-blue-500" /></div>;
  if (authError || !currentUser) return <div className="w-full h-full flex flex-col items-center justify-center"><button onClick={handleForceLogout} className="px-6 py-3 rounded-2xl bg-brand-panel text-white font-bold"><LogOut className="w-4 h-4 mr-2 inline" />Sair</button></div>;

  return (
    <div className="w-full h-full flex-1 flex flex-col animate-in fade-in duration-300 relative z-0">
      
      <div className="w-full flex-1 flex flex-col lg:flex-row rounded-t-[2rem] rounded-bl-none rounded-br-none md:rounded-b-[2.5rem] md:rounded-[2.5rem] border-t border-l-0 border-r-0 border-b-0 md:border overflow-hidden relative z-10" style={glassContainerStyle}>
        
        {/* ==========================================================
            COLUNA 1: MENU DE LISTAS E ALTERNÂNCIA
            ========================================================== */}
        {!selectedTaskId && (
          <div className="lg:hidden flex flex-col border-b flex-shrink-0" style={{ borderColor: 'color-mix(in srgb, var(--border-input) 40%, transparent)' }}>
            <div className="flex items-center justify-between p-5 md:p-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-brand-panel flex items-center justify-center text-white shadow-md">
                  <CheckSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-[15px] tracking-tight">Fila de Tarefas</h3>
                  <div className="flex items-center space-x-1.5 opacity-60">
                    <Shield className="w-3 h-3 text-blue-500" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">{currentUser.nome}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="px-5 pb-4">
              <div className="grid grid-cols-2 gap-2 p-1.5 rounded-xl border" style={glassItemStyle}>
                <button onClick={() => { setViewMode('minha'); setSelectedTaskId(null); }} className={`py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-sm ${viewMode === 'minha' ? 'bg-brand-panel text-white' : 'opacity-70 hover:opacity-100'}`}>Minhas</button>
                <button onClick={() => { setViewMode('delegadas'); setSelectedTaskId(null); }} className={`py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-2 shadow-sm ${viewMode === 'delegadas' ? 'bg-brand-panel text-white' : 'opacity-70 hover:opacity-100'}`}>
                  <span>Delegadas</span>
                  {delegatedCount > 0 && <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${viewMode === 'delegadas' ? 'bg-white/20' : 'bg-black/10 dark:bg-white/10'}`}>{delegatedCount}</span>}
                </button>
              </div>
            </div>

            <div className="flex overflow-x-auto px-5 pb-5 space-x-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
              {[
                { id: 'meu-dia', icon: Sun, label: 'Meu Dia' },
                { id: 'todas', icon: CheckSquare, label: 'Todas' },
                { id: 'importante', icon: Star, label: 'Urgentes' },
                { id: 'rotinas', icon: Repeat, label: 'Rotinas' },
                { id: 'concluidas', icon: CheckCircle2, label: 'Concluídas' }
              ].map(list => (
                <button key={list.id} onClick={() => setSmartList(list.id as any)} className={`px-4 py-2.5 rounded-full text-[12px] font-extrabold whitespace-nowrap transition-transform active:scale-95 shadow-sm flex items-center space-x-2 ${smartList === list.id ? 'bg-brand-panel text-white' : 'border border-[var(--border-input)] opacity-70 hover:opacity-100'}`} style={smartList !== list.id ? { backgroundColor: 'var(--bg-card)' } : {}}>
                  <list.icon className="w-4 h-4" />
                  <span>{list.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="hidden lg:flex flex-col w-[280px] xl:w-[320px] flex-shrink-0" style={glassSidebarStyle}>
          <div className="p-6 md:p-8 space-y-6 flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
            <div className="space-y-3 pb-4 border-b" style={{ borderColor: 'color-mix(in srgb, var(--border-input) 50%, transparent)' }}>
              <div>
                <h3 className="font-extrabold text-base tracking-tight">Tarefas & Rotinas</h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-brand-panel mt-1">Setor {currentUser.setor}</p>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-2xl border" style={glassItemStyle}>
                <div className="w-9 h-9 rounded-xl bg-brand-panel text-white font-extrabold flex items-center justify-center text-[12px] flex-shrink-0 shadow-sm">{getInitials(currentUser.nome)}</div>
                <div className="flex flex-col overflow-hidden"><span className="truncate w-full text-xs font-extrabold leading-tight">{currentUser.nome}</span><span className="text-[9px] font-bold opacity-60 uppercase tracking-wider">{currentUser.cargo}</span></div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 p-1.5 rounded-xl border shadow-sm" style={glassItemStyle}>
              <button onClick={() => { setViewMode('minha'); setSelectedTaskId(null); }} className={`py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${viewMode === 'minha' ? 'bg-brand-panel text-white shadow-sm' : 'opacity-60 hover:opacity-100'}`}>Minha Fila</button>
              <button onClick={() => { setViewMode('delegadas'); setSelectedTaskId(null); }} className={`py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-1.5 ${viewMode === 'delegadas' ? 'bg-brand-panel text-white shadow-sm' : 'opacity-60 hover:opacity-100'}`}>
                <span>Delegadas</span>
                {delegatedCount > 0 && <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${viewMode === 'delegadas' ? 'bg-white/20 text-white' : 'bg-brand-panel/10 text-brand-panel'}`}>{delegatedCount}</span>}
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-extrabold uppercase tracking-widest opacity-40 px-2 mb-2">Filtros Inteligentes</p>
              <button onClick={() => setSmartList('meu-dia')} className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${smartList === 'meu-dia' ? 'bg-brand-panel text-white shadow-md' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-75'}`}>
                <div className="flex items-center space-x-3"><Sun className={`w-4 h-4 ${smartList === 'meu-dia' ? 'text-white' : 'text-amber-500'}`} /><span>Meu Dia</span></div>
                <span className="text-[11px] font-extrabold">{visibleTasks.filter(t => t.myDay && t.status !== 'concluida').length}</span>
              </button>
              <button onClick={() => setSmartList('todas')} className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${smartList === 'todas' ? 'bg-brand-panel text-white shadow-md' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-75'}`}>
                <div className="flex items-center space-x-3"><CheckSquare className="w-4 h-4" /><span>Todas em Aberto</span></div>
                <span className="text-[11px] font-extrabold">{visibleTasks.filter(t => t.status !== 'concluida').length}</span>
              </button>
              <button onClick={() => setSmartList('importante')} className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${smartList === 'importante' ? 'bg-brand-panel text-white shadow-md' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-75'}`}>
                <div className="flex items-center space-x-3"><Star className={`w-4 h-4 ${smartList === 'importante' ? 'text-white' : 'text-amber-400'}`} /><span>Urgentes & VIPs</span></div>
                <span className="text-[11px] font-extrabold">{visibleTasks.filter(t => (t.important || t.priority === 'Urgente') && t.status !== 'concluida').length}</span>
              </button>
              <button onClick={() => setSmartList('rotinas')} className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${smartList === 'rotinas' ? 'bg-brand-panel text-white shadow-md' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-75'}`}>
                <div className="flex items-center space-x-3"><Repeat className={`w-4 h-4 ${smartList === 'rotinas' ? 'text-white' : 'text-blue-500'}`} /><span>Rotinas do Setor</span></div>
                <span className="text-[11px] font-extrabold">{visibleTasks.filter(t => t.isRoutine && t.status !== 'concluida').length}</span>
              </button>
              <button onClick={() => setSmartList('concluidas')} className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${smartList === 'concluidas' ? 'bg-brand-panel text-white shadow-md' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-75'}`}>
                <div className="flex items-center space-x-3"><CheckCircle2 className={`w-4 h-4 ${smartList === 'concluidas' ? 'text-white' : 'text-emerald-500'}`} /><span>Concluídas</span></div>
                <span className="text-[11px] font-extrabold">{visibleTasks.filter(t => t.status === 'concluida').length}</span>
              </button>
            </div>
          </div>
        </div>

        {/* ==========================================================
            COLUNA 2: LISTA DE TAREFAS 
            ========================================================== */}
        <div className={`flex flex-col h-full overflow-hidden transition-all duration-300 ${selectedTaskId ? 'hidden lg:flex lg:w-[350px] xl:w-[400px] lg:flex-none lg:border-r' : 'flex-1 w-full'}`} style={{ borderColor: 'color-mix(in srgb, var(--border-input) 40%, transparent)' }}>
          
          <div className="p-4 md:p-6 border-b flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0" style={{ borderColor: 'color-mix(in srgb, var(--border-input) 40%, transparent)', backgroundColor: 'color-mix(in srgb, var(--bg-card) 60%, transparent)' }}>
            <div className="relative w-full sm:flex-1">
              <Search className="w-4 h-4 md:w-5 md:h-5 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-40" />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Pesquisar tarefas..." className="w-full pl-10 pr-4 py-3.5 rounded-2xl border text-[13px] font-bold outline-none focus:border-brand-panel transition-colors" style={solidInputStyle} />
            </div>

            {viewMode === 'delegadas' && delegatedPeopleList.length > 0 && (
              <select value={delegatedFilterPerson} onChange={(e) => setDelegatedFilterPerson(e.target.value)} className="w-full sm:w-auto px-4 py-3.5 rounded-2xl border text-[13px] font-bold outline-none cursor-pointer focus:border-brand-panel" style={solidInputStyle}>
                <option value="todos">Toda a Equipe</option>
                {delegatedPeopleList.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            )}

            <button onClick={openCreateModal} className="w-full sm:w-auto p-3.5 px-5 rounded-2xl bg-brand-panel text-white shadow-md hover:opacity-95 transition-all flex items-center justify-center space-x-2 cursor-pointer flex-shrink-0 active:scale-95">
              <Plus className="w-5 h-5" />
              <span className={`${selectedTaskId ? 'hidden' : 'inline'} font-extrabold text-[13px]`}>Nova Tarefa</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
            {filteredTasks.map(task => {
              const isSelected = selectedTask?.id === task.id;
              const isDone = task.status === 'concluida';
              const isBlocked = task.status === 'bloqueado';
              const overdue = isTaskOverdue(task.dueDate, task.dueTime, task.status);
              const catColor = taskCategories.find(c => c.nome === task.category)?.cor || '#3B82F6';

              return (
                <div key={task.id} onClick={() => setSelectedTaskId(task.id)} className={`p-5 rounded-[1.5rem] border transition-all cursor-pointer flex items-center justify-between gap-3 ${isSelected ? 'shadow-md scale-[1.01]' : 'hover:brightness-95 shadow-sm'}`} style={{ backgroundColor: isSelected ? 'var(--bg-input)' : 'color-mix(in srgb, var(--bg-card) 70%, transparent)', borderColor: overdue ? 'rgba(239, 68, 68, 0.5)' : isBlocked ? 'rgba(245, 158, 11, 0.4)' : isSelected ? 'var(--tab-active)' : 'var(--border-input)' }}>
                  <div className="flex items-start space-x-4 overflow-hidden w-full">
                    <button type="button" onClick={(e) => changeTaskStatus(task.id, isDone ? 'pendente' : 'concluida', e)} className={`mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${isDone ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm' : 'border-gray-400 hover:border-brand-panel bg-white/50'}`}>{isDone && <CheckCircle2 className="w-4 h-4" />}</button>
                    <div className="overflow-hidden flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        {task.priority === 'Urgente' && !isDone && <span className="px-2 py-0.5 rounded-lg bg-red-500/10 text-red-500 text-[9px] md:text-[10px] font-extrabold uppercase flex items-center flex-shrink-0 shadow-sm"><Flame className="w-3 h-3 mr-1" /> Urgente</span>}
                        {isBlocked && !isDone && <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-500 text-[9px] md:text-[10px] font-extrabold uppercase flex items-center flex-shrink-0 shadow-sm"><AlertTriangle className="w-3 h-3 mr-1" /> Bloqueada</span>}
                        {overdue && <span className="px-2 py-0.5 rounded-lg bg-red-500 text-white text-[9px] md:text-[10px] font-extrabold uppercase flex-shrink-0 shadow-sm">Atrasada</span>}
                      </div>
                      
                      <p className={`text-[14px] md:text-[15px] font-extrabold leading-snug break-words whitespace-normal ${isDone ? 'line-through opacity-45' : ''}`}>{task.title}</p>
                      
                      <div className="flex flex-wrap items-center gap-2 mt-2 text-[10px] md:text-[11px] opacity-60 font-bold">
                        <span className="text-brand-panel">{viewMode === 'delegadas' ? `Para: ${task.assignee}` : `De: ${task.assignedBy}`}</span>
                        <span>•</span>
                        <span className="flex items-center" style={{ color: catColor }}><div className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: catColor }}></div>{task.category}</span>
                        <span>•</span>
                        <span className={overdue ? 'text-red-500' : ''}>📅 {task.dueDate}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 flex-shrink-0">
                    {task.status === 'andamento' && <span className="hidden sm:inline text-[10px] font-extrabold px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">Em andamento</span>}
                    <button type="button" onClick={(e) => toggleTaskFlag(task.id, 'important', e)} className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors"><Star className={`w-5 h-5 ${task.important ? 'fill-amber-400 text-amber-400 drop-shadow-sm' : 'opacity-30'}`} /></button>
                  </div>
                </div>
              );
            })}
            {filteredTasks.length === 0 && (
              <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center opacity-40 space-y-4"><CheckCircle2 className="w-12 h-12 stroke-1" /><p className="text-sm font-bold">Tudo limpo nesta lista.</p></div>
            )}
          </div>
        </div>

        {/* ==========================================================
            COLUNA 3: EDITOR DETALHES 
            ========================================================== */}
        <div className={`${selectedTaskId ? 'flex' : 'hidden'} flex-col flex-1 h-full overflow-hidden`} style={{ backgroundColor: 'var(--bg-card)' }}>
          {selectedTask && (
            <>
              <div className="p-5 md:p-8 border-b flex flex-col gap-3 flex-shrink-0" style={{ borderColor: 'color-mix(in srgb, var(--border-input) 40%, transparent)' }}>
                
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <button onClick={() => setSelectedTaskId(null)} className="lg:hidden p-2 -ml-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer flex items-center text-brand-panel font-extrabold text-[13px] transition-colors">
                      <ArrowLeft className="w-4 h-4 mr-1.5" /> Voltar
                    </button>
                    <div className="flex flex-col">
                      <span className="hidden lg:inline text-[10px] font-bold uppercase tracking-wider opacity-45">De: {selectedTask.assignedBy}</span>
                      <span className="flex items-center text-[9px] md:text-[10px] font-bold uppercase tracking-wider opacity-45 lg:mt-0.5">
                        <Calendar className="w-2.5 h-2.5 md:w-3 md:h-3 mr-1" />
                        Criado em: {formatCreatedAt(selectedTask.createdAt)}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-extrabold px-3 py-1.5 rounded-lg bg-brand-panel/10 text-brand-panel flex items-center space-x-1.5 shadow-sm border border-brand-panel/20"><Tag className="w-3.5 h-3.5" /><span>{selectedTask.category}</span></span>
                    {!isEditingTask && (
                      <button onClick={() => setSelectedTaskId(null)} className="hidden lg:flex p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 opacity-50 hover:opacity-100 cursor-pointer flex-shrink-0 transition-colors"><X className="w-5 h-5" /></button>
                    )}
                  </div>
                </div>

                {isEditingTask ? (
                  <div className="space-y-3 mt-1">
                    <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full p-3 rounded-2xl border text-base font-extrabold outline-none focus:border-brand-panel transition-colors shadow-sm" style={solidInputStyle} />
                  </div>
                ) : (
                  <h3 className="text-xl md:text-2xl font-extrabold leading-tight break-words whitespace-normal flex items-start mt-2">
                    <span className="flex-1 min-w-0">{selectedTask.title}</span>
                    {canEditTask && (
                      <button onClick={() => { setIsEditingTask(true); setEditTitle(selectedTask.title); setEditDesc(selectedTask.description); }} className="ml-3 p-2 rounded-xl text-brand-panel hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer flex-shrink-0">
                        <Edit2 className="w-5 h-5" />
                      </button>
                    )}
                  </h3>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-5 md:p-8 space-y-6 md:space-y-8 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
                
                <div className="grid grid-cols-3 gap-3">
                  <button type="button" onClick={() => toggleTaskFlag(selectedTask.id, 'myDay')} className={`py-3 px-2 rounded-2xl border text-[11px] font-bold flex items-center justify-center space-x-2 cursor-pointer transition-colors ${selectedTask.myDay ? 'bg-amber-500/10 text-amber-500 border-amber-500/30 shadow-sm' : 'opacity-60 hover:bg-black/5 dark:hover:bg-white/5'}`} style={!selectedTask.myDay ? solidInputStyle : undefined}><Sun className="w-4 h-4" /><span>Meu Dia</span></button>
                  <button type="button" onClick={() => toggleTaskFlag(selectedTask.id, 'important')} className={`py-3 px-2 rounded-2xl border text-[11px] font-bold flex items-center justify-center space-x-2 cursor-pointer transition-colors ${selectedTask.important ? 'bg-amber-500/10 text-amber-500 border-amber-500/30 shadow-sm' : 'opacity-60 hover:bg-black/5 dark:hover:bg-white/5'}`} style={!selectedTask.important ? solidInputStyle : undefined}><Star className={`w-4 h-4 ${selectedTask.important ? 'fill-amber-400 drop-shadow-sm' : ''}`} /><span>Destacar</span></button>
                  <button type="button" onClick={() => toggleTaskFlag(selectedTask.id, 'isRoutine')} className={`py-3 px-2 rounded-2xl border text-[11px] font-bold flex items-center justify-center space-x-2 cursor-pointer transition-colors ${selectedTask.isRoutine ? 'bg-brand-panel/10 text-brand-panel border-brand-panel/30 shadow-sm' : 'opacity-60 hover:bg-black/5 dark:hover:bg-white/5'}`} style={!selectedTask.isRoutine ? solidInputStyle : undefined}><Repeat className={`w-4 h-4 ${selectedTask.isRoutine ? 'animate-spin-slow' : ''}`} /><span>Rotina</span></button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5 rounded-3xl border" style={solidInputStyle}>
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-widest opacity-50 block mb-2">Status da Tarefa</span>
                    <select value={selectedTask.status} onChange={(e) => changeTaskStatus(selectedTask.id, e.target.value as TaskItem['status'])} className="w-full p-3.5 rounded-xl border text-[13px] font-bold outline-none cursor-pointer focus:border-brand-panel transition-colors shadow-sm" style={solidCardStyle}>
                      <option value="pendente">⏳ Pendente</option><option value="andamento">▶️ Em andamento</option><option value="bloqueado">⚠️ Bloqueada</option><option value="concluida">✅ Concluída</option>
                    </select>
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-widest opacity-50 block mb-2">Nível de Prioridade</span>
                    <select value={selectedTask.priority} onChange={(e) => updateTaskMetadata(selectedTask.id, 'priority', e.target.value)} className="w-full p-3.5 rounded-xl border text-[13px] font-bold outline-none cursor-pointer focus:border-brand-panel transition-colors shadow-sm" style={solidCardStyle}>
                      <option value="Normal">Normal</option><option value="Urgente">🔥 Urgente</option>
                    </select>
                  </div>
                  <div className="col-span-1 sm:col-span-2 pt-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest opacity-50 block mb-2">Responsável pela Execução</span>
                    {canEditTask ? (
                      <select value={selectedTask.assignee} onChange={(e) => updateTaskMetadata(selectedTask.id, 'assignee', e.target.value)} className="w-full p-3.5 rounded-xl border text-[13px] font-bold text-brand-panel outline-none cursor-pointer focus:border-brand-panel transition-colors shadow-sm" style={solidCardStyle}>
                        {teamMembers.map(m => ( <option key={m.user_id} value={m.nome}>{m.nome} ({m.cargo})</option> ))}
                      </select>
                    ) : ( <div className="p-3.5 rounded-xl border text-[13px] font-bold text-brand-panel shadow-sm" style={solidCardStyle}>{selectedTask.assignee}</div> )}
                  </div>
                </div>

                <div>
                  <span className="text-[11px] font-extrabold uppercase tracking-widest opacity-50 block mb-3">Instruções e Observações</span>
                  {isEditingTask ? (
                    <div className="space-y-3">
                      <textarea rows={4} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="w-full p-4 rounded-2xl border text-[13px] leading-relaxed outline-none focus:border-brand-panel resize-none font-medium shadow-sm transition-colors" style={solidCardStyle} />
                      <div className="flex justify-end space-x-3">
                        <button onClick={() => setIsEditingTask(false)} className="px-5 py-2.5 rounded-xl border text-[13px] font-bold hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors" style={{ borderColor: 'var(--border-input)' }}>Cancelar</button>
                        <button onClick={handleSaveTaskInfo} className="px-6 py-2.5 rounded-xl bg-brand-panel text-white text-[13px] font-extrabold shadow-md cursor-pointer hover:opacity-90 active:scale-95 transition-transform">Salvar Alterações</button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[13px] opacity-80 leading-relaxed whitespace-pre-wrap p-5 rounded-3xl border font-medium" style={solidInputStyle}>{formatLinks(selectedTask.description)}</div>
                  )}
                </div>

                {selectedTask.assignee !== currentUser.nome && selectedTask.status !== 'concluida' && (
                  <button onClick={() => handleSendReminder(selectedTask)} className="w-full py-4 px-4 rounded-2xl border border-amber-500/40 text-amber-500 bg-amber-500/5 text-[13px] font-extrabold flex items-center justify-center space-x-2 hover:bg-amber-500/10 cursor-pointer transition-colors shadow-sm">
                    <Bell className="w-4 h-4" /><span>Cobrar Atualização de Status</span>
                  </button>
                )}

                <div className="space-y-4 pt-4 border-t" style={{ borderColor: 'color-mix(in srgb, var(--border-input) 40%, transparent)' }}>
                  <div className="flex items-center justify-between text-[13px] font-extrabold"><span className="opacity-70 uppercase tracking-widest text-[10px]">Checklist ({selectedTask.steps.filter(s => s.done).length}/{selectedTask.steps.length})</span></div>
                  {selectedTask.steps.length > 0 && (
                    <div className="w-full h-2 rounded-full overflow-hidden shadow-inner" style={{ backgroundColor: 'color-mix(in srgb, var(--border-input) 50%, transparent)' }}>
                      <div className="h-full bg-emerald-500 transition-all duration-500 ease-out" style={{ width: `${Math.round((selectedTask.steps.filter(s => s.done).length / selectedTask.steps.length) * 100)}%` }} />
                    </div>
                  )}
                  
                  <div className="space-y-3">
                    {selectedTask.steps.map(step => (
                      <div key={step.id}>
                        {editingStepId === step.id ? (
                          <div className="p-4 rounded-2xl border space-y-3 shadow-md" style={solidCardStyle}>
                            <input type="text" value={editStepText} onChange={e => setEditStepText(e.target.value)} placeholder="Título da etapa" className="w-full p-3 rounded-xl border text-[13px] font-bold outline-none focus:border-brand-panel transition-colors" style={solidInputStyle} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveStepEdit(selectedTask.id, step.id); } }} />
                            <textarea rows={2} value={editStepNote} onChange={e => setEditStepNote(e.target.value)} placeholder="Detalhes, links ou o que foi feito..." className="w-full p-3 rounded-xl border text-[12px] outline-none focus:border-brand-panel resize-none font-medium transition-colors" style={solidInputStyle} />
                            <div className="flex justify-end space-x-3 pt-1">
                              <button onClick={() => setEditingStepId(null)} className="px-4 py-2 rounded-xl border text-[12px] font-bold hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors" style={{ borderColor: 'var(--border-input)' }}>Cancelar</button>
                              <button onClick={() => handleSaveStepEdit(selectedTask.id, step.id)} className="px-5 py-2 rounded-xl bg-brand-panel text-white text-[12px] font-bold cursor-pointer shadow-sm">Salvar Etapa</button>
                            </div>
                          </div>
                        ) : (
                          <div className="group flex items-start justify-between p-3.5 md:p-4 rounded-2xl border transition-colors hover:bg-black/5 dark:hover:bg-white/5" style={solidInputStyle}>
                            <label className="flex items-start space-x-3.5 cursor-pointer flex-1 overflow-hidden mt-0.5">
                              <input type="checkbox" checked={step.done} onChange={() => toggleSubStep(selectedTask.id, step.id)} className="w-5 h-5 rounded border-gray-300 accent-brand-panel cursor-pointer flex-shrink-0 shadow-sm" />
                              <div className="flex flex-col">
                                <span className={`break-words text-[13px] md:text-sm ${step.done ? 'line-through opacity-45' : 'font-extrabold'}`}>{step.text}</span>
                                {step.note && <span className="text-[11px] opacity-60 mt-1 leading-relaxed whitespace-pre-wrap font-medium">{formatLinks(step.note)}</span>}
                              </div>
                            </label>
                            <div className="flex items-center space-x-1.5 ml-3 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => { setEditingStepId(step.id); setEditStepText(step.text); setEditStepNote(step.note || ''); }} className="p-2 text-brand-panel hover:bg-black/5 dark:hover:bg-white/5 rounded-xl cursor-pointer transition-colors"><Edit2 className="w-4 h-4" /></button>
                              <button onClick={() => handleDeleteStep(selectedTask.id, step.id)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-xl cursor-pointer transition-colors"><X className="w-4 h-4" /></button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="p-4 rounded-2xl border space-y-3" style={solidInputStyle}>
                    <input type="text" value={stepInput} onChange={(e) => setStepInput(e.target.value)} placeholder="Nova etapa (título)..." className="w-full px-4 py-3 rounded-xl border text-[13px] font-bold outline-none focus:border-brand-panel transition-colors shadow-sm" style={solidCardStyle} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddStep(selectedTask.id); } }} />
                    <textarea rows={1} value={stepNoteInput} onChange={(e) => setStepNoteInput(e.target.value)} placeholder="Observações da etapa (opcional)" className="w-full px-4 py-3 rounded-xl border text-[12px] outline-none resize-none focus:border-brand-panel font-medium transition-colors shadow-sm" style={solidCardStyle} />
                    <button type="button" onClick={() => handleAddStep(selectedTask.id)} className="w-full py-3 rounded-xl bg-brand-panel text-white text-[13px] font-extrabold shadow-md cursor-pointer hover:opacity-90 active:scale-95 transition-transform">+ Adicionar Etapa</button>
                  </div>
                </div>

                {/* 🚀 CHAT DA TAREFA APRIMORADO */}
                <div className="space-y-4 pt-4 border-t" style={{ borderColor: 'color-mix(in srgb, var(--border-input) 40%, transparent)' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest opacity-50 block">Diário & Atualizações</span>
                    <label className="flex items-center space-x-2 text-[11px] font-extrabold cursor-pointer text-amber-500 hover:opacity-80 transition-opacity">
                      <input type="checkbox" checked={isDifficultyAlert} onChange={(e) => setIsDifficultyAlert(e.target.checked)} className="w-4 h-4 rounded accent-amber-500 cursor-pointer shadow-sm" /><span>Sinalizar Dificuldade</span>
                    </label>
                  </div>
                  
                  <div className="space-y-3 pr-2">
                    {selectedTask.chat.map(c => (
                      <div key={c.id} className={`p-4 rounded-2xl border space-y-2 shadow-sm ${c.isAlert ? 'border-amber-500/40 bg-amber-500/5' : ''}`} style={!c.isAlert ? solidInputStyle : undefined}>
                        <div className="flex justify-between text-[10px] opacity-65 font-bold uppercase tracking-wider">
                          <span className={c.isAlert ? 'text-amber-500' : ''}>{c.author} {c.isAlert ? '• ⚠️ Alerta' : ''}</span>
                          <span className="flex items-center"><Clock className="w-3 h-3 mr-1"/>{c.time}</span>
                        </div>
                        <div className="leading-relaxed break-words text-[13px] font-medium whitespace-pre-wrap">{formatLinks(c.text)}</div>
                      </div>
                    ))}
                    {selectedTask.chat.length === 0 && <p className="text-[12px] opacity-40 py-4 text-center font-bold">Nenhuma atualização registrada nesta tarefa.</p>}
                    <div ref={taskChatEndRef} />
                  </div>

                  {/* INPUT ELÁSTICO COMO NO CHAT CORPORATIVO */}
                  <form className="flex items-end space-x-3" onSubmit={(e) => { e.preventDefault(); handleSendChat(selectedTask.id); }}>
                    <textarea 
                      ref={inputFieldRef}
                      value={chatInput} 
                      onChange={handleInputResize}
                      onKeyDown={handleKeyDown}
                      rows={1}
                      placeholder={isDifficultyAlert ? 'Descreva o que o impede de avançar...' : 'Registar andamento da demanda...'} 
                      className="flex-1 px-5 py-3.5 rounded-3xl border text-[14px] font-bold outline-none focus:border-brand-panel transition-colors shadow-sm resize-none overflow-y-auto custom-scrollbar leading-tight" 
                      style={{ minHeight: '52px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-main)' }}
                    />
                    <button type="submit" className="p-4 rounded-full bg-brand-panel text-white cursor-pointer shadow-md hover:opacity-90 active:scale-95 transition-transform flex items-center justify-center flex-shrink-0 mb-0.5">
                      <Send className="w-5 h-5 ml-0.5" />
                    </button>
                  </form>
                </div>
              </div>

              <div className="p-5 md:p-6 pb-6 border-t flex flex-col sm:flex-row items-center justify-between text-xs gap-3 sm:gap-0 flex-shrink-0" style={{ borderColor: 'color-mix(in srgb, var(--border-input) 40%, transparent)' }}>
                <span className="opacity-60 text-[11px] font-extrabold uppercase tracking-widest text-center sm:text-left w-full sm:w-auto">Prazo: {selectedTask.dueDate} às {selectedTask.dueTime}</span>
                {canEditTask && (
                  <button onClick={() => confirmDeleteTask(selectedTask.id, selectedTask.title)} className="w-full sm:w-auto px-5 py-3 rounded-xl text-red-500 hover:text-red-600 hover:bg-red-500/10 font-bold flex items-center justify-center space-x-1.5 cursor-pointer transition-colors">
                    <Trash2 className="w-4 h-4" />
                    <span>Excluir tarefa permanentemente</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* MODAL CRIAR TAREFA Z-[999] */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-[2.5rem] border shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" style={solidCardStyle}>
            <div className="px-6 md:px-8 py-6 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-input)' }}>
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-panel">Novo Registro</span>
                <h3 className="font-extrabold text-lg md:text-xl mt-1">Nova Demanda ({currentUser?.setor})</h3>
              </div>
              <button onClick={() => setIsCreateModalOpen(false)} className="p-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleCreateTask} className="p-6 md:p-8 overflow-y-auto custom-scrollbar space-y-6">
              <div>
                <label className="text-[11px] font-extrabold uppercase tracking-widest opacity-60 block mb-2">Título da Demanda *</label>
                <input type="text" required value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Ex: Verificar servidor X..." className="w-full px-4 py-3.5 rounded-2xl border text-[13px] font-bold outline-none focus:border-brand-panel transition-colors" style={solidInputStyle} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-extrabold uppercase tracking-widest opacity-60 block mb-2">Categoria</label>
                  <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="w-full px-4 py-3.5 rounded-2xl border text-[13px] font-bold outline-none cursor-pointer focus:border-brand-panel transition-colors" style={solidInputStyle}>
                    {taskCategories.map(cat => <option key={cat.id} value={cat.nome}>{cat.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-extrabold uppercase tracking-widest opacity-60 block mb-2">Prioridade</label>
                  <select value={newPriority} onChange={(e: any) => setNewPriority(e.target.value)} className="w-full px-4 py-3.5 rounded-2xl border text-[13px] font-bold outline-none cursor-pointer focus:border-brand-panel transition-colors" style={solidInputStyle}>
                    <option value="Normal">Normal</option><option value="Urgente">🔥 Urgente</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-extrabold uppercase tracking-widest opacity-60 block mb-2">Observações (opcional)</label>
                <textarea rows={3} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Contexto técnico ou orientações..." className="w-full px-4 py-3.5 rounded-2xl border text-[13px] outline-none resize-none font-medium focus:border-brand-panel transition-colors" style={solidInputStyle} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-[11px] font-extrabold uppercase tracking-widest opacity-60 block mb-2">Responsável</label>
                  <select value={newAssignee} onChange={(e) => setNewAssignee(e.target.value)} className="w-full px-3 py-3 rounded-2xl border text-[12px] font-bold text-brand-panel outline-none cursor-pointer focus:border-brand-panel transition-colors" style={solidInputStyle}>
                    {allowedAssignees.map(a => ( <option key={a.value} value={a.value}>{a.label}</option> ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-extrabold uppercase tracking-widest opacity-60 block mb-2">Data Limite</label>
                  <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="w-full px-3 py-3 rounded-2xl border text-[12px] font-bold outline-none cursor-pointer focus:border-brand-panel transition-colors" style={solidInputStyle} />
                </div>
                <div>
                  <label className="text-[11px] font-extrabold uppercase tracking-widest opacity-60 block mb-2">Horário</label>
                  <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="w-full px-3 py-3 rounded-2xl border text-[12px] font-bold outline-none focus:border-brand-panel transition-colors" style={solidInputStyle} />
                </div>
              </div>

              <label className="flex items-center justify-between p-4 rounded-2xl border cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/5" style={solidInputStyle}>
                <div className="flex items-center space-x-3"><Repeat className="w-5 h-5 text-brand-panel" /><div><span className="text-[13px] font-bold block">Classificar como Rotina</span><span className="text-[10px] opacity-60 font-semibold mt-0.5">Visível no filtro inteligente de Rotinas.</span></div></div>
                <input type="checkbox" checked={newIsRoutine} onChange={(e) => setNewIsRoutine(e.target.checked)} className="w-5 h-5 rounded border-gray-300 accent-brand-panel cursor-pointer shadow-sm" />
              </label>
              
              <div className="space-y-4 pt-4 border-t" style={{ borderColor: 'var(--border-input)' }}>
                <label className="text-[11px] font-extrabold uppercase tracking-widest opacity-60 block">Checklist Inicial ({newSteps.length})</label>
                {newSteps.length > 0 && (
                  <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                    {newSteps.map((st, i) => ( 
                      <div key={i} className="px-4 py-3 rounded-2xl border flex justify-between items-start shadow-sm" style={solidInputStyle}>
                        <div className="flex flex-col">
                          <span className="text-[12px] font-bold">{i + 1}. {st.text}</span>
                          {st.note && <span className="text-[10px] opacity-60 truncate max-w-[220px] mt-1 font-medium">{st.note}</span>}
                        </div>
                        <button type="button" onClick={() => setNewSteps(prev => prev.filter((_, idx) => idx !== i))} className="p-1 rounded-lg opacity-50 hover:opacity-100 hover:bg-red-500/10 text-red-500 cursor-pointer transition-colors"><X className="w-4 h-4" /></button>
                      </div> 
                    ))}
                  </div>
                )}
                <div className="p-4 border rounded-2xl space-y-3" style={solidInputStyle}>
                  <input type="text" value={newStepText} onChange={(e) => setNewStepText(e.target.value)} placeholder="Título da etapa..." className="w-full px-4 py-3 rounded-xl border text-[13px] font-bold outline-none focus:border-brand-panel transition-colors" style={solidCardStyle} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTempStep(); } }} />
                  <textarea rows={1} value={newStepNote} onChange={(e) => setNewStepNote(e.target.value)} placeholder="Descrição (opcional)..." className="w-full px-4 py-3 rounded-xl border text-[12px] font-medium outline-none resize-none focus:border-brand-panel transition-colors" style={solidCardStyle} />
                  <button type="button" onClick={handleAddTempStep} className="w-full py-3 rounded-xl bg-brand-panel text-white text-[13px] font-extrabold cursor-pointer shadow-md hover:opacity-90 active:scale-95 transition-transform">+ Adicionar ao Checklist</button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3 pt-6 border-t" style={{ borderColor: 'var(--border-input)' }}>
                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="w-full sm:w-auto px-6 py-3.5 rounded-xl border text-[13px] font-extrabold cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" style={{ borderColor: 'var(--border-input)' }}>Cancelar</button>
                <button type="submit" disabled={isSaving} className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-brand-panel text-white text-[13px] font-extrabold cursor-pointer hover:opacity-90 active:scale-95 transition-transform shadow-lg flex items-center justify-center space-x-2">
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{isSaving ? 'Agendando...' : 'Salvar Tarefa'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: CONFIRMAÇÃO DE EXCLUSÃO Z-[999] */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-full max-w-sm rounded-[2.5rem] border shadow-2xl overflow-hidden" style={solidCardStyle}>
            <div className="px-6 md:px-8 py-6 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-input)' }}>
              <div className="flex items-center space-x-2 text-red-500"><AlertTriangle className="w-6 h-6" /><h3 className="font-extrabold text-base md:text-lg">{confirmModal.title}</h3></div>
              <button onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} className="p-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 md:p-8"><p className="text-[13px] font-semibold opacity-80 leading-relaxed text-center">{confirmModal.message}</p></div>
            <div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3 px-6 md:px-8 py-5 border-t" style={{ borderColor: 'var(--border-input)' }}>
              <button onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} className="w-full sm:w-auto px-6 py-3.5 rounded-xl border text-[13px] font-extrabold cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" style={{ borderColor: 'var(--border-input)' }}>Cancelar</button>
              <button onClick={confirmModal.onConfirm} className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-[13px] font-extrabold cursor-pointer transition-colors shadow-md active:scale-95">Sim, Excluir</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}