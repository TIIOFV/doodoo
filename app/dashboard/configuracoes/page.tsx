'use client';
import './settings-workspace.css';
import NotificationPreferences from './NotificationPreferences';

import { useHydrated } from '@/app/lib/useHydrated';
import ModalShell from '../ModalShell';
import { useDialogAction } from '../useDialogAction';
import {useRecordActions} from '../useRecordActions';

import { heroGridStyle, HeroOrbitalArt, heroSurfaceStyle, primaryActionStyle } from '@/app/components/BrandMark';
import { inputStyle, Notice, panelStyle } from '@/app/components/ui';
import { messageOf,notify,requireResult } from '@/app/lib/domain';
import { formatPortalDateTime } from '@/app/lib/serverClock';
import type { ChannelRow,MessageRow,PermissionRow } from '@/app/lib/models';
import JSZip from 'jszip';
import { Activity,Archive,Bell,ChevronLeft,ChevronRight,Database,DownloadCloud,Loader2,Lock,Plus,Save,Search,Settings,Shield,Tags,Trash2,Unlock,UserPlus,Users } from 'lucide-react';
import { useCallback,useEffect,useMemo,useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { atomicWrites } from '../../lib/environment';
import { createRegistrationClient,supabase } from '../../lib/supabase';

type RoleType = 'administrador' | 'gestor' | 'coordenador' | 'supervisor' | 'analista' | 'colaborador';

const SECTORS = ['TI', 'Atendimento', 'Bloco Cirúrgico', 'Farmácia', 'Faturamento/Financeiro', 'Manutenção', 'RH', 'Geral'];

interface DBProfile {
  id: string; user_id: string; nome: string; email: string; cargo: RoleType; setor: string; avatar_url?: string; status?: string; read_receipts?: boolean; email_notifications?: boolean;
}

interface TabPermission {
  tabName: string; tabKey: string; allowedRoles: RoleType[]; allowedUsers: string[];
}

interface TaskCategory {
  id: string; nome: string; cor: string;
}

interface SystemLog {
  id: string; autor_nome: string; acao: string; detalhes: string; created_at: string;
}

const TAB_NAMES: Record<string, string> = {
  visao_geral: 'Visão Geral', chat: 'Chat Corporativo', tarefas_todas: 'Tarefas (Visão Global)', tarefas_minha: 'Tarefas (Fila Pessoal)', agenda: 'Agenda', anotacoes: 'Anotações (Privadas)', gestao: 'Painel de Gestão', tarefas: 'Tarefas'
};

const getInitials = (name: string) => {
  if (!name) return '..';
  const cleanName = name.replace(/^Chat:\s*/i, '').trim();
  const parts = cleanName.split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return cleanName.slice(0, 2).toUpperCase();
};

const parseJsonArray = (value: unknown): string[] => {
 let parsed:unknown=value;if(typeof value==='string'){try{parsed=JSON.parse(value);}catch{return [];}}
 return Array.isArray(parsed)?parsed.filter((item):item is string=>typeof item==='string'):[];
};
const safeFetch = async <T,>(query: PromiseLike<{data:T|null;error:{message:string}|null}>) => {
 const result=await query;
 if(result.error){notify('Dados indisponíveis','Alguns dados de configurações não puderam ser carregados. Verifique seu acesso e tente novamente.');return null;}
 return result.data;
};


// Mensagens visíveis para a sessão atual podem não ter permissão de DELETE (RLS).
// Uma operação com zero linhas afetadas não é uma confirmação de sucesso.
type ChatMessageFilter = { channelId?: string; before?: string };

type DatabaseFailure = { code?: string; message?: string; details?: string; hint?: string };

const describeDatabaseFailure = (failure: unknown) => {
  const error = failure && typeof failure === 'object' ? failure as DatabaseFailure : null;
  const code = error?.code;
  if (code === '42501') return 'O Supabase negou a operação (42501). Verifique as políticas RLS, sem alterá-las no projeto compartilhado.';
  if (code === '23503') return 'Existem registros relacionados impedindo a exclusão (23503). Nenhuma remoção adicional será tentada.';
  if (code === 'PGRST116') return 'Nenhum registro autorizado foi retornado para esta operação (PGRST116).';
  return `${error?.message || (failure instanceof Error ? failure.message : 'Falha de comunicação com o banco.')}${code ? ` (código ${code})` : ''}`;
};

// Exporta em páginas; a configuração de max_rows do PostgREST pode truncar .select('*').
const fetchChatHistory = async (channelId?: string): Promise<MessageRow[]> => {
  const pageSize = 500;
  const maxRows = 20000;
  const messages: MessageRow[] = [];
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    let query = supabase.from('doodoo_mensagens').select('*')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (channelId) query = query.eq('canal_id', channelId);
    const { data, error } = await query;
    if (error) throw error;
    const batch = (data || []) as MessageRow[];
    messages.push(...batch);
    if (batch.length < pageSize) return messages;
  }
  // Verifica se há mais registros além do limite antes de declarar o backup completo.
  let probe = supabase.from('doodoo_mensagens').select('id')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .range(maxRows, maxRows);
  if (channelId) probe = probe.eq('canal_id', channelId);
  const { data: excess, error: probeError } = await probe;
  if (probeError) throw probeError;
  if (!excess?.length) return messages;
  throw new Error('O histórico ultrapassa 20.000 mensagens. Exporte em lotes menores ou por um serviço de servidor antes de considerar este backup completo.');
};

const saveTextOrZip = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
};

