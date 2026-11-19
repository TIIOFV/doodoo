'use client';
import { useSignOut } from '@/app/lib/useSignOut';

import { isTaskOverdue,occurrenceId,requireResult,searchKey,taskDeadline } from '@/app/lib/domain';
import { atomicWrites } from '@/app/lib/environment';
import { formatPortalDateTime, serverNowDate, serverNowIso } from '@/app/lib/serverClock';

import { Button,inputStyle,panelStyle,sidebarStyle } from '@/app/components/ui';
import { useHydrated } from '@/app/lib/useHydrated';
import ModalShell from '../ModalShell';
import { useDialogAction } from '../useDialogAction';
import { useRecordActions } from '../useRecordActions';
import { useTaskMotion } from './useTaskMotion';
import './task-workspace.css';

import { useCallback,useEffect,useMemo,useRef,useState } from 'react';

import { AlertTriangle,ArrowLeft,Bell,Calendar,CheckCircle2,CheckSquare,Clock,Edit2,Flame,MessageSquare,ChevronRight,FileText,ListChecks,CircleDot,Loader2,LogOut,Plus,Repeat,Search,Send,Shield,Star,Sun,Tag,Trash2,X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type RoleType = 'administrador' | 'gestor' | 'coordenador' | 'supervisor' | 'analista' | 'colaborador';

interface DBProfile { id: string; user_id: string; nome: string; email: string; cargo: RoleType; setor: string; avatar_url?: string; }
interface SubStep { id: number; text: string; note?: string; done: boolean; }
interface ChatComment { id: number | string; author: string; authorId?: string; text: string; time: string; isAlert?: boolean; editedAt?: string; }

interface TaskItem {
  creatorId?:string; id: string; title: string; description: string; category: string; priority: 'Normal' | 'Urgente'; status: 'pendente' | 'andamento' | 'bloqueado' | 'concluida';
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


interface DbTask { usuario_id?:string; id: string; titulo: string; descricao?: string; categoria?: string; prioridade?: string; status: TaskItem['status']; importante?: boolean; meu_dia?: boolean; rotina?: boolean; responsavel?: string; setor?: string; atribuido_por?: string; data_limite?: string; hora_limite?: string; created_at?: string; etapas?: SubStep[]; chat?: ChatComment[]; metadata?: Record<string, unknown>; }
const mapDbToTask = (dbTask: DbTask): TaskItem => ({
  creatorId:dbTask.usuario_id, id: dbTask.id, title: dbTask.titulo || 'Sem título', description: dbTask.descricao || '', category: dbTask.categoria || 'Geral',
  priority: dbTask.prioridade === 'Urgente' ? 'Urgente' : 'Normal', status: dbTask.status || 'pendente', important: Boolean(dbTask.importante),
  myDay: Boolean(dbTask.meu_dia), isRoutine: Boolean(dbTask.rotina), assignee: dbTask.responsavel || '', sector: dbTask.setor || 'Geral',
  assignedBy: dbTask.atribuido_por || 'Sistema', dueDate: dbTask.data_limite || '', dueTime: dbTask.hora_limite || '17:00',
  createdAt: dbTask.created_at || '', steps: Array.isArray(dbTask.etapas) ? dbTask.etapas : [], chat: Array.isArray(dbTask.chat) ? dbTask.chat : []
});

const formatLinks = (text: string) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.split(urlRegex).map((part, i) =>
    urlRegex.test(part) ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80 transition-opacity break-words text-brand-panel">{part}</a> : part
  );
};

export default function TarefasPage() {
  const dialogAction = useDialogAction();
  const {root:taskMotionRoot,switchView:switchTaskView} = useTaskMotion();
  const recordActions = useRecordActions();
  const isMounted = useHydrated();

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
  const [selectedTaskId, setTaskSelection] = useState<string | null>(null);

  const [detailTab, setDetailTab] = useState<'overview' | 'updates'>('overview');
  const [editingDeadline,setEditingDeadline]=useState(false);
  const [deadlineDate,setDeadlineDate]=useState('');
  const [deadlineTime,setDeadlineTime]=useState('17:00');
  const [isAddingStep, setIsAddingStep] = useState(false);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
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
  const [editingComment, setEditingComment] = useState<{taskId: string; id: string | number; text: string; original: string} | null>(null);
  const [isDifficultyAlert, setIsDifficultyAlert] = useState(false);
  const taskChatEndRef = useRef<HTMLDivElement>(null);
  const inputFieldRef = useRef<HTMLTextAreaElement>(null);

  const setSelectedTaskId = (id: React.SetStateAction<string|null>) => { setTaskSelection(id);setEditingDeadline(false); setIsEditingTask(false); setEditingStepId(null); setEditingComment(null); setChatInput(''); setIsDifficultyAlert(false); setIsAddingStep(false); setStepInput(''); setStepNoteInput(''); setDetailTab('overview'); };
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const glassContainerStyle = panelStyle;
  const glassSidebarStyle = sidebarStyle;
  const glassItemStyle = panelStyle;
  const solidCardStyle = panelStyle;
  const solidInputStyle = inputStyle;

  const notifyBell = useCallback((title: string, desc: string) => {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('doodoo:notify', { detail: { title, desc } }));
  }, []);

  const handleForceLogout = useSignOut();

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


        if (perfilAtual) {
          setCurrentUser(perfilAtual);
          setNewAssignee(perfilAtual.nome);

          const [equipeRes, tarefasRes, categoriasRes] = await Promise.all([
            supabase.from('doodoo_perfis').select('*').eq('setor', perfilAtual.setor).eq('status', 'ativo'),
            supabase.from('doodoo_tarefas').select('*').eq('setor', perfilAtual.setor).order('created_at', { ascending: false }),
            supabase.from('doodoo_tarefas_categorias').select('*').order('created_at', { ascending: true })
          ]);

          if (equipeRes.data) setTeamMembers(equipeRes.data as DBProfile[]);
          if (equipeRes.error || tarefasRes.error || categoriasRes.error) throw equipeRes.error || tarefasRes.error || categoriasRes.error;
          if (tarefasRes.data) setTasks(tarefasRes.data.map(mapDbToTask));
          setSelectedTaskId(new URLSearchParams(window.location.search).get('taskId'));
      const locationParams=new URLSearchParams(window.location.search);
      const list=locationParams.get('list');
      if(list==='meu-dia'||list==='todas'||list==='importante'||list==='rotinas'||list==='concluidas')setSmartList(list);
      if(locationParams.get('queue')==='delegadas')setViewMode('delegadas');
          if (new URLSearchParams(window.location.search).get('tab') === 'updates') setDetailTab('updates');
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
          const incoming = mapDbToTask(payload.new as unknown as DbTask);
          if (incoming.sector !== currentUser.setor) return;
          setTasks(prev=>prev.some(t=>t.id===incoming.id)?prev.map(t=>t.id===incoming.id?incoming:t):[incoming,...prev]);

        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'doodoo_tarefas' }, (payload) => {
          const updated = mapDbToTask(payload.new as unknown as DbTask);
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
        const q = searchKey(searchQuery);
        return (searchKey(task.title).includes(q) || searchKey(task.description).includes(q) || searchKey(task.category).includes(q) || searchKey(task.assignee).includes(q));
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
    const openFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      setSelectedTaskId(params.get('taskId'));
      const locationParams=new URLSearchParams(window.location.search);
      const list=locationParams.get('list');
      if(list==='meu-dia'||list==='todas'||list==='importante'||list==='rotinas'||list==='concluidas')setSmartList(list);
      if(locationParams.get('queue')==='delegadas')setViewMode('delegadas');
      if (params.get('tab') === 'updates') setDetailTab('updates');
    };
    const onOpen = (event: Event) => {
      const { taskId, tab } = (event as CustomEvent<{ taskId: string | null; tab?: string }>).detail;
      setSelectedTaskId(taskId);
      if (tab === 'updates') setDetailTab('updates');
    };
    window.addEventListener('popstate', openFromUrl);
    window.addEventListener('doodoo:open_task', onOpen);
    return () => { window.removeEventListener('popstate', openFromUrl); window.removeEventListener('doodoo:open_task', onOpen); };
  }, []);
  useEffect(() => { if (selectedTask?.id) detailHeadingRef.current?.focus({ preventScroll: true }); }, [selectedTask?.id]);
  const lastChat = useRef({ taskId: '', count: 0 });
  useEffect(() => {
    if (detailTab === 'updates' && lastChat.current.taskId === selectedTask?.id && selectedTask.chat.length > lastChat.current.count) taskChatEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    lastChat.current = { taskId: selectedTask?.id || '', count: selectedTask?.chat.length || 0 };
  }, [selectedTask?.id, selectedTask?.chat.length, detailTab]);
  const openTask = (id: string) => { void switchTaskView(() => setSelectedTaskId(id), 'open'); };
  const closeTask = () => { void switchTaskView(() => {
    const id = selectedTaskId;
    setSelectedTaskId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('taskId'); url.searchParams.delete('tab');
    window.history.replaceState(null, '', url.pathname + url.search);
    requestAnimationFrame(() => {
      const card = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-task-id]') || []).find(el => el.dataset.taskId === id);
      (card || listRef.current?.querySelector<HTMLInputElement>('input[type="text"]'))?.focus({ preventScroll: true });
    });
  }, 'close'); };

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

    const tempId = crypto.randomUUID();
    const optimisticTask: TaskItem = {
      id: tempId, title: newTitle.trim(), description: newDesc.trim() || 'Sem observações adicionais.', category: newCategory, priority: newPriority, status: 'pendente', important: isUrgent,
      myDay: true, isRoutine: newIsRoutine, assignee: target, sector: currentUser.setor, assignedBy: currentUser.nome, dueDate: formattedDate, dueTime: newTime, steps: stepsPayload, chat: [], createdAt: new Date().toISOString()
    };

    setTasks(prev => [optimisticTask, ...prev]); setSelectedTaskId(tempId);

    try {
      const { data, error } = await supabase.from('doodoo_tarefas').insert([{
          id: tempId, usuario_id: currentUser.user_id, titulo: optimisticTask.title, descricao: optimisticTask.description, categoria: optimisticTask.category, prioridade: optimisticTask.priority, status: 'pendente',
          importante: optimisticTask.important, meu_dia: true, rotina: optimisticTask.isRoutine, responsavel: target, setor: currentUser.setor, atribuido_por: currentUser.nome,
          data_limite: formattedDate, hora_limite: newTime, etapas: stepsPayload, chat: [], metadata: {}
        }]).select().single();

      if (data && !error) {
        const realTask = mapDbToTask(data);
        setTasks(prev=>[realTask,...prev.filter(t=>t.id!==tempId&&t.id!==realTask.id)]);
        setSelectedTaskId(prev => prev === tempId ? realTask.id : prev);
        setIsCreateModalOpen(false);
        if (target !== currentUser.nome) notifyBell('Tarefa Atribuída', `Atribuiu "${realTask.title}" para ${target}.`);
        else notifyBell('Tarefa Criada', `Adicionada à sua fila.`);
      } else {
        setTasks(prev => prev.filter(t => t.id !== tempId)); setSelectedTaskId(null); notifyBell('Erro', 'Não foi possível gravar.');
      }
    } catch (error) {
      setTasks(prev => prev.filter(t => t.id !== tempId));
      setSelectedTaskId(null);
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  // Read/compare/write JSON collections so concurrent checklists/comments do not silently overwrite.
  const mutateTask = async (id: string, patch: (live: DbTask) => Partial<DbTask>) => recordActions.run(id, async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const live = requireResult(await supabase.from('doodoo_tarefas').select('*').eq('id', id).eq('setor', currentUser?.setor).single()) as DbTask;
      const values = patch(live);
      let query = supabase.from('doodoo_tarefas').update(values).eq('id', id).eq('status', live.status);
      for (const field of ['etapas', 'chat'] as const) if (values[field]) query = live[field] == null ? query.is(field,null) : query.filter(field,'eq',JSON.stringify(live[field]));
      const result = await query.select('*').maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) continue;
      const updated = mapDbToTask(result.data);
      setTasks(prev => prev.map(task => task.id === id ? updated : task));
      return updated;
    }
    throw new Error('A tarefa mudou em outra sessão. Atualize e tente novamente.');
  });
  const saveDeadline=async()=>{
    if(!currentUser||!selectedTask||selectedTask.creatorId!==currentUser.user_id||!deadlineDate||!deadlineTime)return;
    const actorId=currentUser.user_id;
    const id=selectedTask.id;
    const updated=await mutateTask(id,live=>{
      if(live.usuario_id!==actorId)throw new Error('Somente quem criou a tarefa pode alterar o prazo.');
      return {data_limite:deadlineDate.split('-').reverse().join('/'),hora_limite:deadlineTime};
    });
    if(updated){setEditingDeadline(false);notifyBell('Prazo atualizado','A nova data de entrega foi salva.');}
  };
  const handleSaveTaskInfo = async () => {
    if (!selectedTask || !editTitle.trim() || !canEditTask) return;
    if (await mutateTask(selectedTask.id, () => ({ titulo: editTitle.trim(), descricao: editDesc.trim() }))) {
      setIsEditingTask(false); notifyBell('Tarefa Atualizada', 'Título e descrição salvos com sucesso.');
    }
  };
  const completeTaskAndCloneRoutine = async (taskId: string, finalSteps?: SubStep[]) => {
    if (atomicWrites) { await completeRoutineAtomically(taskId, finalSteps); return; }
    const task = await mutateTask(taskId, live => ({ status: 'concluida', etapas: finalSteps || live.etapas || [] }));
    if (!task?.isRoutine || !currentUser) return;
    await recordActions.run('routine:' + taskId, async () => {
      const id = await occurrenceId(taskId);
      const legacy = await supabase.from('doodoo_tarefas').select('*').eq('metadata->>clonedFrom',taskId).limit(1).maybeSingle();
      if(legacy.error)throw legacy.error;if(legacy.data)return;
      const existing = await supabase.from('doodoo_tarefas').select('*').eq('id', id).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) return;
      const next = taskDeadline(task.dueDate, task.dueTime) || new Date(); next.setDate(next.getDate() + 7);
      const date = [String(next.getDate()).padStart(2,'0'), String(next.getMonth()+1).padStart(2,'0'), next.getFullYear()].join('/');
      const payload = { id, usuario_id: currentUser.user_id, titulo: task.title, descricao: task.description, categoria: task.category, prioridade: task.priority, status: 'pendente', importante: task.important, meu_dia: false, rotina: true, responsavel: task.assignee, setor: task.sector, atribuido_por: task.assignedBy, data_limite: date, hora_limite: task.dueTime, etapas: task.steps.map((step, i) => ({ ...step, id: i+1, done: false })), chat: [], metadata: { clonedFrom: taskId } };
      const result = await supabase.from('doodoo_tarefas').insert(payload).select('*').single();
      if (result.error && result.error.code !== '23505') throw new Error('Tarefa concluída, mas a próxima ocorrência não foi criada. Use Verificar próxima ocorrência para tentar novamente.');
      if (result.data) { const created = mapDbToTask(result.data); setTasks(prev => prev.some(t => t.id === id) ? prev : [created,...prev]); }
      notifyBell('Rotina Renovada', 'Próxima ocorrência: ' + date);
    });
  };
  const completeRoutineAtomically = async (taskId:string, steps?:SubStep[], expectedSteps?:SubStep[]) => recordActions.run(taskId,async()=>{
    const result=requireResult(await supabase.rpc('doodoo_complete_routine',{p_task_id:taskId,p_final_steps:steps??null,p_expected_steps:expectedSteps??null})) as {task:DbTask;next_task:DbTask|null};
    const saved=[result.task,...(result.next_task?[result.next_task]:[])].map(mapDbToTask);
    setTasks(prev=>[...saved,...prev.filter(t=>!saved.some(s=>s.id===t.id))]);
    if(result.next_task)notifyBell('Rotina Renovada','Conclusão e próxima ocorrência confirmadas juntas.');
    return result;
  });
  const changeTaskStatus = async (taskId: string, status: TaskItem['status'], event?: React.MouseEvent) => {
    event?.stopPropagation();
    if (status === 'concluida' && tasks.find(t => t.id === taskId)?.isRoutine) await completeTaskAndCloneRoutine(taskId);
    else await mutateTask(taskId, () => ({ status }));
  };
  const toggleTaskFlag = async (id: string, field: 'important' | 'myDay' | 'isRoutine', event?: React.MouseEvent) => {
    event?.stopPropagation(); const column = { important: 'importante', myDay: 'meu_dia', isRoutine: 'rotina' }[field] as 'importante' | 'meu_dia' | 'rotina';
    await mutateTask(id, live => ({ [column]: !live[column] }));
  };
  const updateTaskMetadata = async (id: string, field: 'priority' | 'assignee', value: string) => {
    if (!canEditTask) return;
    await mutateTask(id, () => field === 'priority' ? { prioridade: value } : { responsavel: value });
  };
  const toggleSubStep = async (id: string, stepId: number) => {
    if(atomicWrites && tasks.find(t=>t.id===id)?.isRoutine){
      try{
        const live=requireResult(await supabase.from('doodoo_tarefas').select('*').eq('id',id).single()) as DbTask;
        const steps=(live.etapas||[]).map(step=>step.id===stepId?{...step,done:!step.done}:step);
        await completeRoutineAtomically(id,steps,live.etapas||[]);
      }catch{notifyBell('Rotina não atualizada','Não foi possível consultar a versão atual. Tente novamente.');}
      return;
    }
    const updated = await mutateTask(id, live => {
      const steps = (live.etapas || []).map(step => step.id === stepId ? { ...step, done: !step.done } : step);
      return { etapas: steps, status: steps.every(step => step.done) ? 'concluida' : steps.some(step => step.done) ? 'andamento' : 'pendente' };
    });
    if (updated?.isRoutine && updated.status === 'concluida') await completeTaskAndCloneRoutine(id, updated.steps);
  };
  const handleAddStep = async (id: string) => {
    if (!stepInput.trim()) return;
    const step = { id: Date.now(), text: stepInput.trim(), note: stepNoteInput.trim(), done: false };
    if (await mutateTask(id, live => ({ etapas: [...(live.etapas || []),step] }))) { setStepInput(''); setStepNoteInput(''); setIsAddingStep(false); }
  };
  const handleSaveStepEdit = async (id: string, stepId: number) => {
    if (editStepText.trim() && await mutateTask(id, live => ({ etapas: (live.etapas || []).map(step => step.id === stepId ? { ...step, text: editStepText.trim(), note: editStepNote.trim() } : step) }))) setEditingStepId(null);
  };
  const handleDeleteStep = async (id: string, stepId: number) => { await mutateTask(id, live => ({ etapas: (live.etapas || []).filter(step => step.id !== stepId) })); };

  // 🚀 LÓGICA DE TEXTAREA AUTO-EXPANSÍVEL PARA O CHAT DA TAREFA
  const handleInputResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setChatInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (chatInput.trim() && selectedTask) {
        handleSendChat(selectedTask.id);
      }
    }
  };

  const handleSendChat = async (taskId: string) => {
    if (!chatInput.trim() || !currentUser || !isMounted || recordActions.pending > 0) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const formattedTime = formatPortalDateTime(serverNowDate());

    const msg: ChatComment = { id: crypto.randomUUID(), author: currentUser.nome, authorId: currentUser.user_id, text: chatInput.trim(), time: formattedTime, isAlert: isDifficultyAlert };


    if (await mutateTask(taskId, live => ({ chat: [...(live.chat || []),msg] }))) {
      setChatInput(''); setIsDifficultyAlert(false);
      if (inputFieldRef.current) inputFieldRef.current.style.height = 'auto';
    }
  };

  const saveCommentEdit = async () => {
    if (!editingComment?.text.trim() || !currentUser) return;
    const edit = editingComment;
    if(atomicWrites){
      const saved=await recordActions.run(edit.taskId,async()=>requireResult(await supabase.rpc('doodoo_update_task_comment',{p_task_id:edit.taskId,p_comment_id:String(edit.id),p_action:'edit',p_text:edit.text.trim(),p_expected_text:edit.original})) as DbTask);
      if(saved){setTasks(prev=>prev.map(t=>t.id===saved.id?mapDbToTask(saved):t));setEditingComment(null);}return;
    }
    const saved = await mutateTask(edit.taskId, live => {
      const comment = live.chat?.find(c => c.id === edit.id);
      if (!comment || comment.authorId !== currentUser.user_id) throw new Error('A mensagem foi removida ou você não é o autor.');
      if (comment.text !== edit.original) throw new Error('Esta mensagem mudou em outra sessão. Cancele a edição e revise a versão atual.');
      return {chat: (live.chat || []).map(c => c.id === edit.id ? {...c, text: edit.text.trim(), editedAt: serverNowIso()} : c)};
    });
    if (saved) setEditingComment(null);
  };
  const deleteComment = (taskId: string, comment: ChatComment) => {
    if (comment.authorId !== currentUser?.user_id) return;
    setConfirmModal({isOpen: true, title: 'Excluir atualização', message: 'Excluir esta mensagem do diário? Esta ação não pode ser desfeita.', onConfirm: async () => {
      if(atomicWrites){
        const saved=await recordActions.run(taskId,async()=>requireResult(await supabase.rpc('doodoo_update_task_comment',{p_task_id:taskId,p_comment_id:String(comment.id),p_action:'delete',p_text:null,p_expected_text:comment.text})) as DbTask);
        if(saved){setTasks(prev=>prev.map(t=>t.id===saved.id?mapDbToTask(saved):t));setConfirmModal(prev=>({...prev,isOpen:false}));setEditingComment(null);}return;
      }
      const saved = await mutateTask(taskId, live => {
        const latest = live.chat?.find(c => c.id === comment.id);
        if (!latest || latest.authorId !== currentUser?.user_id) throw new Error('A mensagem foi removida ou você não é o autor.');
        if (latest.text !== comment.text) throw new Error('A mensagem foi editada em outra sessão. Revise antes de excluir.');
        return {chat: (live.chat || []).filter(c => c.id !== comment.id)};
      });
      if (saved) {setConfirmModal(prev => ({...prev,isOpen:false}));setEditingComment(null);}
    }});
  };

  const handleSendReminder = async (task: TaskItem) => {
    if (!currentUser || !isMounted) return;

    const formattedTime = formatPortalDateTime(serverNowDate());

    const reminder: ChatComment = { id: crypto.randomUUID(), author: currentUser.nome, authorId: currentUser.user_id, text: `🔔 Solicitou posicionamento / atualização de status para ${task.assignee}.`, time: formattedTime, isAlert: true };
    if(await mutateTask(task.id,live=>({chat:[...(live.chat||[]),reminder],metadata:{...(live.metadata||{}),ultimo_evento:'cobranca',autor_evento:currentUser.nome}})))notifyBell('Cobrança enviada','A solicitação foi registrada no histórico da tarefa.');

  };

  const confirmDeleteTask = (id: string, title: string) => {
    setConfirmModal({
      isOpen: true, title: 'Excluir Tarefa', message: `Tem certeza que deseja excluir permanentemente "${title}"? O histórico será apagado.`,
      onConfirm: async () => {

        requireResult(await supabase.from('doodoo_tarefas').delete().eq('id', id).select('*').single());
        setTasks(prev => prev.filter(t => t.id !== id)); setSelectedTaskId(null); setConfirmModal(prev => ({ ...prev, isOpen: false }));

        notifyBell('Tarefa Excluída', 'A demanda foi removida com sucesso.');
      }
    });
  };

  const formatCreatedAt = (dateString: string) => {
    if (!dateString) return 'Data desconhecida';
    return formatPortalDateTime(dateString);
  };

  if (isLoading || !isMounted) return <div className="w-full h-full flex flex-col items-center justify-center"><Loader2 className="w-10 h-10 animate-spin opacity-70 text-brand-panel" /></div>;
  if (authError || !currentUser) return <div className="w-full h-full flex flex-col items-center justify-center"><button onClick={handleForceLogout} className="px-6 py-3 rounded-2xl bg-brand-panel text-white font-medium"><LogOut className="w-4 h-4 mr-2 inline" />Sair</button></div>;

  return (
    <div ref={taskMotionRoot} aria-busy={recordActions.pending > 0} className={`task-workspace w-full h-full min-h-0 min-w-0 flex-1 flex flex-col animate-in fade-in duration-300 relative z-0`}>

      <div className="w-full flex-1 flex flex-col lg:flex-row rounded-xl rounded-bl-none rounded-br-none md:rounded-xl md:rounded-xl border-t border-l-0 border-r-0 border-b-0 md:border overflow-hidden relative z-10" style={glassContainerStyle}>

        {/* ==========================================================
            COLUNA 1: MENU DE LISTAS E ALTERNÂNCIA
            ========================================================== */}
        {!selectedTaskId && (
          <div className="lg:hidden flex flex-col border-b flex-shrink-0" style={{ borderColor: 'var(--border-input)' }}>
            <div className="flex items-center justify-between p-5 md:p-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-brand-panel flex items-center justify-center text-white shadow-sm">
                  <CheckSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-[15px] tracking-tight">Fila de Tarefas</h3>
                  <div className="flex items-center space-x-1.5 opacity-75">
                    <Shield className="w-3 h-3 text-brand-panel" />
                    <span className="text-xs font-medium uppercase tracking-widest">{currentUser.nome}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 pb-4">
              <div className="grid grid-cols-2 gap-2 p-1.5 rounded-xl border" style={glassItemStyle}>
                <button onClick={() => { setViewMode('minha'); setSelectedTaskId(null); }} className={`py-2.5 rounded-lg text-xs font-medium transition-all cursor-pointer shadow-sm ${viewMode === 'minha' ? 'bg-brand-panel text-white' : 'opacity-70 hover:opacity-100'}`}>Minhas</button>
                <button onClick={() => { setViewMode('delegadas'); setSelectedTaskId(null); }} className={`py-2.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center justify-center space-x-2 shadow-sm ${viewMode === 'delegadas' ? 'bg-brand-panel text-white' : 'opacity-70 hover:opacity-100'}`}>
                  <span>Delegadas</span>
                  {delegatedCount > 0 && <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${viewMode === 'delegadas' ? 'bg-white/20' : 'bg-black/10 dark:bg-white/10'}`}>{delegatedCount}</span>}
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
                <button key={list.id} onClick={() => setSmartList(list.id as typeof smartList)} className={`px-4 py-2.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition-transform active:scale-95 shadow-sm flex items-center space-x-2 ${smartList === list.id ? 'bg-brand-panel text-white' : 'border border-[var(--border-input)] opacity-70 hover:opacity-100'}`} style={smartList !== list.id ? { backgroundColor: 'var(--bg-card)' } : {}}>
                  <list.icon className="w-4 h-4" />
                  <span>{list.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="hidden lg:flex flex-col w-[280px] xl:w-[320px] flex-shrink-0" style={glassSidebarStyle}>
          <div className="p-6 md:p-8 space-y-6 flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
            <div className="space-y-3 pb-4 border-b" style={{ borderColor: 'var(--border-input)' }}>
              <div>
                <h3 className="font-semibold text-base tracking-tight">Tarefas & Rotinas</h3>
                <p className="text-xs font-medium uppercase tracking-widest text-brand-panel mt-1">Setor {currentUser.setor}</p>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-2xl border" style={glassItemStyle}>
                <div className="w-9 h-9 rounded-xl bg-brand-panel text-white font-semibold flex items-center justify-center text-[12px] flex-shrink-0 shadow-sm">{getInitials(currentUser.nome)}</div>
                <div className="flex flex-col overflow-hidden"><span className="truncate w-full text-xs font-semibold leading-tight">{currentUser.nome}</span><span className="text-xs font-medium opacity-75 uppercase tracking-wider">{currentUser.cargo}</span></div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 p-1.5 rounded-xl border shadow-sm" style={glassItemStyle}>
              <button onClick={() => { setViewMode('minha'); setSelectedTaskId(null); }} className={`py-2.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${viewMode === 'minha' ? 'bg-brand-panel text-white shadow-sm' : 'opacity-75 hover:opacity-100'}`}>Minha Fila</button>
              <button onClick={() => { setViewMode('delegadas'); setSelectedTaskId(null); }} className={`py-2.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center justify-center space-x-1.5 ${viewMode === 'delegadas' ? 'bg-brand-panel text-white shadow-sm' : 'opacity-75 hover:opacity-100'}`}>
                <span>Delegadas</span>
                {delegatedCount > 0 && <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${viewMode === 'delegadas' ? 'bg-white/20 text-white' : 'bg-brand-panel/10 text-brand-panel'}`}>{delegatedCount}</span>}
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest opacity-70 px-2 mb-2">Filtros Inteligentes</p>
              <button onClick={() => { setSelectedTaskId(null); setSmartList('meu-dia'); }} className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-medium transition-all cursor-pointer ${smartList === 'meu-dia' ? 'bg-brand-panel text-white shadow-sm' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-75'}`}>
                <div className="flex items-center space-x-3"><Sun className={`w-4 h-4 ${smartList === 'meu-dia' ? 'text-white' : 'text-[var(--warning)]'}`} /><span>Meu Dia</span></div>
                <span className="text-xs font-semibold">{visibleTasks.filter(t => t.myDay && t.status !== 'concluida').length}</span>
              </button>
              <button onClick={() => { setSelectedTaskId(null); setSmartList('todas'); }} className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-medium transition-all cursor-pointer ${smartList === 'todas' ? 'bg-brand-panel text-white shadow-sm' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-75'}`}>
                <div className="flex items-center space-x-3"><CheckSquare className="w-4 h-4" /><span>Todas em Aberto</span></div>
                <span className="text-xs font-semibold">{visibleTasks.filter(t => t.status !== 'concluida').length}</span>
              </button>
              <button onClick={() => { setSelectedTaskId(null); setSmartList('importante'); }} className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-medium transition-all cursor-pointer ${smartList === 'importante' ? 'bg-brand-panel text-white shadow-sm' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-75'}`}>
                <div className="flex items-center space-x-3"><Star className={`w-4 h-4 ${smartList === 'importante' ? 'text-white' : 'text-amber-400'}`} /><span>Urgentes & VIPs</span></div>
                <span className="text-xs font-semibold">{visibleTasks.filter(t => (t.important || t.priority === 'Urgente') && t.status !== 'concluida').length}</span>
              </button>
              <button onClick={() => { setSelectedTaskId(null); setSmartList('rotinas'); }} className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-medium transition-all cursor-pointer ${smartList === 'rotinas' ? 'bg-brand-panel text-white shadow-sm' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-75'}`}>
                <div className="flex items-center space-x-3"><Repeat className={`w-4 h-4 ${smartList === 'rotinas' ? 'text-white' : 'text-brand-panel'}`} /><span>Rotinas do Setor</span></div>
                <span className="text-xs font-semibold">{visibleTasks.filter(t => t.isRoutine && t.status !== 'concluida').length}</span>
              </button>
              <button onClick={() => { setSelectedTaskId(null); setSmartList('concluidas'); }} className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-medium transition-all cursor-pointer ${smartList === 'concluidas' ? 'bg-brand-panel text-white shadow-sm' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-75'}`}>
                <div className="flex items-center space-x-3"><CheckCircle2 className={`w-4 h-4 ${smartList === 'concluidas' ? 'text-white' : 'text-[var(--success)]'}`} /><span>Concluídas</span></div>
                <span className="text-xs font-semibold">{visibleTasks.filter(t => t.status === 'concluida').length}</span>
              </button>
            </div>
          </div>
        </div>

        {/* ==========================================================
            COLUNA 2: LISTA DE TAREFAS
            ========================================================== */}
        <div ref={listRef} aria-label="Lista de tarefas" className={`${selectedTaskId ? 'hidden' : 'flex'} task-queue flex-col min-h-0 min-w-0 h-full flex-1 overflow-hidden`} style={{ borderColor: 'var(--border-input)' }}>

          <div className="p-4 md:p-6 border-b flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-card)' }}>
            <div className="relative w-full sm:flex-1">
              <Search className="w-4 h-4 md:w-5 md:h-5 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-70" />
              <input aria-label="Pesquisar tarefas" type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Pesquisar tarefas..." className="w-full pl-10 pr-4 py-3.5 rounded-2xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors" style={solidInputStyle} />
            </div>

            {viewMode === 'delegadas' && delegatedPeopleList.length > 0 && (
              <select value={delegatedFilterPerson} onChange={(e) => setDelegatedFilterPerson(e.target.value)} className="w-full sm:w-auto px-4 py-3.5 rounded-2xl border text-sm font-medium outline-none cursor-pointer focus:border-brand-panel" style={solidInputStyle}>
                <option value="todos">Toda a Equipe</option>
                {delegatedPeopleList.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            )}

            <button onClick={openCreateModal} className="w-full sm:w-auto p-3.5 px-5 rounded-2xl bg-brand-panel text-white shadow-sm hover:opacity-95 transition-all flex items-center justify-center space-x-2 cursor-pointer flex-shrink-0 active:scale-95">
              <Plus className="w-5 h-5" />
              <span className={`${selectedTaskId ? 'hidden' : 'inline'} font-semibold text-sm`}>Nova Tarefa</span>
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
                <div role="button" tabIndex={0} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.currentTarget.click(); } }} key={task.id} data-task-id={task.id} onClick={() => openTask(task.id)} className={`p-5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${isSelected ? 'shadow-sm scale-[1.01]' : 'hover:brightness-95 shadow-sm'}`} style={{ backgroundColor: isSelected ? 'var(--bg-input)' : 'var(--bg-card)', borderColor: overdue ? 'rgba(239, 68, 68, 0.5)' : isBlocked ? 'rgba(245, 158, 11, 0.4)' : isSelected ? 'var(--tab-active)' : 'var(--border-input)' }}>
                  <div className="flex items-start space-x-4 overflow-hidden w-full">
                    <button aria-label={isDone ? 'Reabrir tarefa' : 'Concluir tarefa'} type="button" onClick={(e) => changeTaskStatus(task.id, isDone ? 'pendente' : 'concluida', e)} className={`mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${isDone ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm' : 'border-gray-400 hover:border-brand-panel bg-white/50'}`}>{isDone && <CheckCircle2 className="w-4 h-4" />}</button>
                    <div className="overflow-hidden flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        {task.priority === 'Urgente' && !isDone && <span className="px-2 py-0.5 rounded-lg bg-red-500/10 text-[var(--error-text)] text-xs md:text-xs font-semibold uppercase flex items-center flex-shrink-0 shadow-sm"><Flame className="w-3 h-3 mr-1" /> Urgente</span>}
                        {isBlocked && !isDone && <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-[var(--warning)] text-xs md:text-xs font-semibold uppercase flex items-center flex-shrink-0 shadow-sm"><AlertTriangle className="w-3 h-3 mr-1" /> Bloqueada</span>}
                        {overdue && <span className="px-2 py-0.5 rounded-lg bg-red-500 text-white text-xs md:text-xs font-semibold uppercase flex-shrink-0 shadow-sm">Atrasada</span>}
                      </div>

                      <p className={`text-[14px] md:text-[15px] font-semibold leading-snug break-words whitespace-normal ${isDone ? 'line-through opacity-45' : ''}`}>{task.title}</p>

                      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs md:text-xs opacity-75 font-medium">
                        <span className="text-brand-panel">{viewMode === 'delegadas' ? `Para: ${task.assignee}` : `De: ${task.assignedBy}`}</span>
                        <span>•</span>
                        <span className="flex items-center" style={{ color: catColor }}><div className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: catColor }}></div>{task.category}</span>
                        <span>•</span>
                        <span className={overdue ? 'text-[var(--error-text)]' : ''}>📅 {task.dueDate}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 flex-shrink-0">
                    {task.status === 'andamento' && <span className="hidden sm:inline text-xs font-semibold px-2 py-1 rounded-lg bg-emerald-500/10 text-[var(--success)] border border-emerald-500/20">Em andamento</span>}
                    <button aria-label="Marcar como importante" type="button" onClick={(e) => toggleTaskFlag(task.id, 'important', e)} className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors"><Star className={`w-5 h-5 ${task.important ? 'fill-amber-400 text-amber-400 drop-shadow-sm' : 'opacity-30'}`} /></button>
                  </div>
                </div>
              );
            })}
            {filteredTasks.length === 0 && (
              <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center opacity-70 space-y-4"><CheckCircle2 className="w-12 h-12 stroke-1" /><p className="text-sm font-medium">Tudo limpo nesta lista.</p></div>
            )}
          </div>
        </div>

        {/* ==========================================================
            COLUNA 3: EDITOR DETALHES
            ========================================================== */}
        <section aria-label="Detalhes da tarefa" className={`${selectedTaskId ? 'flex' : 'hidden'} task-detail flex-col min-h-0 min-w-0 flex-1 h-full overflow-hidden`}>
          {selectedTask ? <>
            <header className="task-detail-header">
              <div className="task-header-toolbar">
                <button type="button" onClick={closeTask} className="task-back"><ArrowLeft size={16}/>Voltar à lista</button>
              <div className="task-header-badges">
                <span className="task-badge text-brand-panel"><Tag size={13}/>{selectedTask.category}</span>
                {isTaskOverdue(selectedTask.dueDate, selectedTask.dueTime, selectedTask.status) && <span className="task-badge task-badge-danger"><Clock size={13}/>Prazo vencido</span>}
                {selectedTask.isRoutine && <span className="task-badge"><Repeat size={13}/>Rotina</span>}
              </div>
                <button type="button" onClick={closeTask} aria-label="Fechar tarefa" className="task-icon-button task-close"><X size={19}/></button>
              </div>

              <div className="flex items-start justify-between gap-3">
                <h2 ref={detailHeadingRef} tabIndex={-1} className="task-title">{isEditingTask ? 'Editar tarefa' : selectedTask.title}</h2>
                {canEditTask && !isEditingTask && <button aria-label="Editar" onClick={() => { setIsEditingTask(true); setDetailTab('overview'); setEditTitle(selectedTask.title); setEditDesc(selectedTask.description); }} className="task-icon-button text-brand-panel"><Edit2 size={17}/></button>}
              </div>
              <p className="task-origin">Delegada por <strong>{selectedTask.assignedBy}</strong><span aria-hidden="true"> · </span>Criada em {formatCreatedAt(selectedTask.createdAt)}</p>
            </header>
            <div className="task-detail-scroll custom-scrollbar">
              <div role="tablist" aria-label="Informações da tarefa" data-active-tab={detailTab} className="task-tabs">
                <button id="task-overview-tab" role="tab" aria-selected={detailTab === 'overview'} aria-controls="task-overview" tabIndex={detailTab === 'overview' ? 0 : -1} onKeyDown={e => { if (e.key === 'ArrowRight' || e.key === 'End') { e.preventDefault(); setDetailTab('updates'); document.getElementById('task-updates-tab')?.focus(); } }} onClick={() => setDetailTab('overview')}><CheckSquare size={16}/>Visão geral</button>
                <button id="task-updates-tab" role="tab" aria-selected={detailTab === 'updates'} aria-controls="task-updates" tabIndex={detailTab === 'updates' ? 0 : -1} onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'Home') { e.preventDefault(); setDetailTab('overview'); document.getElementById('task-overview-tab')?.focus(); } }} onClick={() => setDetailTab('updates')}><MessageSquare size={16}/>Diário e atualizações<span className="task-count">{selectedTask.chat.length}</span></button>
              </div>
              <div id="task-overview" role="tabpanel" aria-labelledby="task-overview-tab" hidden={detailTab !== 'overview'} className="task-tab-content">
              <div className="task-overview-grid">
                <section className="task-section task-description-card">
                  <div className="task-section-heading"><span className="task-section-icon"><FileText size={18}/></span><div><span className="task-eyebrow">O que precisa ser feito</span><h3>Descrição da tarefa</h3></div></div>
                  {isEditingTask ? <div className="space-y-3">
                    <label className="block text-sm">Título<input aria-label="Editar título da tarefa" value={editTitle} onChange={e => setEditTitle(e.target.value)} className="task-field mt-2"/></label>
                    <label className="block text-sm">Descrição<textarea aria-label="Editar descrição da tarefa" rows={4} value={editDesc} onChange={e => setEditDesc(e.target.value)} className="task-field mt-2"/></label>
                    <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={recordActions.pending > 0} onClick={() => setIsEditingTask(false)}>Cancelar</Button><Button disabled={recordActions.pending > 0 || !editTitle.trim()} onClick={handleSaveTaskInfo}>Salvar Alterações</Button></div>
                  </div> : <p className="task-description">{selectedTask.description ? formatLinks(selectedTask.description) : 'Nenhuma orientação adicional para esta tarefa.'}</p>}
                </section>
                <aside className="task-overview-aside" aria-label="Acompanhamento da tarefa"><h3 className="task-aside-heading"><CircleDot size={16}/>Acompanhamento</h3>
              <div className="task-summary">
                <label><span>Status da tarefa</span><select disabled={recordActions.pending > 0} aria-label="Status da tarefa" value={selectedTask.status} onChange={e => changeTaskStatus(selectedTask.id, e.target.value as TaskItem['status'])}>
                  <option value="pendente">Pendente</option><option value="andamento">Em andamento</option><option value="bloqueado">Bloqueada</option><option value="concluida">Concluída</option>
                </select></label>
                <label><span>Prioridade</span><select disabled={recordActions.pending > 0} aria-label="Prioridade da tarefa" value={selectedTask.priority} onChange={e => updateTaskMetadata(selectedTask.id, 'priority', e.target.value)}><option value="Normal">Normal</option><option value="Urgente">Urgente</option></select></label>
                <div><span>Responsável</span>{canEditTask ? <select disabled={recordActions.pending > 0} aria-label="Responsável pela execução" value={selectedTask.assignee} onChange={e => updateTaskMetadata(selectedTask.id, 'assignee', e.target.value)}>
                  {!teamMembers.some(m => m.nome === selectedTask.assignee) && <option value={selectedTask.assignee}>{selectedTask.assignee}</option>}
                  {teamMembers.map(m => <option key={m.user_id} value={m.nome}>{m.nome}</option>)}
                </select> : <strong>{selectedTask.assignee}</strong>}</div>
                <div><span>Prazo de entrega</span><strong className={isTaskOverdue(selectedTask.dueDate, selectedTask.dueTime, selectedTask.status) ? 'text-[var(--error-text)]' : ''}><Calendar size={15}/>{selectedTask.dueDate || 'Sem prazo'}{selectedTask.dueDate && <small>às {selectedTask.dueTime}</small>}</strong></div>
              </div>
              {selectedTask.creatorId===currentUser.user_id&&<div className="task-deadline-editor">{editingDeadline?<form onSubmit={e=>{e.preventDefault();void saveDeadline();}}><label>Nova data de entrega<input aria-label="Nova data de entrega" required type="date" value={deadlineDate} onChange={e=>setDeadlineDate(e.target.value)}/></label><label>Horário de entrega<input aria-label="Horário de entrega" required type="time" value={deadlineTime} onChange={e=>setDeadlineTime(e.target.value)}/></label><div><Button variant="secondary" disabled={recordActions.pending>0} onClick={()=>setEditingDeadline(false)}>Cancelar</Button><Button type="submit" disabled={recordActions.pending>0}>Salvar prazo</Button></div></form>:<button onClick={()=>{setDeadlineDate(selectedTask.dueDate.split('/').reverse().join('-'));setDeadlineTime(selectedTask.dueTime.slice(0,5));setEditingDeadline(true);}}><Calendar size={14}/>Alterar prazo de entrega</button>}</div>}
              <div className="task-flags" aria-label="Organização da tarefa">
                <button disabled={recordActions.pending > 0} aria-pressed={selectedTask.myDay} onClick={() => toggleTaskFlag(selectedTask.id, 'myDay')}><Sun size={15}/>Meu Dia</button>
                <button disabled={recordActions.pending > 0} aria-pressed={selectedTask.important} onClick={() => toggleTaskFlag(selectedTask.id, 'important')}><Star size={15} fill={selectedTask.important ? 'currentColor' : 'none'}/>Destacar</button>
                <button disabled={recordActions.pending > 0} aria-pressed={selectedTask.isRoutine} onClick={() => toggleTaskFlag(selectedTask.id, 'isRoutine')}><Repeat size={15}/>Rotina</button>
              </div>

                </aside>
                <section className="task-section task-checklist-card">
                  <div className="flex items-center justify-between gap-3 mb-4"><div><h3 className="!mb-1 flex items-center gap-2"><ListChecks size={17} className="text-brand-panel"/>Etapas da tarefa</h3><p className="task-muted text-xs">{selectedTask.steps.filter(step => step.done).length} de {selectedTask.steps.length} concluídas</p></div><Button variant="secondary" onClick={() => setIsAddingStep(v => !v)} aria-expanded={isAddingStep}><Plus size={16}/>Nova etapa</Button></div>
                  {selectedTask.steps.length > 0 && <div role="progressbar" aria-label="Progresso das etapas" aria-valuemin={0} aria-valuemax={selectedTask.steps.length} aria-valuenow={selectedTask.steps.filter(step => step.done).length} className="task-progress"><div style={{width: `${selectedTask.steps.filter(step => step.done).length / selectedTask.steps.length * 100}%`}}/></div>}
                  <div className="space-y-2">
                    {selectedTask.steps.map(step => <div key={step.id}>
                      {editingStepId === step.id ? <div className="task-step-editor space-y-3">
                        <input aria-label="Título da etapa" value={editStepText} onChange={e => setEditStepText(e.target.value)} className="task-field"/>
                        <textarea aria-label="Observações da etapa" rows={2} value={editStepNote} onChange={e => setEditStepNote(e.target.value)} className="task-field"/>
                        <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={() => setEditingStepId(null)}>Cancelar</Button><Button disabled={recordActions.pending > 0 || !editStepText.trim()} onClick={() => handleSaveStepEdit(selectedTask.id, step.id)}>Salvar Etapa</Button></div>
                      </div> : <div className="task-step group">
                        <div className="flex items-start gap-3 flex-1 min-w-0"><input aria-label={step.text} type="checkbox" checked={step.done} disabled={recordActions.pending > 0} onChange={() => toggleSubStep(selectedTask.id, step.id)} className="mt-1 w-4 h-4 shrink-0 accent-brand-panel"/><div className="min-w-0"><span className={step.done ? 'line-through task-muted' : 'font-medium'}>{step.text}</span>{step.note && <p className="task-muted text-sm whitespace-pre-wrap mt-1 break-words">{formatLinks(step.note)}</p>}</div></div>
                        <div className="task-step-actions"><button aria-label="Editar etapa" disabled={recordActions.pending > 0} onClick={() => { setEditingStepId(step.id); setEditStepText(step.text); setEditStepNote(step.note || ''); }} className="task-icon-button"><Edit2 size={15}/></button><button aria-label="Excluir etapa" disabled={recordActions.pending > 0} onClick={() => handleDeleteStep(selectedTask.id, step.id)} className="task-icon-button text-[var(--error-text)]"><X size={16}/></button></div>
                      </div>}
                    </div>)}
                  </div>
                  {!selectedTask.steps.length && !isAddingStep && <p className="task-empty">Divida a tarefa em etapas para acompanhar o progresso.</p>}
                  {isAddingStep && <form className="task-step-editor space-y-3 mt-4" onSubmit={e => { e.preventDefault(); void handleAddStep(selectedTask.id); }}>
                    <input autoFocus aria-label="Nova etapa" value={stepInput} onChange={e => setStepInput(e.target.value)} placeholder="Nova etapa (título)..." className="task-field"/>
                    <textarea aria-label="Observações da nova etapa" rows={2} value={stepNoteInput} onChange={e => setStepNoteInput(e.target.value)} placeholder="Observações da etapa (opcional)" className="task-field"/>
                    <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={() => setIsAddingStep(false)}>Cancelar</Button><Button type="submit" disabled={recordActions.pending > 0 || !stepInput.trim()}>+ Adicionar Etapa</Button></div>
                  </form>}
                </section>
                <button className="task-journal-preview" onClick={() => setDetailTab('updates')}><span className="task-journal-icon"><MessageSquare size={20}/></span><span className="flex-1 min-w-0 text-left"><strong className="block text-sm">Acompanhe a conversa</strong><span className="task-muted block text-sm mt-1 truncate">{selectedTask.chat.length ? `${selectedTask.chat.at(-1)?.author}: ${selectedTask.chat.at(-1)?.text}` : 'Compartilhe avanços, dúvidas e dificuldades no diário.'}</span></span><ChevronRight size={18}/></button>
              </div>
              </div>
              <div id="task-updates" role="tabpanel" aria-labelledby="task-updates-tab" hidden={detailTab !== 'updates'} className="task-tab-content">
                <section className="task-section">
                  <div className="flex flex-wrap justify-between items-start gap-3 mb-6"><div><h3 className="!mb-1">Diário e atualizações</h3><p className="task-muted text-sm">Um espaço para acompanhar a evolução da tarefa.</p></div>
                    {selectedTask.assignee !== currentUser.nome && selectedTask.status !== 'concluida' && <Button variant="secondary" disabled={recordActions.pending > 0} onClick={() => handleSendReminder(selectedTask)}><Bell size={15}/>Solicitar atualização</Button>}
                  </div>
                  <div className="task-timeline">
                    {selectedTask.chat.map(c => <article key={c.id} data-comment-id={c.id} className={`task-comment ${c.isAlert ? 'task-comment-alert' : ''}`}>
                      <div className="task-comment-avatar" aria-hidden="true">{c.isAlert ? <AlertTriangle size={17}/> : getInitials(c.author)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-2"><strong className="text-sm">{c.author}{c.authorId === currentUser.user_id && <span className="task-muted font-normal"> · você</span>}</strong><span className="task-muted text-xs">{c.time}{c.editedAt && ' · editada'}</span></div>
                        {c.isAlert && <span className="task-alert-label">Sinalização de atenção</span>}
                        {editingComment?.taskId === selectedTask.id && editingComment.id === c.id ? <div className="space-y-3">
                          <textarea aria-label="Editar atualização" rows={3} value={editingComment.text} onChange={e => setEditingComment({...editingComment, text: e.target.value})} className="task-field"/>
                          <div className="flex flex-wrap gap-2"><Button disabled={recordActions.pending > 0 || !editingComment.text.trim()} onClick={saveCommentEdit}>Salvar atualização</Button><Button variant="secondary" onClick={() => setEditingComment(null)}>Cancelar edição</Button></div>
                        </div> : <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{formatLinks(c.text)}</p>}
                        {c.authorId === currentUser.user_id && !editingComment && <div className="flex gap-3 mt-2"><button disabled={recordActions.pending > 0} onClick={() => setEditingComment({taskId:selectedTask.id, id:c.id, text:c.text, original:c.text})} className="task-comment-action">Editar mensagem</button><button disabled={recordActions.pending > 0} onClick={() => deleteComment(selectedTask.id, c)} className="task-comment-action">Excluir mensagem</button></div>}
                        {!c.authorId && <span className="sr-only">Registro antigo: autoria não verificada para edição.</span>}
                      </div>
                    </article>)}
                    {!selectedTask.chat.length && <div className="task-empty"><MessageSquare size={26} className="mx-auto mb-3"/><p>Nenhuma atualização ainda.</p><p className="text-xs mt-1">Registre o primeiro avanço desta tarefa.</p></div>}
                    <div ref={taskChatEndRef}/>
                  </div>
                  <form className="task-compose" onSubmit={e => { e.preventDefault(); void handleSendChat(selectedTask.id); }}>
                    <label htmlFor="task-update-input" className="text-sm font-semibold">Adicionar atualização</label>
                    <textarea id="task-update-input" ref={inputFieldRef} aria-label="Nova atualização" value={chatInput} onChange={handleInputResize} onKeyDown={handleKeyDown} rows={3} placeholder={isDifficultyAlert ? 'Descreva o que impede você de avançar…' : 'O que avançou? Compartilhe com os participantes…'} className="task-field mt-3"/>
                    <div className="flex flex-wrap items-center justify-between gap-3 mt-3"><label className="flex items-center gap-2 text-sm text-[var(--warning)]"><input type="checkbox" checked={isDifficultyAlert} onChange={e => setIsDifficultyAlert(e.target.checked)} className="accent-brand-panel"/>Sinalizar dificuldade</label><Button type="submit" disabled={recordActions.pending > 0 || !chatInput.trim()}><Send size={16}/>{recordActions.pending > 0 ? 'Salvando…' : 'Publicar atualização'}</Button></div>
                    <p className="task-muted text-xs mt-3">Enter para publicar · Shift + Enter para uma nova linha.</p>
                  </form>
                </section>
              </div>
              <footer className="task-detail-footer"><span className="task-muted text-xs">{selectedTask.steps.length > 0 ? `${selectedTask.steps.filter(step => step.done).length}/${selectedTask.steps.length} etapas concluídas` : 'Organize, acompanhe e compartilhe o progresso.'}</span>{canEditTask && <div className="flex flex-wrap gap-2">{selectedTask.isRoutine && selectedTask.status === 'concluida' && <Button variant="secondary" onClick={() => completeTaskAndCloneRoutine(selectedTask.id)}>Verificar próxima ocorrência</Button>}<button onClick={() => confirmDeleteTask(selectedTask.id, selectedTask.title)} aria-label="Excluir tarefa permanentemente" className="task-delete"><Trash2 size={14}/>Excluir tarefa</button></div>}</footer>
            </div>
          </> : <div className="ui-state"><CheckSquare size={32}/><strong>Tarefa indisponível</strong><p>A tarefa pode ter sido removida ou estar fora do seu acesso.</p><Button variant="secondary" onClick={closeTask}>Voltar à lista</Button></div>}
        </section>

      </div>

      {/* Modal em portal: fora do stacking context do dashboard e acima do header. */}
      {isCreateModalOpen && <ModalShell open description={<><span className="text-xs font-semibold uppercase tracking-widest text-brand-panel">Novo Registro</span></>} size="lg" title={<>Nova Demanda ({currentUser?.setor})</>} onClose={() => !isSaving && setIsCreateModalOpen(false)} busy={isSaving || dialogAction.pending}  footer={<div className="flex flex-shrink-0 flex-col justify-end gap-3 border-t px-5 py-4 sm:flex-row sm:px-8" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-input)' }}>
              <button type="button" disabled={isSaving} onClick={() => setIsCreateModalOpen(false)} className="w-full rounded-xl border px-6 py-3 text-sm font-semibold transition-colors hover:bg-black/5 disabled:opacity-70 dark:hover:bg-white/5 sm:w-auto" style={{ borderColor: 'var(--border-input)' }}>Cancelar</button>
              <button type="submit" form="form-criar-demanda" disabled={isSaving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-panel px-7 py-3 text-sm font-semibold text-white shadow-sm transition-transform hover:opacity-90 active:scale-95 disabled:opacity-70 sm:w-auto">
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>{isSaving ? 'Agendando...' : 'Salvar Tarefa'}</span>
              </button>
            </div>}>
<form id="form-criar-demanda" onSubmit={event => { event.preventDefault(); void dialogAction.run(() => handleCreateTask(event)); }} className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-5 custom-scrollbar sm:p-8">
              <div>
                <label htmlFor="field-1" className="text-xs font-semibold uppercase tracking-widest opacity-75 block mb-2">Título da Demanda *</label>
                <input id="field-1" type="text" required value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Ex: Verificar servidor X..." className="w-full px-4 py-3.5 rounded-2xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors" style={solidInputStyle} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="field-2" className="text-xs font-semibold uppercase tracking-widest opacity-75 block mb-2">Categoria</label>
                  <select id="field-2" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="w-full px-4 py-3.5 rounded-2xl border text-sm font-medium outline-none cursor-pointer focus:border-brand-panel transition-colors" style={solidInputStyle}>
                    {taskCategories.map(cat => <option key={cat.id} value={cat.nome}>{cat.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="field-3" className="text-xs font-semibold uppercase tracking-widest opacity-75 block mb-2">Prioridade</label>
                  <select id="field-3" value={newPriority} onChange={e => setNewPriority(e.target.value as 'Normal' | 'Urgente')} className="w-full px-4 py-3.5 rounded-2xl border text-sm font-medium outline-none cursor-pointer focus:border-brand-panel transition-colors" style={solidInputStyle}>
                    <option value="Normal">Normal</option><option value="Urgente">🔥 Urgente</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="field-4" className="text-xs font-semibold uppercase tracking-widest opacity-75 block mb-2">Observações (opcional)</label>
                <textarea id="field-4" rows={3} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Contexto técnico ou orientações..." className="w-full px-4 py-3.5 rounded-2xl border text-sm outline-none resize-none font-medium focus:border-brand-panel transition-colors" style={solidInputStyle} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="field-5" className="text-xs font-semibold uppercase tracking-widest opacity-75 block mb-2">Responsável</label>
                  <select id="field-5" value={newAssignee} onChange={(e) => setNewAssignee(e.target.value)} className="w-full px-3 py-3 rounded-2xl border text-[12px] font-medium text-brand-panel outline-none cursor-pointer focus:border-brand-panel transition-colors" style={solidInputStyle}>
                    {allowedAssignees.map(a => ( <option key={a.value} value={a.value}>{a.label}</option> ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="field-6" className="text-xs font-semibold uppercase tracking-widest opacity-75 block mb-2">Data Limite</label>
                  <input id="field-6" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="w-full px-3 py-3 rounded-2xl border text-[12px] font-medium outline-none cursor-pointer focus:border-brand-panel transition-colors" style={solidInputStyle} />
                </div>
                <div>
                  <label htmlFor="field-7" className="text-xs font-semibold uppercase tracking-widest opacity-75 block mb-2">Horário</label>
                  <input id="field-7" type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="w-full px-3 py-3 rounded-2xl border text-[12px] font-medium outline-none focus:border-brand-panel transition-colors" style={solidInputStyle} />
                </div>
              </div>

              <label className="flex items-center justify-between p-4 rounded-2xl border cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/5" style={solidInputStyle}>
                <div className="flex items-center space-x-3"><Repeat className="w-5 h-5 text-brand-panel" /><div><span className="text-sm font-medium block">Classificar como Rotina</span><span className="text-xs opacity-75 font-semibold mt-0.5">Visível no filtro inteligente de Rotinas.</span></div></div>
                <input type="checkbox" checked={newIsRoutine} onChange={(e) => setNewIsRoutine(e.target.checked)} className="w-5 h-5 rounded border-gray-300 accent-brand-panel cursor-pointer shadow-sm" />
              </label>

              <div className="space-y-4 pt-4 border-t" style={{ borderColor: 'var(--border-input)' }}>
                <label className="text-xs font-semibold uppercase tracking-widest opacity-75 block">Checklist Inicial ({newSteps.length})</label>
                {newSteps.length > 0 && (
                  <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                    {newSteps.map((st, i) => (
                      <div key={i} className="px-4 py-3 rounded-2xl border flex justify-between items-start shadow-sm" style={solidInputStyle}>
                        <div className="flex flex-col">
                          <span className="text-[12px] font-medium">{i + 1}. {st.text}</span>
                          {st.note && <span className="text-xs opacity-75 truncate max-w-[220px] mt-1 font-medium">{st.note}</span>}
                        </div>
                        <button aria-label="Fechar" type="button" onClick={() => setNewSteps(prev => prev.filter((_, idx) => idx !== i))} className="p-1 rounded-lg opacity-70 hover:opacity-100 hover:bg-red-500/10 text-[var(--error-text)] cursor-pointer transition-colors"><X className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="p-4 border rounded-2xl space-y-3" style={solidInputStyle}>
                  <input type="text" value={newStepText} onChange={(e) => setNewStepText(e.target.value)} placeholder="Título da etapa..." className="w-full px-4 py-3 rounded-xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors" style={solidCardStyle} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTempStep(); } }} />
                  <textarea rows={1} value={newStepNote} onChange={(e) => setNewStepNote(e.target.value)} placeholder="Descrição (opcional)..." className="w-full px-4 py-3 rounded-xl border text-[12px] font-medium outline-none resize-none focus:border-brand-panel transition-colors" style={solidCardStyle} />
                  <button type="button" onClick={handleAddTempStep} className="w-full py-3 rounded-xl bg-brand-panel text-white text-sm font-semibold cursor-pointer shadow-sm hover:opacity-90 active:scale-95 transition-transform">+ Adicionar ao Checklist</button>
                </div>
              </div>

            </form>

</ModalShell>}

      {/* Modal de confirmação também usa portal para respeitar a camada superior. */}
      {confirmModal.isOpen && <ModalShell open title={<>{confirmModal.title}</>} onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} destructive busy={dialogAction.pending}  footer={<div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3 px-6 md:px-8 py-5 border-t" style={{ borderColor: 'var(--border-input)' }}>
              <button onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} className="w-full sm:w-auto px-6 py-3.5 rounded-xl border text-sm font-semibold cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" style={{ borderColor: 'var(--border-input)' }}>Cancelar</button>
              <button onClick={() => dialogAction.run(confirmModal.onConfirm)} className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold cursor-pointer transition-colors shadow-sm active:scale-95">Sim, Excluir</button>
            </div>}>
<div className="p-6 md:p-8"><p className="text-sm font-semibold opacity-80 leading-relaxed text-center">{confirmModal.message}</p></div>
</ModalShell>}

    </div>
  );
}