export default function ConfiguracoesPage() {
  const dialogAction = useDialogAction();
  const permissionActions=useRecordActions();
  const { theme, changeTheme } = useTheme();
  const isMounted = useHydrated();


  const themes = [
    { id: 'light', name: 'Claro', color: '#ffffff', border: '#9ca3af' },
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

  const [currentUser, setCurrentUser] = useState<DBProfile | null>(null);
  const [companyUsers, setCompanyUsers] = useState<DBProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingRegistration, setPendingRegistration] = useState<{id:string;email:string}|null>(null);

  const [activeTab, setActiveTab] = useState<'geral' | 'usuarios' | 'permissoes' | 'categorias' | 'notificacoes' | 'logs'>('geral');
  const [logTab, setLogTab] = useState<'sistema' | 'retencao'>('sistema');

  const isAdmin = currentUser?.cargo === 'administrador';
  const isManager = isAdmin || currentUser?.cargo === 'gestor' || currentUser?.cargo === 'coordenador';

  // ESTADOS DA TABELA DE USUÁRIOS
  const [userSearch, setUserSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<RoleType>('colaborador');
  const [newUserSector, setNewUserSector] = useState(SECTORS[0]);

  // ESTADOS DA TABELA DE AUDITORIA
  const [logSearch, setLogSearch] = useState('');
  const [logPage, setLogPage] = useState(1);
  const LOGS_PER_PAGE = 20;

  const [tabPermissions, setTabPermissions] = useState<TabPermission[]>([]);
  const [taskCategories, setTaskCategories] = useState<TaskCategory[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#3B82F6');
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  const [selectedExceptionUserId, setSelectedExceptionUserId] = useState<string>('');
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);

  const [adminChannels, setAdminChannels] = useState<{id: string, name: string, isGroup: boolean, isDirect: boolean, isGhost: boolean}[]>([]);

  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [isDownloadingTranscript, setIsDownloadingTranscript] = useState<string | null>(null);
  const [isPurging, setIsPurging] = useState<string | null>(null);
  const [isPurgingGlobal, setIsPurgingGlobal] = useState(false);

  const [isUpdatingPrivacy, setIsUpdatingPrivacy] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean; title: string; message: string; onConfirm: () => void; isDestructive?: boolean;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {}, isDestructive: false });

  const glassContainerStyle = { ...panelStyle, boxShadow: 'var(--shadow-card, 0 1px 2px rgb(15 23 42 / 0.04))' };
  const glassSidebarStyle = { backgroundColor: 'var(--bg-card)', borderRight: '1px solid var(--border-input)' };
  const solidCardStyle = { ...panelStyle, boxShadow: 'var(--shadow-card, 0 1px 2px rgb(15 23 42 / 0.04))' };
  const solidInputStyle = inputStyle;

  const notifyBell = useCallback((title: string, desc: string) => {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('doodoo:notify', { detail: { title, desc } }));
  }, []);


  // Só opera em filtros explícitos e confirma o efeito com contagens visíveis à sessão.
  // Não ignora falhas RLS nem troca policies por operações com service_role.
  const countVisibleMessages = async (filter: ChatMessageFilter): Promise<number> => {
    if (!filter.channelId && !filter.before) throw new Error('Filtro de exclusão obrigatório.');
    let query = supabase.from('doodoo_mensagens').select('id', { count: 'exact', head: true });
    if (filter.channelId) query = query.eq('canal_id', filter.channelId);
    if (filter.before) query = query.lt('created_at', filter.before);
    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
  };

  const deleteVisibleMessages = async (filter: ChatMessageFilter) => {
    if (!filter.channelId && !filter.before) throw new Error('Exclusão sem filtro foi bloqueada.');
    const visibleBefore = await countVisibleMessages(filter);
    if (visibleBefore === 0) return { visibleBefore, removed: 0, remaining: 0 };

    let query = supabase.from('doodoo_mensagens').delete({ count: 'exact' });
    if (filter.channelId) query = query.eq('canal_id', filter.channelId);
    if (filter.before) query = query.lt('created_at', filter.before);
    const { data, error, count } = await query.select('id');
    if (error) throw error;
    const removed = count ?? data?.length ?? 0;
    const remaining = await countVisibleMessages(filter);
    if (removed === 0 && remaining > 0) {
      throw new Error(`Existem ${remaining} mensagem(ns) visíveis, mas o banco não excluiu nenhuma. Uma política RLS DELETE pode estar bloqueando a operação; verifique as policies e a resposta da requisição.`);
    }
    return { visibleBefore, removed, remaining };
  };

  const registerLog = async (acao: string, detalhes: string) => {
    if (!currentUser) return;
    const newLog = { autor_nome: currentUser.nome, acao, detalhes };
    try {
      const saved = requireResult<SystemLog>(await supabase.from('doodoo_logs').insert([newLog]).select('*').single());
      setSystemLogs(prev => [saved, ...prev]);
    } catch { notifyBell('Auditoria não registrada', 'A operação principal foi concluída, mas não foi possível gravar o histórico.'); }
  };

  useEffect(() => {
    const fetchSettingsData = async () => {
      try {
        setIsLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) { setAuthError(true); return; }

        const { data: perfilAtual } = await supabase.from('doodoo_perfis').select('*').eq('user_id', session.user.id).single();

        if (perfilAtual) {
          setCurrentUser(perfilAtual as DBProfile);

          const isLideranca = perfilAtual.cargo === 'administrador' || perfilAtual.cargo === 'gestor' || perfilAtual.cargo === 'coordenador';
          const isMasterAdmin = perfilAtual.cargo === 'administrador';
          if(isLideranca){
            try{
              const pending=JSON.parse(localStorage.getItem('doodoo:registration:'+perfilAtual.user_id)||'null');
              if(pending&&typeof pending.email==='string'&&typeof pending.id==='string'&&/^[a-f0-9-]{36}$/i.test(pending.id)){
                const existing=await supabase.from('doodoo_perfis').select('user_id').eq('user_id',pending.id).maybeSingle();
                if(!existing.error&&existing.data)localStorage.removeItem('doodoo:registration:'+perfilAtual.user_id);
                else {setPendingRegistration({id:pending.id,email:pending.email});setNewUserEmail(pending.email);}
              }
            }catch{notifyBell('Recuperação indisponível','Não foi possível recuperar o cadastro pendente neste dispositivo.');}
          }

          const [todosPerfis, permissoesDb, catsDb, logsDb, canaisAdmin] = await Promise.all([
            isLideranca ? safeFetch((isMasterAdmin ? supabase.from('doodoo_perfis').select('*') : supabase.from('doodoo_perfis').select('*').eq('setor',perfilAtual.setor)).order('nome',{ascending:true})) : Promise.resolve([perfilAtual]),
            isLideranca ? safeFetch(supabase.from('doodoo_permissoes').select('*').order('aba_key', { ascending: true })) : Promise.resolve(null),
            isLideranca ? safeFetch(supabase.from('doodoo_tarefas_categorias').select('*').order('created_at', { ascending: true })) : Promise.resolve(null),
            isMasterAdmin ? safeFetch(supabase.from('doodoo_logs').select('*').order('created_at', { ascending: false }).limit(500)) : Promise.resolve(null),
            isMasterAdmin ? safeFetch(supabase.from('doodoo_canais').select('id, nome, is_group, is_direct, membros').order('is_group', { ascending: false }).order('nome', { ascending: true })) : Promise.resolve(null)
          ]);

          if (todosPerfis) setCompanyUsers(todosPerfis as DBProfile[]);

          if (permissoesDb) {
            setTabPermissions(permissoesDb.map((p: PermissionRow) => ({
              tabKey: p.aba_key,
              tabName: TAB_NAMES[p.aba_key] || p.aba_key,
              allowedRoles: parseJsonArray(p.cargos_permitidos).filter((role):role is RoleType => ['administrador','gestor','coordenador','supervisor','analista','colaborador'].includes(role)),
              allowedUsers: parseJsonArray(p.usuarios_permitidos)
            })));
          }

          if (catsDb) setTaskCategories(catsDb);
          if (logsDb) setSystemLogs(logsDb);

          if (canaisAdmin) {
            const mapped = canaisAdmin.map((c: ChannelRow) => {
                let cName = c.nome || 'Canal Sem Nome';
                let isGhost = false;

                if (c.is_direct) {
                  if (Array.isArray(c.membros) && c.membros.length >= 2) {
                    const u1 = c.membros[0].name?.split(' ')[0] || 'U1';
                    const u2 = c.membros[1].name?.split(' ')[0] || 'U2';
                    cName = `Direta: ${u1} & ${u2}`;
                  } else {
                    isGhost = true;
                    const survivor = Array.isArray(c.membros) && c.membros.length > 0 ? c.membros[0].name?.split(' ')[0] : 'Desconhecido';
                    cName = `Fantasma: ${survivor}`;
                  }
                }

                return { id: c.id, name: cName, isGroup: c.is_group, isDirect: Boolean(c.is_direct), isGhost };
            });

            mapped.sort((a, b) => {
               if (a.isGhost && !b.isGhost) return -1;
               if (!a.isGhost && b.isGhost) return 1;
               if (a.isGroup && !b.isGroup) return -1;
               if (!a.isGroup && b.isGroup) return 1;
               return a.name.localeCompare(b.name);
            });

            setAdminChannels(mapped);
          }

        } else {
          setAuthError(true);
        }
      } catch {
        setAuthError(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettingsData();
  }, [notifyBell]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || isSaving) return;
    setIsSaving(true);
    try {
      const { data, error } = await supabase.from('doodoo_perfis').update({ avatar_url: currentUser.avatar_url }).eq('user_id', currentUser.user_id).select('*').single();
      if (error) throw error;
      if (!data) throw new Error('O banco não confirmou a atualização do perfil.');
      notifyBell('Perfil atualizado', 'A foto do perfil foi salva.');
      void registerLog('Perfil Atualizado', 'Atualizou a foto de perfil.');
      setCompanyUsers(prev => prev.map(u => u.user_id === currentUser.user_id ? { ...u, avatar_url: data.avatar_url } : u));
    } catch (error) {
      notifyBell('Perfil não salvo', describeDatabaseFailure(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateUserRoleAndSector = async (userId: string, field: 'cargo' | 'setor', value: string) => {
    if (!isManager || updatingUserId || (!isAdmin && field === 'cargo' && value === 'administrador')) return;
    if(userId===currentUser?.id)return notifyBell('Ação indisponível','Seu cargo e setor devem ser alterados por outro administrador.');
    const previousUser = companyUsers.find(u => u.id === userId);
    if(!isAdmin&&previousUser?.cargo==='administrador')return;
    if (!previousUser || previousUser[field] === value) return;

    setUpdatingUserId(userId);
    setCompanyUsers(prev => prev.map(u => u.id === userId ? { ...u, [field]: value } : u));

    try {
      const { data, error } = await supabase.from('doodoo_perfis').update({ [field]: value }).eq('id', userId).select('*').single();
      if (error) throw error;
      if (!data) throw new Error('A atualização não foi confirmada pelo banco.');
      setCompanyUsers(prev => prev.map(u => u.id === userId ? { ...u, ...data } : u));
      notifyBell('Acesso atualizado', `${field === 'cargo' ? 'Cargo' : 'Setor'} atualizado com sucesso.`);
      void registerLog('Alteração de Cadastro', `Alterou o ${field} de ${previousUser.nome} para ${value.toUpperCase()}.`);
    } catch (error) {
      setCompanyUsers(prev => prev.map(u => u.id === userId ? previousUser : u));
      notifyBell('Alteração não salva', describeDatabaseFailure(error));
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleToggleUserStatus = (userId: string, nome: string, currentStatus: string = 'ativo') => {
    if (!isManager || (!isAdmin&&companyUsers.find(u=>u.id===userId)?.cargo==='administrador') || userId === currentUser?.id) return notifyBell('Ação indisponível', 'Não é permitido bloquear sua própria conta.');
    const newStatus = currentStatus === 'bloqueado' ? 'ativo' : 'bloqueado';
    setConfirmModal({
      isOpen: true,
      title: newStatus === 'bloqueado' ? 'Bloquear Acesso' : 'Desbloquear Acesso',
      message: `Deseja realmente ${newStatus === 'bloqueado' ? 'bloquear' : 'desbloquear'} o acesso de ${nome}?`,
      isDestructive: newStatus === 'bloqueado',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setUpdatingUserId(userId);
        const previousUser = companyUsers.find(u => u.id === userId);
        setCompanyUsers(prev => prev.map(u => u.id === userId ? { ...u, status: newStatus } : u));

        try {
          const { data, error } = await supabase.from('doodoo_perfis').update({ status: newStatus }).eq('id', userId).select('*').single();
          if (error) throw error;
          if (!data) throw new Error('O banco não confirmou a alteração de status.');
          notifyBell('Status atualizado', `Acesso alterado para ${newStatus}.`);
          void registerLog('Bloqueio/Desbloqueio', `${newStatus === 'bloqueado' ? 'Bloqueou' : 'Desbloqueou'} o acesso de ${nome}.`);
        } catch (error) {
          if (previousUser) setCompanyUsers(prev => prev.map(u => u.id === userId ? previousUser : u));
          notifyBell('Status não atualizado', describeDatabaseFailure(error));
        } finally {
          setUpdatingUserId(null);
        }
      }
    });
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin && newUserRole === 'administrador') return notifyBell('Acesso restrito','Somente administradores podem cadastrar outro administrador.');
    if (!isManager || isSaving || !newUserName.trim() || !newUserEmail.trim() || (!pendingRegistration && !newUserPassword.trim())) return;

    setIsSaving(true);
    try {
      let newUserId = pendingRegistration?.id;
      if (pendingRegistration && pendingRegistration.email !== newUserEmail.trim()) throw new Error('Conclua o cadastro pendente antes de alterar o e-mail.');
      if (!newUserId) {
        const registration = createRegistrationClient();
        const { data, error } = await registration.auth.signUp({ email:newUserEmail.trim(), password:newUserPassword, options:{data:{nome:newUserName.trim()}} });
        if (error) throw error;
        if (!data.user?.id) throw new Error('O serviço de autenticação não confirmou o usuário. Nenhum perfil foi criado.');
        newUserId=data.user.id;
        setPendingRegistration({id:newUserId,email:newUserEmail.trim()});
        try {localStorage.setItem('doodoo:registration:'+currentUser.user_id,JSON.stringify({id:newUserId,email:newUserEmail.trim()}));}catch{notifyBell('Recuperação indisponível','Mantenha o formulário aberto até concluir o perfil.');}
      }
      const { data, error } = await supabase.from('doodoo_perfis').insert([{
          user_id: newUserId, nome: newUserName.trim(), email: newUserEmail.trim(), cargo: newUserRole, setor: newUserSector, status: 'ativo'
      }]).select().single();

      if (data && !error) {
        setCompanyUsers(prev => [...prev, data as DBProfile].sort((a, b) => a.nome.localeCompare(b.nome)));
        setPendingRegistration(null);
        try{localStorage.removeItem('doodoo:registration:'+currentUser.user_id);}catch{/* Profile was confirmed; recovery data is harmless and will be reconciled on load. */}
        setIsUserModalOpen(false);
        setNewUserName(''); setNewUserEmail(''); setNewUserPassword('');
        notifyBell('👤 Novo Colaborador', `${data.nome} cadastrado com sucesso.`);
        registerLog('Novo Colaborador', `Cadastrou ${data.nome} no setor ${data.setor} como ${data.cargo}.`);
      } else {
        notifyBell('Perfil pendente', 'A autenticação foi criada, mas o perfil não foi salvo. Tente novamente neste formulário para concluir o mesmo usuário.');
      }
    } catch (error) {
      notifyBell('Erro no cadastro', messageOf(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteUser = (id: string, nome: string) => {
    if (!isManager || (!isAdmin&&companyUsers.find(u=>u.id===id)?.cargo==='administrador') || id === currentUser?.id) return notifyBell('Ação indisponível', 'Não é permitido excluir seu próprio perfil.');
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Colaborador',
      message: `Remover o perfil Doo Doo de ${nome}? A conta de autenticação compartilhada será preservada.`,
      isDestructive: true,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setUpdatingUserId(id);

        try {
          const { data, error } = await supabase.from('doodoo_perfis').delete().eq('id', id).select('*').single();
          if (error) throw error;
          if (!data) throw new Error('O banco não confirmou a exclusão do perfil.');
          setCompanyUsers(prev => prev.filter(u => u.id !== id));
          if (currentUsers.length === 1 && currentPage > 1) setCurrentPage(p => Math.max(1, p - 1));
          notifyBell('Colaborador removido', `${nome} foi excluído apenas do Doo Doo. A conta compartilhada do Auth foi preservada.`);
          void registerLog('Remoção de Perfil', `Removeu o perfil Doo Doo de ${nome}; Auth compartilhado preservado.`);
        } catch (error) {
          notifyBell('Perfil não excluído', describeDatabaseFailure(error));
        } finally {
          setUpdatingUserId(null);
        }
      }
    });
  };

  const mutatePermission=async(tabKey:string,field:'cargos_permitidos'|'usuarios_permitidos',value:string)=>{
    if(!isAdmin)return;
    await permissionActions.run(tabKey,async()=>{
      for(let attempt=0;attempt<3;attempt++){
        const latest=requireResult<PermissionRow>(await supabase.from('doodoo_permissoes').select('*').eq('aba_key',tabKey).single());
        const before=latest[field]||[];const values=before.includes(value)?before.filter(v=>v!==value):[...before,value];
        const result=await supabase.from('doodoo_permissoes').update({[field]:values}).eq('aba_key',tabKey).filter(field,'eq',JSON.stringify(before)).select('*').maybeSingle();
        if(result.error)throw result.error;if(!result.data)continue;
        setTabPermissions(prev=>prev.map(tab=>tab.tabKey===tabKey?{...tab,allowedRoles:result.data.cargos_permitidos,allowedUsers:result.data.usuarios_permitidos}:tab));notifyBell('Controle de Acesso','Permissão confirmada.');return;
      }
      throw new Error('A permissão mudou em outra sessão. Tente novamente.');
    });
  };
  const toggleRolePermission=(tabKey:string,role:RoleType)=>mutatePermission(tabKey,'cargos_permitidos',role);
  const toggleUserException=(userId:string,tabKey:string)=>mutatePermission(tabKey,'usuarios_permitidos',userId);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim() || isSavingCategory) return;
    setIsSavingCategory(true);

    try {
      const { data, error } = await supabase.from('doodoo_tarefas_categorias').insert([{ nome: newCategoryName.trim(), cor: newCategoryColor }]).select().single();

      if (error) throw error;
      if (!data) throw new Error('O banco não confirmou a criação da categoria.');
      setTaskCategories(prev => [...prev, data]);
      setNewCategoryName('');
      notifyBell('Categoria criada', `A categoria ${data.nome} foi adicionada com sucesso.`);
    } catch (error) {
      notifyBell('Categoria não criada', describeDatabaseFailure(error));
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleDeleteCategory = (id: string, nome: string) => {
    setConfirmModal({
      isOpen: true, title: 'Excluir Categoria', message: `Tem a certeza que deseja excluir a categoria "${nome}"?`, isDestructive: true,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          const { data, error } = await supabase.from('doodoo_tarefas_categorias').delete().eq('id', id).select('*').single();
          if (error) throw error;
          if (!data) throw new Error('O banco não confirmou a exclusão da categoria.');
          setTaskCategories(prev => prev.filter(c => c.id !== id));
          notifyBell('Categoria removida', `A categoria ${nome} foi excluída.`);
        } catch (error) {
          notifyBell('Categoria não excluída', describeDatabaseFailure(error));
        }
      }
    });
  };

  const handleTogglePrivacySetting = async (field: 'read_receipts' | 'email_notifications') => {
    if (!currentUser || isUpdatingPrivacy) return;
    setIsUpdatingPrivacy(true);

    const currentValue = Boolean(currentUser[field] ?? (field === 'read_receipts'));
    const newValue = !currentValue;

    setCurrentUser({ ...currentUser, [field]: newValue });

    try {
      const { data, error } = await supabase.from('doodoo_perfis').update({ [field]: newValue }).eq('user_id', currentUser.user_id).select('*').single();
      if (error) throw error;
      if (!data) throw new Error('O banco não confirmou a alteração.');
      notifyBell('Privacidade salva', 'A preferência foi atualizada.');
    } catch (error) {
      setCurrentUser(previous => previous ? { ...previous, [field]: currentValue } : previous);
      notifyBell('Preferência não salva', describeDatabaseFailure(error));
    } finally {
      setIsUpdatingPrivacy(false);
    }
  };

  // Exportação de um canal: preserva as mensagens marcadas como apagadas para auditoria.
  const handleDownloadTranscript = async (canalId: string, canalNome: string) => {
    if (!isAdmin || isDownloadingTranscript || isDownloadingZip || isPurging || isPurgingGlobal) return;
    setIsDownloadingTranscript(canalId);
    try {
      const data = await fetchChatHistory(canalId);
      if (data.length === 0) {
        notifyBell('Sem mensagens', 'Nenhuma mensagem visível foi encontrada neste canal.');
        return;
      }
      const lines = [
        '========================================================',
        'AUDITORIA DE CHAT',
        '========================================================',
        '',
        ...data.map(m => `[${formatPortalDateTime(m.created_at)}] ${m.sender_nome}: ${m.metadata?.deleted ? '[APAGADA] ' : ''}${m.texto}`),
      ];
      saveTextOrZip(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }), `Auditoria_${canalNome.replace(/[\/\\:?*"<>|]/g, '')}.txt`);
      notifyBell('Exportação concluída', `${data.length} mensagem(ns) incluída(s) no arquivo.`);
    } catch (error) {
      notifyBell('Falha na exportação', describeDatabaseFailure(error));
    } finally {
      setIsDownloadingTranscript(null);
    }
  };

  // Backup: não declara sucesso quando uma consulta falha ou excede o limite de memória.
  const handleDownloadZipBackup = async () => {
    if (!isAdmin || isDownloadingZip || isDownloadingTranscript || isPurging || isPurgingGlobal) return;
    setIsDownloadingZip(true);
    try {
      const allMsgs = await fetchChatHistory();
      if (allMsgs.length === 0) {
        notifyBell('Sem mensagens', 'Nenhuma mensagem visível para exportar.');
        return;
      }
      const zip = new JSZip();
      const grouped = allMsgs.reduce<Record<string, MessageRow[]>>((acc, row) => {
        (acc[row.canal_id] ||= []).push(row);
        return acc;
      }, {});
      Object.entries(grouped).forEach(([channelId, messages]) => {
        const channel = adminChannels.find(c => c.id === channelId);
        const cleanName = (channel?.name || `Chat_${channelId.slice(0, 6)}`).replace(/[\/\\:?*"<>|]/g, '');
        const lines = [`AUDITORIA - ${channel?.name || channelId}`, '', ...messages.map(m =>
          `[${formatPortalDateTime(m.created_at)}] ${m.sender_nome}: ${m.metadata?.deleted ? '[APAGADA] ' : ''}${m.texto}`
        )];
        zip.file(`Auditoria_${cleanName}_${channelId.slice(0, 8)}.txt`, lines.join('\n'));
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      saveTextOrZip(blob, 'Backup_Total_DooDoo.zip');
      notifyBell('Backup preparado', `${allMsgs.length} mensagem(ns) incluída(s). Não contém dados que o RLS ocultou.`);
    } catch (error) {
      notifyBell('Backup não concluído', describeDatabaseFailure(error));
    } finally {
      setIsDownloadingZip(false);
    }
  };

  // Remoção de canal: operações sobre tabelas Doo Doo, sem presunção de privilégios RLS.
  const handleDeleteChannel = (canalId: string, canalNome: string) => {
    if (!isAdmin || isPurging || isPurgingGlobal || isDownloadingZip || isDownloadingTranscript) return;
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Canal',
      message: `Deseja excluir permanentemente o canal "${canalNome}" e seu histórico? A operação pode ser interrompida por políticas RLS ou dependências do banco.`,
      isDestructive: true,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setIsPurging(canalId);
        let historyWasDeleted = false;
        try {
          if (!atomicWrites) {
            const result = await deleteVisibleMessages({ channelId: canalId });
            historyWasDeleted = result.removed > 0;
            if (result.remaining > 0) throw new Error(`${result.remaining} mensagem(ns) continuam visíveis. Canal preservado.`);

            const priorNotes = await supabase.from('doodoo_chat_notas').select('id', { count: 'exact', head: true }).eq('canal_id', canalId);
            if (priorNotes.error) throw priorNotes.error;
            if ((priorNotes.count ?? 0) > 0) {
              const deletedNotes = await supabase.from('doodoo_chat_notas').delete({ count: 'exact' }).eq('canal_id', canalId).select('id');
              if (deletedNotes.error) throw deletedNotes.error;
              const leftNotes = await supabase.from('doodoo_chat_notas').select('id', { count: 'exact', head: true }).eq('canal_id', canalId);
              if (leftNotes.error) throw leftNotes.error;
              if ((leftNotes.count ?? 0) > 0) throw new Error('Alguns avisos do canal não puderam ser excluídos. O canal foi preservado.');
            }
          }

          const { data, error } = await supabase.from('doodoo_canais')
            .delete({ count: 'exact' }).eq('id', canalId).select('id').maybeSingle();
          if (error) throw error;
          if (!data) throw new Error('O banco não confirmou a remoção do canal. Verifique RLS DELETE em doodoo_canais.');
          setAdminChannels(prev => prev.filter(c => c.id !== canalId));

          // O nome atomicWrites não garante, sozinho, que a FK tenha ON DELETE CASCADE.
          if (atomicWrites) {
            try {
              const remaining = await countVisibleMessages({ channelId: canalId });
              if (remaining > 0) {
                notifyBell('Canal excluído com pendências', `${remaining} mensagem(ns) continuam visíveis. Revisar cascata/FKs antes de outras exclusões.`);
                return;
              }
            } catch {
              notifyBell('Canal removido', 'O canal foi removido, mas não foi possível confirmar a remoção do histórico.');
              return;
            }
          }
          notifyBell('Canal excluído', `O canal "${canalNome}" foi removido. Confirme também arquivos do Storage, se houver.`);
          void registerLog('Exclusão de Canal', `Excluiu o canal ${canalNome} (${canalId}).`);
        } catch (error) {
          notifyBell('Exclusão de canal interrompida', `${describeDatabaseFailure(error)}${historyWasDeleted ? ' O histórico pode ter sido parcialmente removido; não repita a operação sem conferir o banco.' : ''}`);
        } finally {
          setIsPurging(null);
        }
      },
    });
  };

  // Exclusão definitiva apenas das mensagens do grupo escolhido; o canal é preservado.
  const handlePurgeChannel = (canalId: string, canalNome: string) => {
    if (!isAdmin || isPurging || isPurgingGlobal || isDownloadingZip || isDownloadingTranscript) return;
    setConfirmModal({
      isOpen: true,
      title: 'Limpar Mensagens',
      message: `Deseja apagar definitivamente as mensagens do grupo "${canalNome}"? O canal permanecerá ativo. Esta ação não pode ser desfeita.`,
      isDestructive: true,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setIsPurging(canalId);
        try {
          const { visibleBefore, removed, remaining } = await deleteVisibleMessages({ channelId: canalId });
          if (visibleBefore === 0) {
            notifyBell('Nenhuma mensagem visível', 'Não há mensagens acessíveis para este canal; isso não confirma que o banco esteja vazio.');
          } else if (remaining > 0) {
            notifyBell('Limpeza parcial', `${removed} excluída(s), mas ${remaining} mensagem(ns) ainda aparecem. Verifique as permissões ou envios simultâneos.`);
          } else {
            notifyBell('Histórico limpo', `${removed} mensagem(ns) excluída(s) do canal.`);
            if (removed > 0) void registerLog('Limpeza de Canal', `Removeu ${removed} mensagem(ns) do canal ${canalNome} (${canalId}).`);
          }
        } catch (error) {
          notifyBell('Falha ao limpar mensagens', describeDatabaseFailure(error));
        } finally {
          setIsPurging(null);
        }
      },
    });
  };

  // Limpeza manual do que for anterior a sete dias, nunca uma rotina automática.
  const handlePurgeOldGlobal = () => {
    if (!isAdmin || isPurging || isPurgingGlobal || isDownloadingZip || isDownloadingTranscript) return;
    setConfirmModal({
      isOpen: true,
      title: 'Limpeza Global do Chat',
      message: 'Apagar definitivamente as mensagens do Doo Doo anteriores a sete dias? Esta operação é irreversível e está sujeita às políticas RLS.',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setIsPurgingGlobal(true);
        const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        try {
          const { visibleBefore, removed, remaining } = await deleteVisibleMessages({ before: cutoff });
          if (visibleBefore === 0) {
            notifyBell('Nenhuma mensagem visível', 'Não há mensagens anteriores a sete dias acessíveis à sua sessão.');
          } else if (remaining > 0) {
            notifyBell('Limpeza incompleta', `${removed} excluída(s); ${remaining} ainda estão visíveis. Revise as permissões e tente somente após conferir o banco.`);
          } else {
            notifyBell('Limpeza concluída', `${removed} mensagem(ns) anteriores a sete dias removida(s).`);
            if (removed > 0) await registerLog('Limpeza de Base de Dados', `Excluiu ${removed} mensagem(ns) anteriores a ${cutoff} (Doo Doo).`);
          }
        } catch (error) {
          notifyBell('Limpeza não confirmada', describeDatabaseFailure(error));
        } finally {
          setIsPurgingGlobal(false);
        }
      },
    });
  };

  // PAGINAÇÕES


  const searchedUsers = useMemo(() => {
    return companyUsers.filter(u => u.nome.toLowerCase().includes(userSearch.toLowerCase()) || u.setor.toLowerCase().includes(userSearch.toLowerCase()));
  }, [companyUsers, userSearch]);

  const totalPages = Math.ceil(searchedUsers.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentUsers = searchedUsers.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const usersWithExceptions = useMemo(() => {
    return companyUsers.filter(u => tabPermissions.some(tab => tab.allowedUsers.includes(u.user_id)));
  }, [companyUsers, tabPermissions]);


  const filteredLogs = useMemo(() => {
    if (!logSearch.trim()) return systemLogs;
    const lowerQ = logSearch.toLowerCase();
    return systemLogs.filter(l => l.autor_nome.toLowerCase().includes(lowerQ) || l.acao.toLowerCase().includes(lowerQ) || l.detalhes.toLowerCase().includes(lowerQ));
  }, [systemLogs, logSearch]);

  const totalLogPages = Math.ceil(filteredLogs.length / LOGS_PER_PAGE) || 1;
  const startLogIndex = (logPage - 1) * LOGS_PER_PAGE;
  const currentLogs = filteredLogs.slice(startLogIndex, startLogIndex + LOGS_PER_PAGE);

  const renderPaginationNumbers = (current: number, total: number, setPage: (p: number) => void) => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, current - Math.floor(maxVisible / 2));
    const end = Math.min(total, start + maxVisible - 1);
    if (total >= maxVisible && end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);

    for (let i = start; i <= end; i++) {
      pages.push(
        <button
          key={i}
          type="button"
          onClick={() => setPage(i)}
          className={`w-7 h-7 rounded-lg text-xs font-semibold flex items-center justify-center transition-colors cursor-pointer ${current === i ? 'text-white border-transparent' : 'border hover:bg-[var(--surface-hover)]'}`}
          style={current === i ? primaryActionStyle : { borderColor: 'var(--border-input)' }}
        >
          {i}
        </button>
      );
    }
    return pages;
  };

  const dataUltimaLimpeza = useMemo(() => {
    const ultimoRegisto = systemLogs.find(log => log.acao === 'Limpeza de Base de Dados');
    return ultimoRegisto ? formatPortalDateTime(ultimoRegisto.created_at) : 'Não identificada nos registros carregados';
  }, [systemLogs]);

  if (isLoading || !isMounted) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-brand-panel" />
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          Carregando configurações...
        </span>
      </div>
    );
  }

  if (authError || !currentUser) return <Notice>Não foi possível carregar as configurações. Atualize a página para tentar novamente.</Notice>;

  const activeTabSubtitle =
    activeTab === 'geral'
      ? 'Personalize sua aparência, foto de perfil e consulte seus dados corporativos.'
      : activeTab === 'notificacoes'
        ? 'Gerencie alertas no Windows, som do portal, digitação e privacidade no chat.'
        : activeTab === 'usuarios'
          ? 'Cadastre colaboradores, ajuste cargos, setores e controle o acesso à plataforma.'
          : activeTab === 'permissoes'
            ? 'Configure a matriz de acesso por cargo e conceda exceções individuais.'
            : activeTab === 'categorias'
              ? 'Padronize as etiquetas e cores utilizadas para classificar tarefas do setor.'
              : 'Consulte a trilha de auditoria, exporte backups e gerencie a retenção do chat.';

  return (
    <div className="settings-workspace w-full h-full min-h-0 min-w-0 flex-1 flex flex-col pb-0 relative z-0">

      {isPurgingGlobal && (
        <ModalShell open busy title="Limpeza em andamento" onClose={() => {}}>
          <div className="flex flex-col items-center p-6 text-center">
            <Database className="w-12 h-12 mb-4 text-brand-panel animate-pulse" />
            <h2 className="text-xl font-semibold mb-2">A Executar Limpeza Profunda...</h2>
            <p className="text-xs opacity-70 mb-6 font-medium max-w-sm text-center">Isto pode demorar alguns segundos. Por favor, não feche nem atualize a página.</p>
            <Loader2 role="status" aria-label="Processando limpeza" className="h-6 w-6 animate-spin" />
          </div>
        </ModalShell>
      )}

      <div className="settings-shell w-full min-h-0 min-w-0 flex-1 flex flex-col lg:flex-row rounded-none md:rounded-2xl border-t md:border overflow-hidden" style={glassContainerStyle}>
        {/* SIDEBAR DE CONFIGURAÇÕES V2 */}
        <aside className="settings-sidebar hidden lg:flex flex-col w-[256px] shrink-0" style={glassSidebarStyle}>
          <div className="p-5 space-y-5 flex-1 overflow-y-auto custom-scrollbar">
            <div className="flex items-center gap-3 pb-4 border-b" style={{ borderColor: 'var(--border-input)' }}>
              <span className="settings-brand-icon">
                <Settings className="w-[18px] h-[18px]" />
              </span>
              <div className="min-w-0">
                <h3 className="font-bold text-[15px] tracking-tight truncate">Painel de Ajustes</h3>
                <p className="text-[11px] font-medium truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Doo Doo Workspace
                </p>
              </div>
            </div>

            {/* Cartão compacto do usuário */}
            <div
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl border"
              style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-semibold text-xs flex-shrink-0"
                style={primaryActionStyle}
              >
                {getInitials(currentUser.nome)}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-[13px] tracking-tight truncate">{currentUser.nome}</p>
                <p className="text-[10.5px] font-medium uppercase tracking-wider truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {currentUser.cargo} · {currentUser.setor}
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <div className="settings-nav-label">
                <span className="settings-accent-bar" aria-hidden="true" />
                <span>Pessoal</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('geral')}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-[13px] transition-all cursor-pointer ${
                  activeTab === 'geral' ? 'text-white font-semibold' : 'font-medium hover:bg-[var(--surface-hover)]'
                }`}
                style={activeTab === 'geral' ? primaryActionStyle : { color: 'var(--text-muted)' }}
              >
                <Settings className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">Meu Perfil</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('notificacoes')}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-[13px] transition-all cursor-pointer ${
                  activeTab === 'notificacoes' ? 'text-white font-semibold' : 'font-medium hover:bg-[var(--surface-hover)]'
                }`}
                style={activeTab === 'notificacoes' ? primaryActionStyle : { color: 'var(--text-muted)' }}
              >
                <Bell className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">Privacidade</span>
              </button>

              {isManager && (
                <>
                  <div className="settings-nav-label pt-3">
                    <span className="settings-accent-bar" aria-hidden="true" />
                    <span>Gestão</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('usuarios')}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-[13px] transition-all cursor-pointer ${
                      activeTab === 'usuarios' ? 'text-white font-semibold' : 'font-medium hover:bg-[var(--surface-hover)]'
                    }`}
                    style={activeTab === 'usuarios' ? primaryActionStyle : { color: 'var(--text-muted)' }}
                  >
                    <Users className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">Equipe &amp; Colaboradores</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('permissoes')}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-[13px] transition-all cursor-pointer ${
                      activeTab === 'permissoes' ? 'text-white font-semibold' : 'font-medium hover:bg-[var(--surface-hover)]'
                    }`}
                    style={activeTab === 'permissoes' ? primaryActionStyle : { color: 'var(--text-muted)' }}
                  >
                    <Shield className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">Permissões de Abas</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('categorias')}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-[13px] transition-all cursor-pointer ${
                      activeTab === 'categorias' ? 'text-white font-semibold' : 'font-medium hover:bg-[var(--surface-hover)]'
                    }`}
                    style={activeTab === 'categorias' ? primaryActionStyle : { color: 'var(--text-muted)' }}
                  >
                    <Tags className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">Categorias de Tarefas</span>
                  </button>
                </>
              )}

              {isAdmin && (
                <>
                  <div className="settings-nav-label pt-3">
                    <span className="settings-accent-bar" aria-hidden="true" />
                    <span>Sistema</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('logs')}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-[13px] transition-all cursor-pointer ${
                      activeTab === 'logs' ? 'text-white font-semibold' : 'font-medium hover:bg-[var(--surface-hover)]'
                    }`}
                    style={activeTab === 'logs' ? primaryActionStyle : { color: 'var(--text-muted)' }}
                  >
                    <Activity className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">Auditoria &amp; Dados</span>
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="p-4 border-t flex flex-col items-center justify-center flex-shrink-0" style={{ borderColor: 'var(--border-input)' }}>
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] mb-3" style={{ color: 'var(--text-muted)' }}>
              Tema da Interface
            </span>
            <div className="grid grid-cols-5 gap-2.5">
              {themes.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => changeTheme(t.id)}
                  style={{
                    width: '20px',
                    height: '20px',
                    backgroundColor: t.color,
                    border: `1px solid ${t.border}`,
                    boxShadow: theme === t.id ? `0 0 0 2px var(--bg-card), 0 0 0 4px ${t.border}` : '0 1px 3px rgba(0,0,0,0.14)',
                  }}
                  className={`rounded-full transition-transform duration-200 cursor-pointer ${theme === t.id ? 'scale-110' : 'opacity-80 hover:opacity-100 hover:scale-110'}`}
                  title={t.name}
                  aria-label={`Tema ${t.name}`}
                />
              ))}
            </div>
          </div>
        </aside>

        {/* ÁREA DE CONTEÚDO PRINCIPAL */}
        <div className="settings-main min-h-0 min-w-0 flex-1 flex flex-col h-full overflow-hidden" style={{ backgroundColor: 'var(--bg-card)' }}>
          {/* HERO HEADER EXECUTIVO V2 */}
          <header className="settings-header flex flex-col sm:flex-row sm:items-center justify-between gap-4 flex-shrink-0" style={heroSurfaceStyle}>
            <div className="settings-header-grid" style={heroGridStyle} aria-hidden="true" />
            <div className="settings-header-art" aria-hidden="true">
              <HeroOrbitalArt className="w-full h-full" />
            </div>
            <div className="relative z-10 min-w-0">
              <p className="settings-header-eyebrow">Painel de Controle</p>
              <h2 className="font-bold tracking-tight text-white">
                {activeTab === 'geral' && 'Meu Perfil'}
                {activeTab === 'usuarios' && 'Controle de Colaboradores'}
                {activeTab === 'permissoes' && 'Permissões e Exceções VIP'}
                {activeTab === 'categorias' && 'Categorias das Tarefas'}
                {activeTab === 'notificacoes' && 'Notificações e privacidade'}
                {activeTab === 'logs' && 'Auditoria de Sistema & Dados'}
              </h2>
              <p className="settings-header-sub">{activeTabSubtitle}</p>
            </div>
            <div className="relative z-10 flex items-center gap-3 flex-shrink-0">
              {activeTab === 'geral' && (
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  disabled={isSaving}
                  className="settings-save-btn px-5 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>Salvar Alterações</span>
                </button>
              )}
            </div>
          </header>

          {/* ABAS MOBILE */}
          <div
            className="settings-mobile-tabs lg:hidden flex overflow-x-auto px-4 py-3 border-b gap-2 flex-shrink-0 custom-scrollbar"
            style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-card)' }}
          >
            {[
              { id: 'geral', label: 'Meu Perfil' },
              { id: 'notificacoes', label: 'Privacidade' },
              ...(isManager
                ? [
                    { id: 'usuarios', label: 'Colaboradores' },
                    { id: 'permissoes', label: 'Permissões' },
                    { id: 'categorias', label: 'Categorias' },
                  ]
                : []),
              ...(isAdmin ? [{ id: 'logs', label: 'Auditoria' }] : []),
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                  activeTab === tab.id ? 'text-white' : 'border'
                }`}
                style={
                  activeTab === tab.id
                    ? primaryActionStyle
                    : { backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-muted)' }
                }
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="settings-content min-h-0 min-w-0 flex-1 overflow-y-auto space-y-5 custom-scrollbar">
            {/* MEU PERFIL */}
            {activeTab === 'geral' && (
              <form onSubmit={handleSaveProfile} className="space-y-5 max-w-3xl">
                <section className="settings-appearance">
                  <div className="settings-section-title">
                    <span>
                      <Settings size={19} />
                    </span>
                    <div>
                      <h3>Aparência do portal</h3>
                      <p>Escolha o tema que deixa sua rotina mais confortável.</p>
                    </div>
                  </div>
                  <label>
                    <span>Tema</span>
                    <select aria-label="Tema das configurações" value={theme} onChange={(e) => changeTheme(e.target.value)}>
                      {themes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </section>

                <div className="settings-card p-6 rounded-2xl border space-y-5" style={solidCardStyle}>
                  <div className="settings-card-head">
                    <span className="settings-accent-bar" aria-hidden="true" />
                    <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                      Foto de Perfil (Avatar)
                    </h3>
                  </div>
                  <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
                    <div className="relative flex-shrink-0 w-20 h-20">
                      {currentUser.avatar_url ? (
                        <>
                          <img
                            src={currentUser.avatar_url}
                            alt="Avatar"
                            className="w-20 h-20 rounded-2xl object-cover border relative z-10"
                            style={{ borderColor: 'var(--border-input)' }}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                          <div
                            className="w-20 h-20 rounded-2xl text-white font-bold flex items-center justify-center text-xl absolute inset-0 z-0 hidden"
                            style={primaryActionStyle}
                          >
                            {getInitials(currentUser.nome)}
                          </div>
                        </>
                      ) : (
                        <div
                          className="w-20 h-20 rounded-2xl text-white font-bold flex items-center justify-center text-xl"
                          style={primaryActionStyle}
                        >
                          {getInitials(currentUser.nome)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 w-full">
                      <label htmlFor="field-1" className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                        URL da Imagem
                      </label>
                      <input
                        id="field-1"
                        type="url"
                        value={currentUser.avatar_url || ''}
                        onChange={(e) => setCurrentUser((prev) => (prev ? { ...prev, avatar_url: e.target.value } : null))}
                        placeholder="https://exemplo.com/foto.jpg"
                        className="w-full px-3.5 py-3 rounded-xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors"
                        style={solidInputStyle}
                      />
                    </div>
                  </div>
                </div>

                <div className="settings-card p-6 rounded-2xl border space-y-5" style={solidCardStyle}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="settings-card-head">
                      <span className="settings-accent-bar" aria-hidden="true" />
                      <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                        Dados Profissionais Básicos
                      </h3>
                    </div>
                    <span
                      className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider"
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--tab-active) 10%, var(--bg-card))',
                        color: 'var(--tab-active)',
                      }}
                    >
                      Leitura Apenas
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <label htmlFor="field-2" className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                        Nome Completo
                      </label>
                      <input
                        id="field-2"
                        type="text"
                        value={currentUser.nome}
                        readOnly
                        className="w-full px-3.5 py-3 rounded-xl border text-sm font-medium outline-none"
                        style={solidInputStyle}
                      />
                    </div>
                    <div>
                      <label htmlFor="field-3" className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                        E-mail Corporativo
                      </label>
                      <input
                        id="field-3"
                        type="email"
                        value={currentUser.email}
                        disabled
                        className="w-full px-3.5 py-3 rounded-xl border text-sm font-medium outline-none opacity-75 cursor-not-allowed"
                        style={solidInputStyle}
                      />
                    </div>
                    <div>
                      <label htmlFor="field-4" className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                        Cargo e Acesso
                      </label>
                      <input
                        id="field-4"
                        type="text"
                        value={currentUser.cargo.toUpperCase()}
                        disabled
                        className="w-full px-3.5 py-3 rounded-xl border text-sm font-medium outline-none opacity-75 cursor-not-allowed"
                        style={solidInputStyle}
                      />
                    </div>
                    <div>
                      <label htmlFor="field-5" className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                        Setor Atribuído
                      </label>
                      <input
                        id="field-5"
                        type="text"
                        value={currentUser.setor}
                        disabled
                        title="Para alterar o seu setor, um gestor deve fazê-lo na aba Colaboradores."
                        className="w-full px-3.5 py-3 rounded-xl border text-sm font-medium outline-none opacity-75 cursor-not-allowed"
                        style={solidInputStyle}
                      />
                    </div>
                  </div>
                </div>
              </form>
            )}

            {/* GESTÃO DE EQUIPE */}
            {activeTab === 'usuarios' && isManager && (
              <div className="space-y-5 w-full">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="relative w-full sm:w-80">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      value={userSearch}
                      onChange={(e) => {
                        setUserSearch(e.target.value);
                        setCurrentPage(1);
                      }}
                      placeholder="Pesquisar colaborador..."
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors"
                      style={solidCardStyle}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsUserModalOpen(true)}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer hover:brightness-105 transition-all"
                    style={primaryActionStyle}
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Novo Colaborador</span>
                  </button>
                </div>

                <div className="rounded-2xl border overflow-hidden w-full" style={solidCardStyle}>
                  <div className="overflow-x-auto w-full custom-scrollbar">
                    <table className="w-full text-left text-xs whitespace-nowrap min-w-[600px]">
                      <thead>
                        <tr
                          className="border-b font-bold uppercase text-[10.5px] tracking-wider"
                          style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-input)', color: 'var(--text-muted)' }}
                        >
                          <th className="px-5 py-3.5">Colaborador</th>
                          <th className="px-5 py-3.5">Cargo</th>
                          <th className="px-5 py-3.5">Setor</th>
                          <th className="px-5 py-3.5 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-input)]">
                        {currentUsers.map((user) => {
                          const isUpdatingThis = updatingUserId === user.id;
                          return (
                            <tr key={user.id} className={`transition-colors hover:bg-[var(--surface-hover)] ${user.status === 'bloqueado' ? 'opacity-65' : ''}`}>
                              <td className="px-5 py-3.5 font-medium flex items-center gap-3">
                                {isUpdatingThis ? (
                                  <div className="w-9 h-9 rounded-xl flex items-center justify-center border bg-brand-panel/10 border-brand-panel/30">
                                    <Loader2 className="w-4 h-4 text-brand-panel animate-spin" />
                                  </div>
                                ) : user.avatar_url ? (
                                  <div className="relative w-9 h-9">
                                    <img
                                      src={user.avatar_url}
                                      alt=""
                                      className="w-9 h-9 rounded-xl object-cover border relative z-10"
                                      style={{ borderColor: 'var(--border-input)' }}
                                      onError={(e) => {
                                        e.currentTarget.style.display = 'none';
                                        e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                      }}
                                    />
                                    <div
                                      className="w-9 h-9 rounded-xl text-white font-semibold flex items-center justify-center text-xs absolute inset-0 z-0 hidden"
                                      style={primaryActionStyle}
                                    >
                                      {getInitials(user.nome)}
                                    </div>
                                  </div>
                                ) : (
                                  <div
                                    className="w-9 h-9 rounded-xl text-white font-semibold flex items-center justify-center text-xs"
                                    style={primaryActionStyle}
                                  >
                                    {getInitials(user.nome)}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <span className="text-sm font-semibold block">{user.nome}</span>
                                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                    {user.email}
                                  </span>
                                </div>
                              </td>
                              <td className="px-5 py-3.5 w-[160px]">
                                <select
                                  aria-label={'Cargo de ' + user.nome}
                                  value={user.cargo}
                                  disabled={user.status === 'bloqueado' || isUpdatingThis || user.id === currentUser.id || (!isAdmin && user.cargo === 'administrador')}
                                  onChange={(e) => handleUpdateUserRoleAndSector(user.id, 'cargo', e.target.value)}
                                  className="w-full px-2.5 py-2 rounded-xl border font-semibold text-xs uppercase outline-none cursor-pointer disabled:opacity-65"
                                  style={solidInputStyle}
                                >
                                  <option value="administrador">Admin</option>
                                  <option value="gestor">Gestor</option>
                                  <option value="coordenador">Coordenador</option>
                                  <option value="supervisor">Supervisor</option>
                                  <option value="analista">Analista</option>
                                  <option value="colaborador">Colaborador</option>
                                </select>
                              </td>
                              <td className="px-5 py-3.5 w-[170px]">
                                <select
                                  aria-label={'Setor de ' + user.nome}
                                  value={user.setor}
                                  disabled={user.status === 'bloqueado' || isUpdatingThis || user.id === currentUser.id || (!isAdmin && user.cargo === 'administrador')}
                                  onChange={(e) => handleUpdateUserRoleAndSector(user.id, 'setor', e.target.value)}
                                  className="w-full px-2.5 py-2 rounded-xl border font-medium text-xs outline-none cursor-pointer disabled:opacity-65"
                                  style={solidInputStyle}
                                >
                                  {SECTORS.map((s) => (
                                    <option key={s} value={s}>
                                      {s}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-5 py-3.5 text-right space-x-1">
                                <button
                                  type="button"
                                  onClick={() => handleToggleUserStatus(user.id, user.nome, user.status)}
                                  disabled={isUpdatingThis}
                                  className="p-2 text-brand-panel hover:bg-[var(--surface-hover)] rounded-xl cursor-pointer transition-colors disabled:opacity-70"
                                  aria-label={user.status === 'bloqueado' ? 'Desbloquear Acesso' : 'Bloquear Acesso'}
                                  title={user.status === 'bloqueado' ? 'Desbloquear Acesso' : 'Bloquear Acesso'}
                                >
                                  {user.status === 'bloqueado' ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(user.id, user.nome)}
                                  disabled={isUpdatingThis}
                                  className="p-2 text-[var(--error-text)] hover:bg-red-500/10 rounded-xl cursor-pointer transition-colors disabled:opacity-70"
                                  aria-label="Excluir Colaborador"
                                  title="Excluir Colaborador"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {currentUsers.length === 0 && (
                          <tr>
                            <td colSpan={4} className="p-8 text-center font-medium text-xs" style={{ color: 'var(--text-muted)' }}>
                              Nenhum colaborador encontrado.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {totalPages > 1 && (
                    <div className="px-5 py-3.5 border-t flex items-center justify-between" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-input)' }}>
                      <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                        Página {currentPage} de {totalPages}
                      </span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          aria-label="Anterior"
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          className="p-2 rounded-lg border hover:bg-[var(--surface-hover)] disabled:opacity-35 cursor-pointer transition-colors"
                          style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-card)' }}
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          aria-label="Próximo"
                          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                          className="p-2 rounded-lg border hover:bg-[var(--surface-hover)] disabled:opacity-35 cursor-pointer transition-colors"
                          style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-card)' }}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* CATEGORIAS */}
            {activeTab === 'categorias' && isManager && (
              <div className="space-y-5 max-w-4xl">
                <form onSubmit={handleAddCategory} className="flex flex-col sm:flex-row items-end gap-3 p-5 rounded-2xl border" style={solidCardStyle}>
                  <div className="flex-1 w-full">
                    <label htmlFor="field-6" className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                      Nome da Categoria
                    </label>
                    <input
                      id="field-6"
                      type="text"
                      required
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Ex: Infraestrutura, Urgente..."
                      className="w-full px-3.5 py-2.5 rounded-xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors"
                      style={solidInputStyle}
                    />
                  </div>
                  <div className="w-full sm:w-auto">
                    <label htmlFor="field-7" className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                      Cor da Tag
                    </label>
                    <input
                      id="field-7"
                      type="color"
                      value={newCategoryColor}
                      onChange={(e) => setNewCategoryColor(e.target.value)}
                      className="w-full sm:w-14 h-[42px] p-1 rounded-xl border cursor-pointer"
                      style={solidInputStyle}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSavingCategory}
                    className="w-full sm:w-auto h-[42px] px-5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-1.5 cursor-pointer hover:brightness-105 transition-all disabled:opacity-70"
                    style={primaryActionStyle}
                  >
                    {isSavingCategory ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    <span>Adicionar</span>
                  </button>
                </form>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {taskCategories.map((cat) => (
                    <div key={cat.id} className="p-4 rounded-xl border flex items-center justify-between gap-2" style={solidCardStyle}>
                      <div className="flex items-center gap-3 overflow-hidden">
                        <span className="w-3.5 h-3.5 rounded-full flex-shrink-0 ring-2 ring-offset-2" style={{ backgroundColor: cat.cor, '--tw-ring-color': cat.cor, '--tw-ring-offset-color': 'var(--bg-card)' } as React.CSSProperties} />
                        <span className="text-xs font-semibold truncate">{cat.nome}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(cat.id, cat.nome)}
                        className="p-2 text-[var(--error-text)] hover:bg-red-500/10 rounded-lg cursor-pointer transition-colors"
                        aria-label="Excluir Categoria"
                        title="Excluir Categoria"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {taskCategories.length === 0 && (
                    <div className="col-span-full p-8 text-center font-medium text-xs rounded-2xl border border-dashed" style={{ color: 'var(--text-muted)', borderColor: 'var(--border-input)' }}>
                      Nenhuma categoria encontrada ou acesso bloqueado por RLS.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* PERMISSÕES E VIPs */}
            {activeTab === 'permissoes' && isManager && (
              <div className="space-y-7 w-full">
                <div className="space-y-3.5">
                  <div>
                    <div className="settings-card-head">
                      <span className="settings-accent-bar" aria-hidden="true" />
                      <h3 className="text-sm font-bold flex items-center gap-2">
                        <Users className="w-4 h-4 text-brand-panel" />
                        Matriz de Acesso por Cargo
                      </h3>
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      Defina as permissões nativas. Todos os colaboradores do cargo selecionado terão acesso imediato à aba correspondente.
                    </p>
                  </div>
                  <div className="rounded-2xl border overflow-hidden w-full" style={solidCardStyle}>
                    <div className="overflow-x-auto w-full custom-scrollbar">
                      <table className="w-full text-left border-collapse text-xs whitespace-nowrap min-w-[700px]">
                        <thead>
                          <tr
                            className="border-b font-bold uppercase text-[10.5px] tracking-wider"
                            style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-input)', color: 'var(--text-muted)' }}
                          >
                            <th className="px-5 py-3.5">Funcionalidade / Aba</th>
                            <th className="px-4 py-3.5 text-center">Gestor</th>
                            <th className="px-4 py-3.5 text-center">Coordenador</th>
                            <th className="px-4 py-3.5 text-center">Supervisor</th>
                            <th className="px-4 py-3.5 text-center">Analista</th>
                            <th className="px-4 py-3.5 text-center">Colaborador</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-input)]">
                          {tabPermissions.map((tab) => (
                            <tr key={tab.tabKey} className="transition-colors hover:bg-[var(--surface-hover)]">
                              <td className="px-5 py-3.5 font-semibold text-sm">{tab.tabName}</td>
                              {(['gestor', 'coordenador', 'supervisor', 'analista', 'colaborador'] as RoleType[]).map((role) => {
                                const hasAccess = tab.allowedRoles.includes(role);
                                return (
                                  <td key={role} className="px-3.5 py-3.5 text-center w-[120px]">
                                    <button
                                      type="button"
                                      disabled={!isAdmin || permissionActions.pending > 0}
                                      aria-label={tab.tabName + ': ' + role}
                                      onClick={() => toggleRolePermission(tab.tabKey, role)}
                                      className={`w-full py-1.5 px-2.5 rounded-full text-[11px] font-semibold border transition-all cursor-pointer ${
                                        hasAccess
                                          ? 'bg-emerald-500/12 text-[var(--success)] border-emerald-500/30'
                                          : 'opacity-75 hover:opacity-100'
                                      }`}
                                      style={!hasAccess ? solidInputStyle : undefined}
                                    >
                                      {hasAccess ? 'Liberado' : 'Bloqueado'}
                                    </button>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                          {tabPermissions.length === 0 && (
                            <tr>
                              <td colSpan={6} className="p-8 text-center font-medium text-xs" style={{ color: 'var(--text-muted)' }}>
                                As permissões estão protegidas por regras do servidor e não puderam ser carregadas.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 pt-6 border-t" style={{ borderColor: 'var(--border-input)' }}>
                  <div>
                    <div className="settings-card-head">
                      <span className="settings-accent-bar" aria-hidden="true" />
                      <h3 className="text-sm font-bold flex items-center gap-2 text-brand-panel">
                        <Shield className="w-4 h-4" />
                        Acessos Individuais (Exceções VIP)
                      </h3>
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      Selecione um colaborador para dar ou retirar acesso a funcionalidades independentemente do seu cargo base.
                    </p>
                  </div>

                  {usersWithExceptions.length > 0 && (
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="text-[11px] font-bold uppercase tracking-wider mr-1" style={{ color: 'var(--text-muted)' }}>
                        VIPs Ativos:
                      </span>
                      {usersWithExceptions.map((u) => (
                        <button
                          key={u.user_id}
                          type="button"
                          onClick={() => setSelectedExceptionUserId(u.user_id)}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                            selectedExceptionUserId === u.user_id
                              ? 'text-white border-transparent'
                              : 'bg-brand-panel/10 text-brand-panel border-brand-panel/25 hover:bg-brand-panel/15'
                          }`}
                          style={selectedExceptionUserId === u.user_id ? primaryActionStyle : undefined}
                        >
                          {u.nome.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="max-w-md relative">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                    <select
                      value={selectedExceptionUserId || ''}
                      onChange={(e) => setSelectedExceptionUserId(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border text-sm font-medium outline-none focus:border-brand-panel cursor-pointer"
                      style={solidCardStyle}
                    >
                      <option value="" disabled>
                        Selecione um colaborador da lista...
                      </option>
                      {companyUsers.map((u) => (
                        <option key={u.user_id} value={u.user_id}>
                          {u.nome} ({u.cargo})
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedExceptionUserId && (
                    <div className="p-6 rounded-2xl border w-full" style={solidCardStyle}>
                      <div className="flex items-center gap-3.5 mb-5 pb-5 border-b" style={{ borderColor: 'var(--border-input)' }}>
                        <div
                          className="w-11 h-11 rounded-xl text-white font-bold flex items-center justify-center text-sm"
                          style={primaryActionStyle}
                        >
                          {getInitials(companyUsers.find((u) => u.user_id === selectedExceptionUserId)?.nome || '')}
                        </div>
                        <div>
                          <p className="font-bold text-base">{companyUsers.find((u) => u.user_id === selectedExceptionUserId)?.nome}</p>
                          <p className="text-[11px] uppercase font-semibold tracking-wider mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {companyUsers.find((u) => u.user_id === selectedExceptionUserId)?.cargo}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                        {tabPermissions.map((tab) => {
                          const user = companyUsers.find((u) => u.user_id === selectedExceptionUserId);
                          const userRole = (user?.cargo || '').toLowerCase();
                          const hasRoleAccess = tab.allowedRoles.some((r) => r.toLowerCase() === userRole);
                          const isVip = tab.allowedUsers.includes(selectedExceptionUserId);

                          return (
                            <div
                              key={tab.tabKey}
                              className="p-4 rounded-xl border flex flex-col justify-between gap-3 transition-colors"
                              style={{
                                backgroundColor: isVip
                                  ? 'color-mix(in srgb, var(--tab-active) 6%, var(--bg-card))'
                                  : 'var(--bg-input)',
                                borderColor: isVip
                                  ? 'color-mix(in srgb, var(--tab-active) 40%, var(--border-input))'
                                  : 'var(--border-input)',
                              }}
                            >
                              <span className="font-semibold text-xs">{tab.tabName}</span>
                              <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: 'var(--border-input)' }}>
                                {hasRoleAccess ? (
                                  <span className="text-[11px] font-semibold text-[var(--success)] bg-emerald-500/12 px-2.5 py-1 rounded-full">
                                    Acesso Nativo do Cargo
                                  </span>
                                ) : (
                                  <label className="flex items-center gap-2.5 cursor-pointer w-full justify-between group">
                                    <span className={`text-xs font-semibold ${isVip ? 'text-brand-panel' : ''}`} style={!isVip ? { color: 'var(--text-muted)' } : undefined}>
                                      {isVip ? 'Exceção Concedida' : 'Sem Acesso'}
                                    </span>
                                    <input
                                      type="checkbox"
                                      disabled={!isAdmin || permissionActions.pending > 0}
                                      aria-label={'Exceção: ' + tab.tabName}
                                      checked={isVip}
                                      onChange={() => toggleUserException(selectedExceptionUserId, tab.tabKey)}
                                      className="w-4 h-4 rounded accent-brand-panel cursor-pointer"
                                    />
                                  </label>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* AUDITORIA E DADOS */}
            {activeTab === 'logs' && isAdmin && (
              <div className="space-y-5 w-full">
                <div className="settings-subtabs inline-flex p-1 rounded-xl border gap-1" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
                  <button
                    type="button"
                    onClick={() => setLogTab('sistema')}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      logTab === 'sistema' ? 'text-white' : 'hover:bg-[var(--surface-hover)]'
                    }`}
                    style={logTab === 'sistema' ? primaryActionStyle : { color: 'var(--text-muted)' }}
                  >
                    Auditoria de Ações
                  </button>
                  <button
                    type="button"
                    onClick={() => setLogTab('retencao')}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                      logTab === 'retencao' ? 'text-white' : 'hover:bg-[var(--surface-hover)]'
                    }`}
                    style={logTab === 'retencao' ? primaryActionStyle : { color: 'var(--text-muted)' }}
                  >
                    <Database className="w-3.5 h-3.5" />
                    <span>Retenção do Chat</span>
                  </button>
                </div>

                {logTab === 'sistema' ? (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div className="relative w-full sm:w-96">
                        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                        <input
                          type="text"
                          value={logSearch}
                          onChange={(e) => {
                            setLogSearch(e.target.value);
                            setLogPage(1);
                          }}
                          placeholder="Filtrar por autor, ação ou detalhes do registo..."
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors"
                          style={solidCardStyle}
                        />
                      </div>
                      <span className="text-xs font-semibold px-3 py-1.5 rounded-full border" style={{ ...solidCardStyle, color: 'var(--text-muted)' }}>
                        Total: {filteredLogs.length} Registos
                      </span>
                    </div>

                    <div className="rounded-2xl border overflow-hidden w-full" style={solidCardStyle}>
                      <div className="overflow-x-auto w-full custom-scrollbar">
                        <table className="w-full text-left border-collapse text-xs whitespace-nowrap min-w-[800px]">
                          <thead>
                            <tr
                              className="border-b font-bold uppercase text-[10.5px] tracking-wider"
                              style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-input)', color: 'var(--text-muted)' }}
                            >
                              <th className="px-5 py-3.5">Data / Hora</th>
                              <th className="px-5 py-3.5">Autor</th>
                              <th className="px-5 py-3.5">Ação Executada</th>
                              <th className="px-5 py-3.5 w-1/2">Detalhes da Auditoria</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border-input)]">
                            {currentLogs.map((log) => (
                              <tr key={log.id} className="hover:bg-[var(--surface-hover)] transition-colors">
                                <td className="px-5 py-3.5 font-medium" style={{ color: 'var(--text-muted)' }}>
                                  {formatPortalDateTime(log.created_at)}
                                </td>
                                <td className="px-5 py-3.5 font-semibold">{log.autor_nome}</td>
                                <td className="px-5 py-3.5">
                                  <span
                                    className="px-2.5 py-1 rounded-full text-[11px] font-semibold"
                                    style={{
                                      backgroundColor: 'color-mix(in srgb, var(--tab-active) 10%, var(--bg-card))',
                                      color: 'var(--tab-active)',
                                    }}
                                  >
                                    {log.acao}
                                  </span>
                                </td>
                                <td className="px-5 py-3.5 font-medium truncate max-w-xs xl:max-w-md" style={{ color: 'var(--text-muted)' }} title={log.detalhes}>
                                  {log.detalhes}
                                </td>
                              </tr>
                            ))}
                            {currentLogs.length === 0 && (
                              <tr>
                                <td colSpan={4} className="p-8 text-center font-medium text-xs" style={{ color: 'var(--text-muted)' }}>
                                  Nenhum registo de auditoria corresponde à sua pesquisa.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {totalLogPages > 1 && (
                        <div className="px-5 py-3.5 border-t flex flex-col sm:flex-row items-center justify-between gap-3" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-input)' }}>
                          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                            Página {logPage} de {totalLogPages}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              aria-label="Anterior"
                              onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                              disabled={logPage === 1}
                              className="p-1.5 rounded-lg border hover:bg-[var(--surface-hover)] disabled:opacity-35 cursor-pointer transition-colors"
                              style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-card)' }}
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>
                            <div className="flex items-center gap-1 px-1">{renderPaginationNumbers(logPage, totalLogPages, setLogPage)}</div>
                            <button
                              type="button"
                              aria-label="Próximo"
                              onClick={() => setLogPage((p) => Math.min(totalLogPages, p + 1))}
                              disabled={logPage === totalLogPages}
                              className="p-1.5 rounded-lg border hover:bg-[var(--surface-hover)] disabled:opacity-35 cursor-pointer transition-colors"
                              style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-card)' }}
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div
                      className="p-5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      style={{
                        ...solidCardStyle,
                        borderLeft: '3.5px solid #059669',
                      }}
                    >
                      <div>
                        <h3 className="font-bold text-sm md:text-base text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                          <Archive className="w-4 h-4" />
                          Backup das Mensagens Visíveis (ZIP)
                        </h3>
                        <p className="text-xs mt-1 max-w-xl leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                          Exporte as mensagens que sua sessão pode consultar, em ZIP. O limite desta exportação é de 20.000 registros; a ferramenta avisa se houver mais.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleDownloadZipBackup}
                        disabled={isDownloadingZip || Boolean(isDownloadingTranscript) || Boolean(isPurging) || isPurgingGlobal}
                        className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2 flex-shrink-0 disabled:opacity-70"
                      >
                        {isDownloadingZip ? <Loader2 className="w-4 h-4 animate-spin" /> : <DownloadCloud className="w-4 h-4" />}
                        <span>{isDownloadingZip ? 'A compactar...' : 'Baixar ZIP Global'}</span>
                      </button>
                    </div>

                    <div
                      className="p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4"
                      style={{
                        ...solidCardStyle,
                        borderLeft: '3.5px solid var(--tab-active)',
                      }}
                    >
                      <div>
                        <h3 className="font-bold text-sm md:text-base text-brand-panel flex items-center gap-2">
                          <Database className="w-4 h-4" />
                          Gestão de Espaço do Banco de Dados
                        </h3>
                        <p className="text-xs mt-1 max-w-xl leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                          Esta página oferece uma limpeza manual de mensagens anteriores a 7 dias. Ela não configura exclusão automática nem altera o Supabase compartilhado.
                        </p>
                        <div
                          className="mt-3 inline-flex items-center px-3 py-1.5 rounded-full border text-[11px]"
                          style={{
                            backgroundColor: 'color-mix(in srgb, var(--tab-active) 8%, var(--bg-card))',
                            borderColor: 'color-mix(in srgb, var(--tab-active) 24%, var(--border-input))',
                          }}
                        >
                          <span className="mr-1.5" style={{ color: 'var(--text-muted)' }}>
                            Última Limpeza Global:
                          </span>
                          <span className="font-semibold text-brand-panel">{dataUltimaLimpeza}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handlePurgeOldGlobal}
                        disabled={isPurgingGlobal || Boolean(isPurging) || Boolean(isDownloadingTranscript) || isDownloadingZip}
                        className="px-5 py-2.5 rounded-xl text-white text-xs font-semibold transition-all hover:brightness-105 cursor-pointer flex-shrink-0 flex items-center justify-center gap-2 disabled:opacity-70"
                        style={primaryActionStyle}
                      >
                        {isPurgingGlobal && <Loader2 className="w-4 h-4 animate-spin" />}
                        <span>{isPurgingGlobal ? 'A limpar...' : 'Forçar Limpeza Global'}</span>
                      </button>
                    </div>

                    <div className="space-y-3.5">
                      <div className="settings-card-head">
                        <span className="settings-accent-bar" aria-hidden="true" />
                        <h3 className="font-bold text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                          Extração Individual de Canais
                        </h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                        {adminChannels.map((canal) => {
                          const isSpinning = Boolean(isPurging) || Boolean(isDownloadingTranscript) || isPurgingGlobal || isDownloadingZip;
                          return (
                            <div
                              key={canal.id}
                              className="p-4 rounded-2xl border flex flex-col justify-between gap-4"
                              style={
                                canal.isGhost
                                  ? {
                                      backgroundColor: 'color-mix(in srgb, var(--error-text) 5%, var(--bg-card))',
                                      borderColor: 'color-mix(in srgb, var(--error-text) 28%, var(--border-input))',
                                    }
                                  : solidCardStyle
                              }
                            >
                              <div className="flex items-center gap-3">
                                <div
                                  className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center font-bold text-white text-xs ${
                                    canal.isGhost ? 'bg-red-500' : ''
                                  }`}
                                  style={!canal.isGhost ? primaryActionStyle : undefined}
                                >
                                  {getInitials(canal.name.replace('Fantasma: ', '').replace('Direta: ', ''))}
                                </div>
                                <div className="overflow-hidden">
                                  <p className={`font-semibold text-sm truncate ${canal.isGhost ? 'text-[var(--error-text)]' : ''}`}>{canal.name}</p>
                                  <p className="text-[10.5px] uppercase font-semibold tracking-wider mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                    {canal.isGhost ? 'Chat Inválido / Órfão' : canal.isGroup ? 'Canal / Grupo' : 'Conversa Direta'}
                                  </p>
                                </div>
                              </div>

                              <div className="flex gap-2 pt-3 border-t" style={{ borderColor: 'var(--border-input)' }}>
                                <button
                                  type="button"
                                  onClick={() => handleDownloadTranscript(canal.id, canal.name)}
                                  disabled={isSpinning}
                                  className="flex-1 py-2 rounded-xl text-brand-panel text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-70"
                                  style={{ backgroundColor: 'color-mix(in srgb, var(--tab-active) 10%, var(--bg-card))' }}
                                >
                                  {isDownloadingTranscript === canal.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <DownloadCloud className="w-3.5 h-3.5" />
                                  )}
                                  <span>{isDownloadingTranscript === canal.id ? 'Baixando...' : 'Baixar (.txt)'}</span>
                                </button>
                                {canal.isGroup ? (
                                  <button
                                    type="button"
                                    onClick={() => handlePurgeChannel(canal.id, canal.name)}
                                    disabled={isSpinning}
                                    className="px-3 py-2 rounded-xl bg-amber-500/12 text-[var(--warning)] hover:bg-amber-500/20 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-70"
                                    title="Limpar Histórico deste Grupo (Mantém o canal)"
                                  >
                                    {isPurging === canal.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteChannel(canal.id, canal.name)}
                                    disabled={isSpinning}
                                    className="px-3 py-2 rounded-xl bg-red-500/10 text-[var(--error-text)] hover:bg-red-500/20 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-70"
                                    title="Excluir Canal Permanentemente"
                                  >
                                    {isPurging === canal.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PRIVACIDADE E NOTIFICAÇÕES */}
            {activeTab === 'notificacoes' && (
              <div className="space-y-5 max-w-3xl">
                <NotificationPreferences userId={currentUser.user_id} />
                <div className="p-6 rounded-2xl border space-y-5" style={solidCardStyle}>
                  <div>
                    <div className="settings-card-head mb-3.5">
                      <span className="settings-accent-bar" aria-hidden="true" />
                      <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                        Notificações do Sistema Doo Doo
                      </h3>
                    </div>
                    <label
                      className="flex items-center justify-between gap-4 p-4 rounded-xl border cursor-pointer hover:border-[var(--tab-active)] transition-colors"
                      style={solidInputStyle}
                    >
                      <div>
                        <span className="font-semibold text-sm block">Notificações por E-mail</span>
                        <span className="text-xs mt-0.5 block leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                          Preferência para convites e tarefas; o envio depende da configuração do serviço de e-mail.
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={currentUser.email_notifications ?? false}
                        onChange={() => handleTogglePrivacySetting('email_notifications')}
                        disabled={isUpdatingPrivacy}
                        className="w-[18px] h-[18px] rounded accent-brand-panel cursor-pointer disabled:opacity-70 flex-shrink-0"
                      />
                    </label>
                  </div>

                  <div className="h-px w-full" style={{ backgroundColor: 'var(--border-input)' }} />

                  <div>
                    <div className="settings-card-head mb-3.5">
                      <span className="settings-accent-bar" aria-hidden="true" />
                      <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                        Privacidade no Chat Corporativo
                      </h3>
                    </div>
                    <label
                      className="flex items-center justify-between gap-4 p-4 rounded-xl border cursor-pointer hover:border-[var(--tab-active)] transition-colors"
                      style={solidInputStyle}
                    >
                      <div>
                        <span className="font-semibold text-sm block">Confirmação de Leitura (Visto Azul)</span>
                        <span className="text-xs mt-0.5 block leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                          Permitir que os seus colegas vejam que você leu as mensagens.
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={currentUser.read_receipts ?? true}
                        onChange={() => handleTogglePrivacySetting('read_receipts')}
                        disabled={isUpdatingPrivacy}
                        className="w-[18px] h-[18px] rounded accent-brand-panel cursor-pointer disabled:opacity-70 flex-shrink-0"
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAIS V2 */}
      {isUserModalOpen && (
        <ModalShell
          open
          description={<span className="text-xs font-semibold uppercase tracking-widest text-brand-panel">Registo</span>}
          title="Novo Colaborador"
          onClose={() => setIsUserModalOpen(false)}
          busy={isSaving || dialogAction.pending}
          footer={
            <div className="flex justify-end gap-3 pt-4 border-t" style={{ borderColor: 'var(--border-input)' }}>
              <button
                form="modal-form-1"
                type="button"
                onClick={() => setIsUserModalOpen(false)}
                className="px-5 py-2.5 rounded-xl border text-sm font-semibold cursor-pointer hover:bg-[var(--surface-hover)] transition-colors"
                style={{ borderColor: 'var(--border-input)' }}
              >
                Cancelar
              </button>
              <button
                form="modal-form-1"
                type="submit"
                disabled={isSaving}
                className="px-6 py-2.5 rounded-xl text-white text-sm font-semibold cursor-pointer hover:brightness-105 transition-all disabled:opacity-70 flex items-center gap-2"
                style={primaryActionStyle}
              >
                {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Adicionar</span>
              </button>
            </div>
          }
        >
          {pendingRegistration && (
            <Notice>Autenticação confirmada. Conclua o perfil usando o mesmo e-mail. Sua sessão administrativa foi preservada.</Notice>
          )}
          <form
            id="modal-form-1"
            onSubmit={(event) => {
              event.preventDefault();
              void dialogAction.run(() => handleCreateUser(event));
            }}
            className="p-6 space-y-4 text-xs"
          >
            <div>
              <label htmlFor="field-8" className="text-xs font-semibold block mb-1.5">
                Nome Completo
              </label>
              <input
                id="field-8"
                type="text"
                required
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder="Ex: Ana Paula..."
                className="w-full px-3.5 py-3 rounded-xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors"
                style={solidInputStyle}
              />
            </div>
            <div>
              <label htmlFor="field-9" className="text-xs font-semibold block mb-1.5">
                E-mail Corporativo
              </label>
              <input
                id="field-9"
                type="email"
                required
                disabled={Boolean(pendingRegistration)}
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder="ana.paula@empresa.com"
                className="w-full px-3.5 py-3 rounded-xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors"
                style={solidInputStyle}
              />
            </div>
            <div>
              <label htmlFor="field-10" className="text-xs font-semibold block mb-1.5">
                Senha Inicial
              </label>
              <input
                id="field-10"
                type="password"
                required
                disabled={Boolean(pendingRegistration)}
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-3 rounded-xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors"
                style={solidInputStyle}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="field-11" className="text-xs font-semibold block mb-1.5">
                  Cargo
                </label>
                <select
                  id="field-11"
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as RoleType)}
                  className="w-full px-3 py-3 rounded-xl border text-xs font-medium outline-none cursor-pointer"
                  style={solidInputStyle}
                >
                  <option value="administrador">Administrador</option>
                  <option value="gestor">Gestor</option>
                  <option value="coordenador">Coordenador</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="analista">Analista</option>
                  <option value="colaborador">Colaborador</option>
                </select>
              </div>
              <div>
                <label htmlFor="field-12" className="text-xs font-semibold block mb-1.5">
                  Setor
                </label>
                <select
                  id="field-12"
                  value={newUserSector}
                  onChange={(e) => setNewUserSector(e.target.value)}
                  className="w-full px-3 py-3 rounded-xl border text-xs font-medium outline-none cursor-pointer"
                  style={solidInputStyle}
                >
                  {SECTORS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </form>
        </ModalShell>
      )}

      {confirmModal.isOpen && (
        <ModalShell
          open
          title={confirmModal.title}
          onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
          destructive
          busy={dialogAction.pending}
          footer={
            <div className="flex flex-col sm:flex-row justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--border-input)' }}>
              <button
                type="button"
                onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl border text-sm font-semibold cursor-pointer hover:bg-[var(--surface-hover)] transition-colors"
                style={{ borderColor: 'var(--border-input)' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => dialogAction.run(confirmModal.onConfirm)}
                className={`w-full sm:w-auto px-6 py-2.5 rounded-xl text-white text-sm font-semibold cursor-pointer transition-all ${
                  confirmModal.isDestructive ? 'bg-red-600 hover:bg-red-700' : 'hover:brightness-105'
                }`}
                style={!confirmModal.isDestructive ? primaryActionStyle : undefined}
              >
                Confirmar
              </button>
            </div>
          }
        >
          <div className="p-6">
            <p className="text-sm font-medium leading-relaxed text-center" style={{ color: 'var(--text-muted)' }}>
              {confirmModal.message}
            </p>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
