'use client';

import { useHydrated } from '@/app/lib/useHydrated';
import ModalShell from '../ModalShell';
import { useDialogAction } from '../useDialogAction';
import {useRecordActions} from '../useRecordActions';

import { inputStyle,Notice,panelStyle,sidebarStyle } from '@/app/components/ui';
import { messageOf,notify,requireResult } from '@/app/lib/domain';
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

  const glassContainerStyle = panelStyle;
  const glassSidebarStyle = sidebarStyle;
  const solidCardStyle = panelStyle;
  const solidInputStyle = inputStyle;

  const notifyBell = useCallback((title: string, desc: string) => {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('doodoo:notify', { detail: { title, desc } }));
  }, []);

  const registerLog = async (acao: string, detalhes: string) => {
    if (!currentUser) return;
    const newLog = { autor_nome: currentUser.nome, acao, detalhes };
    try {
      requireResult(await supabase.from('doodoo_logs').insert([newLog]).select('*').single());
      setSystemLogs(prev => [{ ...newLog, id: Date.now().toString(), created_at: new Date().toISOString() }, ...prev]);
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
    const { error } = await supabase.from('doodoo_perfis').update({ avatar_url: currentUser.avatar_url }).eq('user_id', currentUser.user_id).select('*').single();
    if (!error) {
      notifyBell('⚙️ Perfil Atualizado', 'As suas informações foram salvas com sucesso.');
      registerLog('Perfil Atualizado', 'Atualizou as informações pessoais de perfil e avatar.');

      setCompanyUsers(prev => prev.map(u => u.user_id === currentUser.user_id ? currentUser : u));
    } else {
      notifyBell('Erro', 'Não foi possível salvar o perfil.');
    }
    setIsSaving(false);
  };

  const handleUpdateUserRoleAndSector = async (userId: string, field: 'cargo' | 'setor', value: string) => {
    if (!isManager || updatingUserId || (!isAdmin && field === 'cargo' && value === 'administrador')) return;
    if(userId===currentUser?.id)return notifyBell('Ação indisponível','Seu cargo e setor devem ser alterados por outro administrador.');
    const previousUser = companyUsers.find(u => u.id === userId);
    if(!isAdmin&&previousUser?.cargo==='administrador')return;
    if (!previousUser || previousUser[field] === value) return;

    setUpdatingUserId(userId);
    setCompanyUsers(prev => prev.map(u => u.id === userId ? { ...u, [field]: value } : u));

    const { error } = await supabase.from('doodoo_perfis').update({ [field]: value }).eq('id', userId).select('*').single();

    if (error) {
      setCompanyUsers(prev => prev.map(u => u.id === userId ? previousUser : u));
      notifyBell('Erro', `Falha ao atualizar ${field}.`);
    } else {
      notifyBell('Acesso Atualizado', `${field === 'cargo' ? 'Cargo' : 'Setor'} atualizado com sucesso.`);
      registerLog('Alteração de Cadastro', `Alterou o ${field} de ${previousUser.nome} para ${value.toUpperCase()}.`);
    }
    setUpdatingUserId(null);
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

        const { error } = await supabase.from('doodoo_perfis').update({ status: newStatus }).eq('id', userId).select('*').single();

        if (error && previousUser) {
          setCompanyUsers(prev => prev.map(u => u.id === userId ? previousUser : u));
          notifyBell('Erro', 'Não foi possível alterar o status do utilizador.');
        } else {
          notifyBell('Status Atualizado', `Acesso alterado para ${newStatus}.`);
          registerLog('Bloqueio/Desbloqueio', `${newStatus === 'bloqueado' ? 'Bloqueou' : 'Desbloqueou'} o acesso de ${nome}.`);
        }
        setUpdatingUserId(null);
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

        const { error } = await supabase.from('doodoo_perfis').delete().eq('id', id).select('*').single();

        if (!error) {
           setCompanyUsers(prev => prev.filter(u => u.id !== id));
           if (currentUsers.length === 1 && currentPage > 1) setCurrentPage(currentPage - 1);
           notifyBell('Colaborador Removido', `${nome} foi excluído.`);
           registerLog('Remoção de Perfil', `Removeu o perfil Doo Doo de ${nome}; Auth compartilhado preservado.`);
        } else {
           notifyBell('Erro de Exclusão', 'Não é possível excluir. O colaborador tem dependências ativas (Foreign Keys). Recomendamos bloquear o acesso.');
        }
        setUpdatingUserId(null);
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

      if (data && !error) {
        setTaskCategories(prev => [...prev, data]);
        setNewCategoryName('');
        notifyBell('Categoria Criada', `A categoria ${data.nome} foi adicionada com sucesso.`);
      } else {
        notifyBell('Erro na Criação', 'Tabela doodoo_tarefas_categorias não encontrada ou com RLS bloqueando.');
      }
    } catch {
      notifyBell('Falha de Comunicação', 'O servidor rejeitou o pedido (Erro 400/404).');
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleDeleteCategory = (id: string, nome: string) => {
    setConfirmModal({
      isOpen: true, title: 'Excluir Categoria', message: `Tem a certeza que deseja excluir a categoria "${nome}"?`, isDestructive: true,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        const { error } = await supabase.from('doodoo_tarefas_categorias').delete().eq('id', id).select('*').single();
        if (!error) {
          setTaskCategories(prev => prev.filter(c => c.id !== id));
          notifyBell('Categoria Removida', 'A categoria foi excluída com sucesso.');
        } else {
          notifyBell('Erro', 'Ocorreu uma falha ao tentar excluir a categoria.');
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

    const { error } = await supabase.from('doodoo_perfis').update({ [field]: newValue }).eq('user_id', currentUser.user_id).select('*').single();

    if (!error) {
       notifyBell('Privacidade Salva', `Preferência atualizada.`);
    } else {
       setCurrentUser({ ...currentUser, [field]: currentValue });
       notifyBell('Preferência não salva', 'Não foi possível salvar. A configuração anterior foi restaurada.');
    }
    setIsUpdatingPrivacy(false);
  };

  // 🚀 LÓGICA DE TRANSCRIPT CORRIGIDA (Mostra as mensagens apagadas no TXT)
  const handleDownloadTranscript = async (canalId: string, canalNome: string) => {
    setIsDownloadingTranscript(canalId);
    notifyBell('A Preparar', 'A baixar histórico...');
    const { data, error } = await supabase.from('doodoo_mensagens').select('*').eq('canal_id', canalId).order('created_at', { ascending: true });
    if(error){setIsDownloadingTranscript(null);notifyBell('Exportação indisponível','Não foi possível consultar as mensagens.');return;}

    if (!data || data.length === 0) {
      setIsDownloadingTranscript(null);
      return notifyBell('Sem dados', 'Nenhuma mensagem encontrada.');
    }

    let txt = `========================================================\n AUDITORIA DE CHAT\n========================================================\n\n`;
    data.forEach(m => {
       const dataStr = new Date(m.created_at).toLocaleDateString('pt-BR');
       const horaStr = new Date(m.created_at).toLocaleTimeString('pt-BR');
       // 🚀 Mostra a mensagem verdadeira se apagada, precedida de [APAGADA]
       txt += `[${dataStr} ${horaStr}] ${m.sender_nome}: ${m.metadata?.deleted ? `[APAGADA] ${m.texto}` : m.texto}\n`;
    });

    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `Auditoria_${canalNome.replace(/[\/\\:?*"<>|]/g, '')}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setIsDownloadingTranscript(null);
  };

  // 🚀 LÓGICA DE BACKUP CORRIGIDA (Mostra as mensagens apagadas no ZIP)
  const handleDownloadZipBackup = async () => {
    setIsDownloadingZip(true);
    notifyBell('A Gerar Backup', 'Aguarde um momento...');
    try {
      const { data: allMsgs, error: exportError } = await supabase.from('doodoo_mensagens').select('*').order('created_at', { ascending: true });
      if(exportError)throw exportError;
      if (!allMsgs || allMsgs.length === 0) {
        setIsDownloadingZip(false);
        return notifyBell('Aviso', 'Base de dados vazia.');
      }

      const zip = new JSZip();
      const grouped = allMsgs.reduce<Record<string, MessageRow[]>>((acc, m) => {
        if (!acc[m.canal_id]) acc[m.canal_id] = [];
        acc[m.canal_id].push(m);
        return acc;
      }, {});

      Object.keys(grouped).forEach(canalId => {
         const canal = adminChannels.find(c => c.id === canalId) || { name: `Chat_${canalId.substring(0,6)}` };
         let txt = `AUDITORIA - ${canal.name}\n\n`;
         grouped[canalId].forEach((m) => {
           // 🚀 Mostra a mensagem verdadeira se apagada, precedida de [APAGADA]
           txt += `[${new Date(m.created_at).toLocaleString('pt-BR')}] ${m.sender_nome}: ${m.metadata?.deleted ? `[APAGADA] ${m.texto}` : m.texto}\n`;
         });
         zip.file(`Auditoria_${canal.name.replace(/[\/\\:?*"<>|]/g, '')}.txt`, txt);
      });

      const blob = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.setAttribute("download", `Backup_Total.zip`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setIsDownloadingZip(false);
    } catch {
      setIsDownloadingZip(false);
      notifyBell('Erro', 'Ocorreu um problema ao gerar o ZIP.');
    }
  };

  // 🚀 NOVA LÓGICA DE EXCLUSÃO DE CANAL (Apenas para fantasmas e diretos - Destrói o canal)
  const handleDeleteChannel = (canalId: string, canalNome: string) => {
    setConfirmModal({
      isOpen: true, title: 'Excluir Canal', message: `Atenção: Deseja EXCLUIR permanentemente o canal "${canalNome}" e todo o seu histórico de mensagens? Esta ação é irreversível.`, isDestructive: true,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setIsPurging(canalId);

        if(atomicWrites){
          try { requireResult(await supabase.from('doodoo_canais').delete().eq('id',canalId).select('*').single());setAdminChannels(prev=>prev.filter(c=>c.id!==canalId));notifyBell('Canal excluído','Canal e histórico removidos na mesma operação.'); } finally {setIsPurging(null);}return;
        }
        const messages = await supabase.from('doodoo_mensagens').delete().eq('canal_id',canalId);
        if(messages.error){setIsPurging(null);throw new Error('Não foi possível excluir as mensagens. O canal foi preservado.');}
        const notes = await supabase.from('doodoo_chat_notas').delete().eq('canal_id',canalId);
        if(notes.error){setIsPurging(null);throw new Error('A exclusão foi interrompida. As mensagens podem ter sido removidas; revise o canal antes de tentar novamente.');}

        const { error } = await supabase.from('doodoo_canais').delete().eq('id', canalId);

        if (!error) {
          notifyBell('Canal Excluído', `O canal foi completamente removido da base de dados.`);
          setAdminChannels(prev => prev.filter(c => c.id !== canalId));
        } else {
          notifyBell('Erro', 'Ocorreu um erro ao excluir o canal. (Verifique restrições RLS)');
        }

        setIsPurging(null);
      }
    });
  };

  // 🚀 LÓGICA DE LIMPEZA DE GRUPOS (Apaga as mensagens, mantém o canal aberto)
  const handlePurgeChannel = (canalId: string, canalNome: string) => {
    setConfirmModal({
      isOpen: true, title: 'Limpar Mensagens', message: `Deseja apagar permanentemente TODAS as mensagens do grupo "${canalNome}" (O canal permanecerá ativo)?`, isDestructive: true,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setIsPurging(canalId);

        const { error } = await supabase.from('doodoo_mensagens').delete().eq('canal_id', canalId);

        if (!error) notifyBell('Concluído', `Histórico apagado com sucesso.`);
        else notifyBell('Erro', 'Ocorreu um erro ao limpar o histórico.');

        setIsPurging(null);
      }
    });
  };

  const handlePurgeOldGlobal = () => {
    setConfirmModal({
      isOpen: true, title: 'Limpeza Global do Banco de Dados', message: `Atenção: Deseja apagar de forma definitiva todas as mensagens do sistema com mais de 7 dias?`, isDestructive: true,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setIsPurgingGlobal(true);


        const seteDias = new Date();
        seteDias.setDate(seteDias.getDate() - 7);

        try {
          const {error}=await supabase.from('doodoo_mensagens').delete().lt('created_at',seteDias.toISOString());
          if(error)throw error;
          notifyBell('Limpeza concluída','As mensagens anteriores ao período foram removidas.');
        } finally { setIsPurgingGlobal(false); }

      }
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
          key={i} onClick={() => setPage(i)}
          className={`w-7 h-7 rounded-lg text-xs font-semibold flex items-center justify-center transition-colors shadow-sm cursor-pointer ${current === i ? 'bg-brand-panel text-white border-transparent' : 'border hover:bg-black/5 dark:hover:bg-white/5'}`}
          style={current !== i ? { borderColor: 'var(--border-input)' } : {}}
        >
          {i}
        </button>
      );
    }
    return pages;
  };

  const dataUltimaLimpeza = useMemo(() => {
    const ultimoRegisto = systemLogs.find(log => log.acao === 'Limpeza de Base de Dados');
    return ultimoRegisto ? new Date(ultimoRegisto.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Nunca realizada';
  }, [systemLogs]);

  if (isLoading || !isMounted) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center">
        <div className="w-16 h-16 rounded-xl flex items-center justify-center animate-pulse" style={{ backgroundColor: 'var(--bg-card)' }}>
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--tab-active)' }} />
        </div>
      </div>
    );
  }

  if (authError || !currentUser) return <Notice>Não foi possível carregar as configurações. Atualize a página para tentar novamente.</Notice>;

  return (
    <div className="w-full h-full flex-1 flex flex-col animate-in fade-in duration-500 pb-0 relative z-0">

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
      <div className="w-full min-h-0 min-w-0 flex-1 flex flex-col lg:flex-row rounded-xl border overflow-hidden" style={glassContainerStyle}>
        <div className="hidden lg:flex flex-col w-[248px] xl:w-[272px] shrink-0" style={glassSidebarStyle}>
          <div className="p-6 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
            <div className="pb-4 border-b" style={{borderColor:'var(--border-input)'}}><h3 className="font-semibold text-base">Painel de Ajustes</h3><p className="mt-1 text-xs text-[var(--text-muted)]">Doo Doo Workspace</p></div>
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-2xl bg-brand-panel flex items-center justify-center text-white shadow-sm flex-shrink-0">
                <Settings className="w-6 h-6" />
              </div>
              <div className="overflow-hidden">
                <h3 className="font-semibold text-[15px] tracking-tight truncate">{currentUser.nome}</h3>
                <p className="text-xs font-medium uppercase tracking-widest opacity-75 truncate mt-0.5">{currentUser.cargo} • {currentUser.setor}</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest opacity-70 px-2 mb-2">Pessoal</p>
              <button onClick={() => setActiveTab('geral')} className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl text-xs font-medium transition-all cursor-pointer ${activeTab === 'geral' ? 'bg-brand-panel text-white shadow-sm' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-75'}`}>
                <Settings className="w-4 h-4" /><span>Meu Perfil</span>
              </button>
              <button onClick={() => setActiveTab('notificacoes')} className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl text-xs font-medium transition-all cursor-pointer ${activeTab === 'notificacoes' ? 'bg-brand-panel text-white shadow-sm' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-75'}`}>
                <Bell className="w-4 h-4" /><span>Privacidade</span>
              </button>

              {isManager && (
                <>
                  <div className="pt-4 pb-1"><p className="text-xs font-semibold uppercase tracking-widest opacity-70 px-2">Gestão</p></div>
                  <button onClick={() => setActiveTab('usuarios')} className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl text-xs font-medium transition-all cursor-pointer ${activeTab === 'usuarios' ? 'bg-brand-panel text-white shadow-sm' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-75'}`}>
                    <Users className="w-4 h-4" /><span>Equipe & Colaboradores</span>
                  </button>
                  <button onClick={() => setActiveTab('permissoes')} className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl text-xs font-medium transition-all cursor-pointer ${activeTab === 'permissoes' ? 'bg-brand-panel text-white shadow-sm' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-75'}`}>
                    <Shield className="w-4 h-4" /><span>Permissões de Abas</span>
                  </button>
                  <button onClick={() => setActiveTab('categorias')} className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl text-xs font-medium transition-all cursor-pointer ${activeTab === 'categorias' ? 'bg-brand-panel text-white shadow-sm' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-75'}`}>
                    <Tags className="w-4 h-4" /><span>Categorias de Tarefas</span>
                  </button>
                </>
              )}

              {isAdmin && (
                <>
                  <div className="pt-4 pb-1"><p className="text-xs font-semibold uppercase tracking-widest opacity-70 px-2">Sistema</p></div>
                  <button onClick={() => setActiveTab('logs')} className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl text-xs font-medium transition-all cursor-pointer ${activeTab === 'logs' ? 'bg-brand-panel text-white shadow-sm' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-75'}`}>
                    <Activity className="w-4 h-4" /><span>Auditoria & Dados</span>
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="p-6 border-t flex flex-col items-center justify-center flex-shrink-0" style={{ borderColor: 'var(--border-input)' }}>
            <span className="text-xs font-medium opacity-70 uppercase tracking-widest mb-3">Tema da Interface</span>

            <div className="grid grid-cols-5 gap-2.5">
              {themes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => changeTheme(t.id)}
                  style={{
                    width: '24px', height: '24px',
                    backgroundColor: t.color,
                    border: `1px solid ${t.border}`,
                    boxShadow: theme === t.id ? `0 0 0 2px var(--bg-card), 0 0 0 4px ${t.border}` : '0 2px 4px rgba(0,0,0,0.15)'
                  }}
                  className={`rounded-full transition-all duration-300 cursor-pointer ${theme === t.id ? 'scale-110' : 'opacity-80 hover:opacity-100 hover:scale-110'}`}
                  title={t.name}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ÁREA DE CONTEÚDO PRINCIPAL (100% de largura) */}
        <div className="flex-1 flex flex-col h-full overflow-hidden" style={{ backgroundColor: 'var(--bg-card)' }}>

          <div className="p-5 md:p-8 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4 md:gap-0 flex-shrink-0" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-card)' }}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-brand-panel mb-1">Painel de Controlo</p>
              <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
                {activeTab === 'geral' && 'Meu Perfil'}
                {activeTab === 'usuarios' && 'Controle de Colaboradores'}
                {activeTab === 'permissoes' && 'Permissões e Exceções VIP'}
                {activeTab === 'categorias' && 'Categorias das Tarefas'}
                {activeTab === 'notificacoes' && 'Privacidade do Sistema'}
                {activeTab === 'logs' && 'Auditoria de Sistema & Dados'}
              </h2>
            </div>
            <div className="flex items-center space-x-3">
              {activeTab === 'geral' && (
                <button onClick={handleSaveProfile} disabled={isSaving} className="px-6 py-3.5 rounded-2xl bg-brand-panel text-white text-sm font-semibold shadow-sm hover:opacity-90 active:scale-95 transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-70">
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <Save className="w-4 h-4" /><span>Salvar Alterações</span>
                </button>
              )}
            </div>
          </div>

          <div className="lg:hidden flex overflow-x-auto p-4 border-b space-x-3 flex-shrink-0 custom-scrollbar" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-input)' }}>
            {[
              { id: 'geral', label: 'Meu Perfil' },
              { id: 'notificacoes', label: 'Privacidade' },
              ...(isManager ? [
                { id: 'usuarios', label: 'Colaboradores' },
                { id: 'permissoes', label: 'Permissões' },
                { id: 'categorias', label: 'Categorias' }
              ] : []),
              ...(isAdmin ? [{ id: 'logs', label: 'Auditoria' }] : [])
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`px-5 py-2.5 rounded-full text-sm font-semibold whitespace-nowrap transition-transform active:scale-95 shadow-sm ${activeTab === tab.id ? 'bg-brand-panel text-white' : 'border border-[var(--border-input)] opacity-70 hover:opacity-100'}`}
                style={activeTab !== tab.id ? { backgroundColor: 'var(--bg-card)' } : {}}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-5 md:p-8 space-y-6 custom-scrollbar">

            {activeTab === 'geral' && (
              <form onSubmit={handleSaveProfile} className="space-y-6 max-w-3xl">
                <div className="p-6 md:p-8 rounded-3xl border space-y-6 shadow-sm" style={solidInputStyle}>
                  <h3 className="text-sm font-semibold uppercase tracking-wider opacity-75">Foto de Perfil (Avatar)</h3>
                  <div className="flex flex-col sm:flex-row items-center sm:items-start space-y-4 sm:space-y-0 sm:space-x-6">
                    <div className="relative flex-shrink-0 w-20 h-20">
                      {currentUser.avatar_url ? (
                        <>
                          <img
                            src={currentUser.avatar_url}
                            alt="Avatar"
                            className="w-20 h-20 rounded-2xl object-cover border-2 shadow-sm relative z-10"
                            style={{ borderColor: 'var(--border-input)' }}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                          <div className="w-20 h-20 rounded-2xl bg-brand-panel text-white font-semibold flex items-center justify-center text-xl shadow-sm absolute inset-0 z-0 hidden">
                            {getInitials(currentUser.nome)}
                          </div>
                        </>
                      ) : (
                        <div className="w-20 h-20 rounded-2xl bg-brand-panel text-white font-semibold flex items-center justify-center text-xl shadow-sm">
                          {getInitials(currentUser.nome)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 w-full">
                      <label htmlFor="field-1" className="text-xs font-semibold uppercase tracking-widest opacity-75 block mb-2">URL da Imagem</label>
                      <input id="field-1"
                        type="url"
                        value={currentUser.avatar_url || ''}
                        onChange={(e) => setCurrentUser(prev => prev ? { ...prev, avatar_url: e.target.value } : null)}
                        placeholder="https://exemplo.com/foto.jpg"
                        className="w-full px-4 py-3.5 rounded-2xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors shadow-sm"
                        style={solidCardStyle}
                      />
                    </div>
                  </div>
                </div>

                <div className="p-6 md:p-8 rounded-3xl border space-y-6 shadow-sm" style={solidInputStyle}>
                  <div className="flex items-center justify-between">
                     <h3 className="text-sm font-semibold uppercase tracking-wider opacity-75">Dados Profissionais Básicos</h3>
                     <span className="text-xs font-semibold bg-brand-panel/10 text-brand-panel px-2 py-1 rounded-md border border-brand-panel/20 uppercase tracking-widest">Leitura Apenas</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-xs">
                    <div>
                      <label htmlFor="field-2" className="text-xs font-semibold uppercase tracking-widest opacity-75 block mb-2">Nome Completo</label>
                      <input id="field-2"
                        type="text"
                        value={currentUser.nome} readOnly
                        className="w-full px-4 py-3.5 rounded-2xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors shadow-sm"
                        style={solidCardStyle}
                      />
                    </div>
                    <div>
                      <label htmlFor="field-3" className="text-xs font-semibold uppercase tracking-widest opacity-75 block mb-2">E-mail Corporativo</label>
                      <input id="field-3"
                        type="email"
                        value={currentUser.email}
                        disabled
                        className="w-full px-4 py-3.5 rounded-2xl border text-sm font-medium outline-none opacity-70 cursor-not-allowed shadow-inner"
                        style={solidCardStyle}
                      />
                    </div>
                    <div>
                      <label htmlFor="field-4" className="text-xs font-semibold uppercase tracking-widest opacity-75 block mb-2">Cargo e Acesso</label>
                      <input id="field-4"
                        type="text"
                        value={currentUser.cargo.toUpperCase()}
                        disabled
                        className="w-full px-4 py-3.5 rounded-2xl border text-sm font-medium outline-none opacity-70 cursor-not-allowed shadow-inner"
                        style={solidCardStyle}
                      />
                    </div>
                    <div>
                      <label htmlFor="field-5" className="text-xs font-semibold uppercase tracking-widest opacity-75 block mb-2">Setor Atribuído</label>
                      <input id="field-5"
                        type="text"
                        value={currentUser.setor}
                        disabled
                        title="Para alterar o seu setor, um gestor deve fazê-lo na aba Colaboradores."
                        className="w-full px-4 py-3.5 rounded-2xl border text-sm font-medium outline-none opacity-70 cursor-not-allowed shadow-inner"
                        style={solidCardStyle}
                      />
                    </div>
                  </div>
                </div>
              </form>
            )}

            {/* GESTÃO DE EQUIPE */}
            {activeTab === 'usuarios' && isManager && (
              <div className="space-y-6 w-full">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="relative w-full sm:w-80">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-70" />
                    <input
                      type="text"
                      value={userSearch}
                      onChange={e => { setUserSearch(e.target.value); setCurrentPage(1); }}
                      placeholder="Pesquisar colaborador..."
                      className="w-full pl-10 pr-4 py-3 rounded-2xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors shadow-sm"
                      style={solidInputStyle}
                    />
                  </div>
                  <button onClick={() => setIsUserModalOpen(true)} className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-brand-panel text-white text-sm font-semibold shadow-sm flex items-center justify-center cursor-pointer hover:opacity-95 active:scale-95 transition-transform">
                    <UserPlus className="w-4 h-4 mr-2" />Novo Colaborador
                  </button>
                </div>

                <div className="rounded-3xl border overflow-hidden shadow-sm w-full" style={solidInputStyle}>
                  <div className="overflow-x-auto w-full custom-scrollbar">
                    <table className="w-full text-left text-xs whitespace-nowrap min-w-[600px]">
                      <thead>
                        <tr className="border-b opacity-75 font-semibold uppercase text-xs tracking-wider" style={{ borderColor: 'var(--border-input)' }}>
                          <th className="p-4 md:p-5">Colaborador</th>
                          <th className="p-4 md:p-5">Cargo</th>
                          <th className="p-4 md:p-5">Setor</th>
                          <th className="p-4 md:p-5 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y" style={{ borderColor: 'var(--border-input)' }}>
                        {currentUsers.map(user => {
                          const isUpdatingThis = updatingUserId === user.id;
                          return (
                            <tr key={user.id} className={`transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${user.status === 'bloqueado' ? 'opacity-70' : ''}`}>
                              <td className="p-4 md:p-5 font-medium flex items-center space-x-3.5">
                                {isUpdatingThis ? (
                                   <div className="w-9 h-9 rounded-xl flex items-center justify-center border shadow-sm bg-brand-panel/10 border-brand-panel/30">
                                      <Loader2 className="w-5 h-5 text-brand-panel animate-spin" />
                                   </div>
                                ) : user.avatar_url ? (
                                  <div className="relative w-9 h-9">
                                    <img
                                      src={user.avatar_url}
                                      alt=""
                                      className="w-9 h-9 rounded-xl object-cover border shadow-sm relative z-10"
                                      style={{ borderColor: 'var(--border-input)' }}
                                      onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }}
                                    />
                                    <div className="w-9 h-9 rounded-xl bg-brand-panel text-white font-semibold flex items-center justify-center text-xs shadow-sm absolute inset-0 z-0 hidden">
                                      {getInitials(user.nome)}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="w-9 h-9 rounded-xl bg-brand-panel text-white font-semibold flex items-center justify-center text-xs shadow-sm">
                                    {getInitials(user.nome)}
                                  </div>
                                )}
                                <span className="text-sm">{user.nome}</span>
                              </td>
                              <td className="p-4 md:p-5 w-[150px]">
                                <select
                                  aria-label={'Cargo de '+user.nome} value={user.cargo}
                                  disabled={user.status === 'bloqueado' || isUpdatingThis || user.id===currentUser.id || (!isAdmin&&user.cargo==='administrador')}
                                  onChange={(e) => handleUpdateUserRoleAndSector(user.id, 'cargo', e.target.value)}
                                  className="w-full p-2 rounded-xl border font-medium text-xs uppercase outline-none cursor-pointer shadow-sm disabled:opacity-70"
                                  style={solidCardStyle}
                                >
                                  <option value="administrador">Admin</option>
                                  <option value="gestor">Gestor</option>
                                  <option value="coordenador">Coordenador</option>
                                  <option value="supervisor">Supervisor</option>
                                  <option value="analista">Analista</option>
                                  <option value="colaborador">Colaborador</option>
                                </select>
                              </td>
                              <td className="p-4 md:p-5 w-[150px]">
                                <select
                                  aria-label={'Setor de '+user.nome} value={user.setor}
                                  disabled={user.status === 'bloqueado' || isUpdatingThis || user.id===currentUser.id || (!isAdmin&&user.cargo==='administrador')}
                                  onChange={(e) => handleUpdateUserRoleAndSector(user.id, 'setor', e.target.value)}
                                  className="w-full p-2 rounded-xl border font-medium text-xs outline-none cursor-pointer shadow-sm disabled:opacity-70"
                                  style={solidCardStyle}
                                >
                                  {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </td>
                              <td className="p-4 md:p-5 text-right space-x-1">
                                <button onClick={() => handleToggleUserStatus(user.id, user.nome, user.status)} disabled={isUpdatingThis} className="p-2.5 text-brand-panel hover:bg-black/5 dark:hover:bg-white/5 rounded-xl cursor-pointer transition-colors disabled:opacity-70" aria-label={user.status === 'bloqueado' ? 'Desbloquear Acesso' : 'Bloquear Acesso'} title={user.status === 'bloqueado' ? 'Desbloquear Acesso' : 'Bloquear Acesso'}>
                                  {user.status === 'bloqueado' ? <Unlock className="w-4 h-4"/> : <Lock className="w-4 h-4"/>}
                                </button>
                                <button onClick={() => handleDeleteUser(user.id, user.nome)} disabled={isUpdatingThis} className="p-2.5 text-[var(--error-text)] hover:bg-red-500/10 rounded-xl cursor-pointer transition-colors disabled:opacity-70" aria-label="Excluir Colaborador" title="Excluir Colaborador">
                                  <Trash2 className="w-4 h-4"/>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {currentUsers.length === 0 && (
                          <tr><td colSpan={4} className="p-6 text-center opacity-70 font-medium text-xs">Nenhum colaborador encontrado.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {totalPages > 1 && (
                    <div className="p-4 border-t flex items-center justify-between" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-card)' }}>
                      <span className="text-xs font-medium opacity-75">Página {currentPage} de {totalPages}</span>
                      <div className="flex space-x-2">
                        <button aria-label="Anterior" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-2 rounded-xl border hover:bg-black/10 disabled:opacity-30 cursor-pointer transition-colors shadow-sm" style={{ borderColor: 'var(--border-input)' }}><ChevronLeft className="w-4 h-4" /></button>
                        <button aria-label="Próximo" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-2 rounded-xl border hover:bg-black/10 disabled:opacity-30 cursor-pointer transition-colors shadow-sm" style={{ borderColor: 'var(--border-input)' }}><ChevronRight className="w-4 h-4" /></button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* CATEGORIAS */}
            {activeTab === 'categorias' && isManager && (
              <div className="space-y-6 max-w-4xl">
                <form onSubmit={handleAddCategory} className="flex flex-col sm:flex-row items-end gap-3 p-6 rounded-3xl border shadow-sm" style={solidInputStyle}>
                  <div className="flex-1 w-full">
                    <label htmlFor="field-6" className="text-xs font-semibold uppercase tracking-widest opacity-75 block mb-2">Nome da Categoria</label>
                    <input id="field-6" type="text" required value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder="Ex: Infraestrutura, Urgente..." className="w-full px-4 py-3.5 rounded-2xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors shadow-sm" style={solidCardStyle} />
                  </div>
                  <div className="w-full sm:w-auto">
                    <label htmlFor="field-7" className="text-xs font-semibold uppercase tracking-widest opacity-75 block mb-2">Cor da Tag</label>
                    <input id="field-7" type="color" value={newCategoryColor} onChange={e => setNewCategoryColor(e.target.value)} className="w-full sm:w-16 h-[50px] p-1.5 rounded-2xl border cursor-pointer shadow-sm" style={solidCardStyle} />
                  </div>
                  <button type="submit" disabled={isSavingCategory} className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-brand-panel text-white text-sm font-semibold flex items-center justify-center cursor-pointer hover:opacity-90 active:scale-95 transition-transform shadow-sm disabled:opacity-70">
                    {isSavingCategory ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}
                    Adicionar
                  </button>
                </form>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {taskCategories.map(cat => (
                    <div key={cat.id} className="p-4 rounded-2xl border flex items-center justify-between shadow-sm" style={solidCardStyle}>
                      <div className="flex items-center space-x-3 overflow-hidden">
                        <span className="w-3.5 h-3.5 rounded-full flex-shrink-0 shadow-sm" style={{ backgroundColor: cat.cor }}></span>
                        <span className="text-xs font-semibold truncate">{cat.nome}</span>
                      </div>
                      <button onClick={() => handleDeleteCategory(cat.id, cat.nome)} className="p-2 text-[var(--error-text)] hover:bg-red-500/10 rounded-xl cursor-pointer transition-colors" aria-label="Excluir Categoria" title="Excluir Categoria">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {taskCategories.length === 0 && (
                     <div className="col-span-full p-6 text-center opacity-70 font-medium text-xs">
                        Nenhuma categoria encontrada ou acesso bloqueado por RLS.
                     </div>
                  )}
                </div>
              </div>
            )}

            {/* PERMISSÕES E VIPs */}
            {activeTab === 'permissoes' && isManager && (
              <div className="space-y-8 w-full">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold flex items-center"><Users className="w-4 h-4 mr-2 text-brand-panel"/> Matriz de Acesso por Cargo</h3>
                    <p className="text-xs opacity-75 mt-1">Defina as permissões nativas. Todos os colaboradores do cargo selecionado terão acesso imediato à aba correspondente.</p>
                  </div>
                  <div className="rounded-3xl border overflow-hidden shadow-sm w-full" style={solidInputStyle}>
                    <div className="overflow-x-auto w-full custom-scrollbar">
                      <table className="w-full text-left border-collapse text-xs whitespace-nowrap min-w-[700px]">
                        <thead>
                          <tr className="border-b opacity-75 font-semibold uppercase text-xs tracking-wider" style={{ borderColor: 'var(--border-input)' }}>
                            <th className="p-4 md:p-5">Funcionalidade / Aba</th>
                            <th className="p-4 md:p-5 text-center">Admin / Gestor</th>
                            <th className="p-4 md:p-5 text-center">Coordenador</th>
                            <th className="p-4 md:p-5 text-center">Supervisor</th>
                            <th className="p-4 md:p-5 text-center">Analista</th>
                            <th className="p-4 md:p-5 text-center">Colaborador</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y" style={{ borderColor: 'var(--border-input)' }}>
                          {tabPermissions.map(tab => (
                            <tr key={tab.tabKey} className="transition-colors hover:bg-black/5 dark:hover:bg-white/5">
                              <td className="p-4 md:p-5 font-semibold text-sm">{tab.tabName}</td>
                              {(['gestor', 'coordenador', 'supervisor', 'analista', 'colaborador'] as RoleType[]).map(role => {
                                const hasAccess = tab.allowedRoles.includes(role);
                                return (
                                  <td key={role} className="p-4 md:p-5 text-center w-[120px]">
                                    <button disabled={!isAdmin||permissionActions.pending>0} aria-label={tab.tabName+': '+role} onClick={() => toggleRolePermission(tab.tabKey, role)} className={`w-full py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer shadow-sm ${hasAccess ? 'bg-emerald-500/10 text-[var(--success)] border-emerald-500/30' : 'opacity-70 hover:opacity-100'}`} style={!hasAccess ? solidCardStyle : undefined}>
                                      {hasAccess ? 'Liberado' : 'Bloqueado'}
                                    </button>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                          {tabPermissions.length === 0 && <tr><td colSpan={6} className="p-6 text-center opacity-70 font-medium">As permissões estão protegidas por regras do servidor e não puderam ser carregadas.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="space-y-5 pt-6 border-t" style={{ borderColor: 'var(--border-input)' }}>
                  <div>
                    <h3 className="text-sm font-semibold flex items-center text-brand-panel"><Shield className="w-4 h-4 mr-2"/> Acessos Individuais (Exceções VIP)</h3>
                    <p className="text-xs opacity-75 mt-1">
                      Selecione um colaborador para dar ou retirar acesso a funcionalidades independentemente do seu cargo base.
                    </p>
                  </div>

                  {usersWithExceptions.length > 0 && (
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="text-xs font-semibold opacity-70 mr-1 uppercase tracking-wider">VIPs Ativos:</span>
                      {usersWithExceptions.map(u => (
                         <button
                           key={u.user_id}
                           onClick={() => setSelectedExceptionUserId(u.user_id)}
                           className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer shadow-sm ${selectedExceptionUserId === u.user_id ? 'bg-brand-panel text-white border-brand-panel shadow-sm' : 'bg-brand-panel/10 text-brand-panel border-brand-panel/30 hover:bg-brand-panel/20'}`}
                         >
                            {u.nome.split(' ')[0]}
                         </button>
                      ))}
                    </div>
                  )}

                  <div className="max-w-md relative">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-70" />
                    <select
                       value={selectedExceptionUserId || ''}
                       onChange={(e) => setSelectedExceptionUserId(e.target.value)}
                       className="w-full pl-10 pr-4 py-3.5 rounded-2xl border text-sm font-medium outline-none focus:border-brand-panel shadow-sm appearance-none cursor-pointer"
                       style={solidInputStyle}
                    >
                       <option value="" disabled>Selecione um colaborador da lista...</option>
                       {companyUsers.map(u => (
                         <option key={u.user_id} value={u.user_id}>{u.nome} ({u.cargo})</option>
                       ))}
                    </select>
                  </div>

                  {selectedExceptionUserId && (
                     <div className="p-6 md:p-8 rounded-3xl border shadow-sm animate-in fade-in slide-in-from-bottom-4 w-full" style={solidInputStyle}>
                        <div className="flex items-center space-x-4 mb-6 pb-6 border-b" style={{ borderColor: 'var(--border-input)' }}>
                           <div className="w-12 h-12 rounded-2xl bg-brand-panel text-white font-semibold flex items-center justify-center text-sm shadow-sm">
                             {getInitials(companyUsers.find(u => u.user_id === selectedExceptionUserId)?.nome || '')}
                           </div>
                           <div>
                             <p className="font-semibold text-base">{companyUsers.find(u => u.user_id === selectedExceptionUserId)?.nome}</p>
                             <p className="text-xs uppercase font-medium opacity-70 tracking-wider mt-0.5">{companyUsers.find(u => u.user_id === selectedExceptionUserId)?.cargo}</p>
                           </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                           {tabPermissions.map(tab => {
                              const user = companyUsers.find(u => u.user_id === selectedExceptionUserId);
                              const userRole = (user?.cargo || '').toLowerCase();
                              const hasRoleAccess = tab.allowedRoles.some(r => r.toLowerCase() === userRole);
                              const isVip = tab.allowedUsers.includes(selectedExceptionUserId);

                              return (
                                 <div key={tab.tabKey} className={`p-5 rounded-2xl border flex flex-col justify-between space-y-4 transition-colors shadow-sm ${isVip ? 'border-brand-panel bg-brand-panel/5' : ''}`} style={{ backgroundColor: 'var(--bg-card)', borderColor: isVip ? '' : 'var(--border-input)' }}>
                                    <span className="font-semibold text-xs">{tab.tabName}</span>
                                    <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: 'var(--border-input)' }}>
                                       {hasRoleAccess ? (
                                          <span className="text-xs font-semibold text-[var(--success)] bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">Acesso Nativo do Cargo</span>
                                       ) : (
                                          <label className="flex items-center space-x-2.5 cursor-pointer w-full justify-between group">
                                             <span className={`text-xs font-semibold transition-opacity ${isVip ? 'text-brand-panel' : 'opacity-70 group-hover:opacity-80'}`}>{isVip ? 'Exceção Concedida' : 'Sem Acesso'}</span>
                                             <input type="checkbox" disabled={!isAdmin||permissionActions.pending>0} aria-label={'Exceção: '+tab.tabName} checked={isVip} onChange={() => toggleUserException(selectedExceptionUserId, tab.tabKey)} className="w-4 h-4 rounded accent-brand-panel cursor-pointer shadow-sm" />
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
              <div className="space-y-6 w-full">

                <div className="flex space-x-2 border-b pb-4 mb-2" style={{ borderColor: 'var(--border-input)' }}>
                  <button onClick={() => setLogTab('sistema')} className={`px-5 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-sm ${logTab === 'sistema' ? 'bg-brand-panel text-white' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-75 hover:opacity-100'}`}>Auditoria de Ações</button>
                  <button onClick={() => setLogTab('retencao')} className={`px-5 py-2.5 rounded-xl text-xs font-semibold transition-colors flex items-center cursor-pointer shadow-sm ${logTab === 'retencao' ? 'bg-brand-panel text-white' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-75 hover:opacity-100'}`}><Database className="w-4 h-4 mr-1.5" /> Retenção do Chat</button>
                </div>

                {logTab === 'sistema' ? (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="relative w-full sm:w-96">
                        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-70" />
                        <input
                          type="text"
                          value={logSearch}
                          onChange={e => { setLogSearch(e.target.value); setLogPage(1); }}
                          placeholder="Filtrar por autor, ação ou detalhes do registo..."
                          className="w-full pl-10 pr-4 py-3 rounded-2xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors shadow-sm"
                          style={solidInputStyle}
                        />
                      </div>
                      <span className="text-xs font-semibold opacity-70 px-3 py-1.5 rounded-lg border shadow-sm" style={solidCardStyle}>
                        Total: {filteredLogs.length} Registos
                      </span>
                    </div>

                    <div className="rounded-3xl border overflow-hidden shadow-sm w-full" style={solidInputStyle}>
                      <div className="overflow-x-auto w-full custom-scrollbar">
                        <table className="w-full text-left border-collapse text-xs whitespace-nowrap min-w-[800px]">
                          <thead>
                            <tr className="border-b opacity-75 font-semibold uppercase text-xs tracking-wider" style={{ borderColor: 'var(--border-input)' }}>
                              <th className="p-4 md:p-5">Data / Hora</th>
                              <th className="p-4 md:p-5">Autor</th>
                              <th className="p-4 md:p-5">Ação Executada</th>
                              <th className="p-4 md:p-5 w-1/2">Detalhes da Auditoria</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y" style={{ borderColor: 'var(--border-input)' }}>
                            {currentLogs.map(log => (
                              <tr key={log.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                                <td className="p-4 md:p-5 opacity-70 font-medium">
                                  {new Date(log.created_at).toLocaleDateString('pt-BR')} às {new Date(log.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute:'2-digit' })}
                                </td>
                                <td className="p-4 md:p-5 font-semibold">{log.autor_nome}</td>
                                <td className="p-4 md:p-5 font-medium text-brand-panel">{log.acao}</td>
                                <td className="p-4 md:p-5 opacity-80 font-medium truncate max-w-xs xl:max-w-md" title={log.detalhes}>{log.detalhes}</td>
                              </tr>
                            ))}
                            {currentLogs.length === 0 && (
                              <tr>
                                <td colSpan={4} className="p-8 text-center opacity-70 font-medium text-xs">Nenhum registo de auditoria corresponde à sua pesquisa.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* PAGINAÇÃO */}
                      {totalLogPages > 1 && (
                        <div className="p-4 border-t flex flex-col sm:flex-row items-center justify-between gap-4" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-card)' }}>
                          <span className="text-xs font-medium opacity-75">Página {logPage} de {totalLogPages}</span>
                          <div className="flex items-center space-x-1.5">
                            <button aria-label="Anterior" onClick={() => setLogPage(p => Math.max(1, p - 1))} disabled={logPage === 1} className="p-1.5 rounded-lg border hover:bg-black/10 disabled:opacity-30 cursor-pointer transition-colors shadow-sm" style={{ borderColor: 'var(--border-input)' }}><ChevronLeft className="w-4 h-4" /></button>
                            <div className="flex items-center space-x-1 px-2">
                               {renderPaginationNumbers(logPage, totalLogPages, setLogPage)}
                            </div>
                            <button aria-label="Próximo" onClick={() => setLogPage(p => Math.min(totalLogPages, p + 1))} disabled={logPage === totalLogPages} className="p-1.5 rounded-lg border hover:bg-black/10 disabled:opacity-30 cursor-pointer transition-colors shadow-sm" style={{ borderColor: 'var(--border-input)' }}><ChevronRight className="w-4 h-4" /></button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="p-6 rounded-3xl border shadow-sm bg-emerald-500/5 border-emerald-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h3 className="font-semibold text-sm md:text-base text-emerald-600 flex items-center"><Archive className="w-4 h-4 mr-2" /> Backup Completo (ZIP)</h3>
                        <p className="text-xs opacity-75 mt-1 max-w-xl font-medium">Baixe todas as mensagens e históricos de todos os canais do sistema em um único arquivo ZIP compactado.</p>
                      </div>
                      <button onClick={handleDownloadZipBackup} disabled={isDownloadingZip} className="px-6 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer flex items-center justify-center flex-shrink-0 active:scale-95 disabled:opacity-70">
                        {isDownloadingZip ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <DownloadCloud className="w-4 h-4 mr-2" />}
                        <span>{isDownloadingZip ? 'A compactar...' : 'Baixar ZIP Global'}</span>
                      </button>
                    </div>

                    <div className="p-6 rounded-3xl border shadow-sm bg-brand-panel/5 border-brand-panel/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <h3 className="font-semibold text-sm md:text-base text-brand-panel flex items-center"><Database className="w-4 h-4 mr-2" /> Gestão de Espaço do Banco de Dados</h3>
                        <p className="text-xs opacity-75 mt-1 max-w-xl font-medium">O sistema retém mensagens por 7 dias. Você pode forçar a exclusão imediata de todas as mensagens antigas para otimizar o Supabase.</p>

                        <div className="mt-3 inline-flex items-center px-3 py-1.5 rounded-xl bg-brand-panel/10 border border-brand-panel/20 shadow-xs">
                          <span className="text-xs font-medium opacity-70 mr-2">Última Limpeza Global efetuada em:</span>
                          <span className="text-xs font-semibold text-brand-panel">{dataUltimaLimpeza}</span>
                        </div>
                      </div>

                      <button onClick={handlePurgeOldGlobal} disabled={isPurgingGlobal} className="px-6 py-3.5 rounded-2xl bg-brand-panel text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer flex-shrink-0 active:scale-95 disabled:opacity-70">
                        {isPurgingGlobal ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : null}
                        <span>{isPurgingGlobal ? 'A limpar...' : 'Forçar Limpeza Global'}</span>
                      </button>
                    </div>

                    <div className="space-y-4">
                       <h3 className="font-semibold text-xs uppercase tracking-widest opacity-75">Extração Individual de Canais</h3>
                       <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                          {adminChannels.map(canal => {
                             const isSpinning = isPurging === canal.id || isDownloadingTranscript === canal.id;
                             return (
                              <div key={canal.id} className={`p-5 rounded-3xl border flex flex-col justify-between space-y-4 shadow-sm ${canal.isGhost ? 'bg-red-500/5 border-red-500/20' : ''}`} style={!canal.isGhost ? solidInputStyle : undefined}>
                                 <div className="flex items-center space-x-3.5">
                                   <div className={`w-11 h-11 rounded-2xl flex-shrink-0 flex items-center justify-center font-semibold text-white shadow-sm text-sm ${canal.isGhost ? 'bg-red-500' : 'bg-brand-panel'}`}>
                                     {getInitials(canal.name.replace('Fantasma: ', '').replace('Direta: ', ''))}
                                   </div>
                                   <div className="overflow-hidden">
                                     <p className={`font-semibold text-sm truncate ${canal.isGhost ? 'text-[var(--error-text)]' : ''}`}>{canal.name}</p>
                                     <p className="text-xs uppercase font-semibold opacity-70 mt-0.5 tracking-wider">
                                       {canal.isGhost ? 'Chat Inválido / Órfão' : canal.isGroup ? 'Canal / Grupo' : 'Conversa Direta'}
                                     </p>
                                   </div>
                                 </div>

                                 <div className="flex space-x-2 pt-3 border-t" style={{ borderColor: 'var(--border-input)' }}>
                                   <button onClick={() => handleDownloadTranscript(canal.id, canal.name)} disabled={isSpinning} className="flex-1 py-2.5 rounded-xl bg-brand-panel/10 text-brand-panel hover:bg-brand-panel/20 text-xs font-semibold transition-colors flex items-center justify-center cursor-pointer shadow-xs disabled:opacity-70">
                                     {isDownloadingTranscript === canal.id ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <DownloadCloud className="w-3.5 h-3.5 mr-1.5" />}
                                     <span>{isDownloadingTranscript === canal.id ? 'Baixando...' : 'Baixar (.txt)'}</span>
                                   </button>
                                   {canal.isGroup ? (
                                      <button onClick={() => handlePurgeChannel(canal.id, canal.name)} disabled={isSpinning} className="px-3.5 py-2.5 rounded-xl bg-amber-500/10 text-[var(--warning)] hover:bg-amber-500/20 text-xs font-semibold transition-colors cursor-pointer shadow-xs disabled:opacity-70" title="Limpar Histórico deste Grupo (Mantém o canal)">
                                        {isPurging === canal.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                                      </button>
                                   ) : (
                                      <button onClick={() => handleDeleteChannel(canal.id, canal.name)} disabled={isSpinning} className="px-3.5 py-2.5 rounded-xl bg-red-500/10 text-[var(--error-text)] hover:bg-red-500/20 text-xs font-semibold transition-colors cursor-pointer shadow-xs disabled:opacity-70" title="Excluir Canal Permanentemente">
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
              <div className="space-y-4 max-w-3xl">
                <div className="p-6 md:p-8 rounded-3xl border space-y-6" style={solidInputStyle}>
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wider opacity-75 mb-4">Notificações do Sistema Doo Doo</h3>
                    <label className="flex items-center justify-between p-4 rounded-2xl border cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors shadow-sm group" style={solidCardStyle}>
                      <div>
                        <span className="font-semibold text-sm block">Notificações por E-mail</span>
                        <span className="text-xs opacity-75 mt-0.5 block font-medium">Receba e-mails ao receber convites para Reuniões ou atribuição de Tarefas VIP.</span>
                      </div>
                      <input type="checkbox" checked={currentUser.email_notifications ?? false} onChange={() => handleTogglePrivacySetting('email_notifications')} disabled={isUpdatingPrivacy} className="w-5 h-5 rounded border-gray-300 accent-brand-panel cursor-pointer shadow-sm disabled:opacity-70 group-hover:scale-110 transition-transform" />
                    </label>
                  </div>

                  <div className="h-px w-full my-6" style={{ backgroundColor: 'var(--border-input)' }}></div>

                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wider opacity-75 mb-4">Privacidade no Chat Corporativo</h3>
                    <label className="flex items-center justify-between p-4 rounded-2xl border cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors shadow-sm group" style={solidCardStyle}>
                      <div>
                        <span className="font-semibold text-sm block">Confirmação de Leitura (Visto Azul)</span>
                        <span className="text-xs opacity-75 mt-0.5 block font-medium">Permitir que os seus colegas vejam exatamente o horário em que leu as mensagens diretas.</span>
                      </div>
                      <input type="checkbox" checked={currentUser.read_receipts ?? true} onChange={() => handleTogglePrivacySetting('read_receipts')} disabled={isUpdatingPrivacy} className="w-5 h-5 rounded border-gray-300 accent-brand-panel cursor-pointer shadow-sm disabled:opacity-70 group-hover:scale-110 transition-transform" />
                    </label>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>

      </div>

      {/* MODAIS */}
      {isUserModalOpen && (
        <ModalShell open description={<><span className="text-xs font-semibold uppercase tracking-widest text-brand-panel">Registo</span></>} title={<>Novo Colaborador</>} onClose={() => setIsUserModalOpen(false)} busy={isSaving || dialogAction.pending}  footer={<div className="flex justify-end space-x-3 pt-5 border-t" style={{ borderColor: 'var(--border-input)' }}>
                <button form="modal-form-1" type="button" onClick={() => setIsUserModalOpen(false)} className="px-6 py-3.5 rounded-xl border text-sm font-semibold cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" style={{ borderColor: 'var(--border-input)' }}>Cancelar</button>
                <button form="modal-form-1" type="submit" disabled={isSaving} className="px-7 py-3.5 rounded-xl bg-brand-panel text-white text-sm font-semibold shadow-sm cursor-pointer hover:opacity-90 active:scale-95 transition-transform disabled:opacity-70 flex items-center space-x-2">
                  {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Adicionar</span>
                </button>
              </div>}>
{pendingRegistration && <Notice>Autenticação confirmada. Conclua o perfil usando o mesmo e-mail. Sua sessão administrativa foi preservada.</Notice>}
<form id="modal-form-1" onSubmit={event => { event.preventDefault(); void dialogAction.run(() => handleCreateUser(event)); }} className="p-6 md:p-8 space-y-5 text-xs">
              <div>
                <label htmlFor="field-8" className="text-xs font-semibold uppercase tracking-widest opacity-75 block mb-2">Nome Completo</label>
                <input id="field-8" type="text" required value={newUserName} onChange={(e) => setNewUserName(e.target.value)} placeholder="Ex: Ana Paula..." className="w-full px-4 py-3.5 rounded-2xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors shadow-sm" style={solidInputStyle} />
              </div>
              <div>
                <label htmlFor="field-9" className="text-xs font-semibold uppercase tracking-widest opacity-75 block mb-2">E-mail Corporativo</label>
                <input id="field-9" type="email" required disabled={Boolean(pendingRegistration)} value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} placeholder="ana.paula@hospital.com" className="w-full px-4 py-3.5 rounded-2xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors shadow-sm" style={solidInputStyle} />
              </div>
              <div>
                <label htmlFor="field-10" className="text-xs font-semibold uppercase tracking-widest opacity-75 block mb-2">Senha Inicial</label>
                <input id="field-10" type="password" required disabled={Boolean(pendingRegistration)} value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} placeholder="••••••••" className="w-full px-4 py-3.5 rounded-2xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors shadow-sm" style={solidInputStyle} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="field-11" className="text-xs font-semibold uppercase tracking-widest opacity-75 block mb-2">Cargo</label>
                  <select id="field-11" value={newUserRole} onChange={e => setNewUserRole(e.target.value as RoleType)} className="w-full px-3.5 py-3 rounded-2xl border text-[12px] font-medium outline-none cursor-pointer shadow-sm" style={solidInputStyle}>
                    <option value="administrador">Administrador</option>
                    <option value="gestor">Gestor</option>
                    <option value="coordenador">Coordenador</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="analista">Analista</option>
                    <option value="colaborador">Colaborador</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="field-12" className="text-xs font-semibold uppercase tracking-widest opacity-75 block mb-2">Setor</label>
                  <select id="field-12" value={newUserSector} onChange={(e) => setNewUserSector(e.target.value)} className="w-full px-3.5 py-3 rounded-2xl border text-[12px] font-medium outline-none cursor-pointer shadow-sm" style={solidInputStyle}>
                    {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

            </form>
</ModalShell>
      )}

      {confirmModal.isOpen && (
        <ModalShell open title={<>{confirmModal.title}</>} onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} destructive busy={dialogAction.pending}  footer={<div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3 px-6 md:px-8 py-5 border-t" style={{ borderColor: 'var(--border-input)' }}>
              <button onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} className="w-full sm:w-auto px-6 py-3.5 rounded-xl border text-sm font-semibold cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" style={{ borderColor: 'var(--border-input)' }}>Cancelar</button>
              <button onClick={() => dialogAction.run(confirmModal.onConfirm)} className={`w-full sm:w-auto px-7 py-3.5 rounded-xl text-white text-sm font-semibold cursor-pointer transition-colors shadow-sm active:scale-95 ${confirmModal.isDestructive ? 'bg-red-500 hover:bg-red-600' : 'bg-brand-panel hover:opacity-90'}`}>
                Confirmar
              </button>
            </div>}>
<div className="p-6 md:p-8"><p className="text-sm font-semibold opacity-80 leading-relaxed text-center">{confirmModal.message}</p></div>
</ModalShell>
      )}

    </div>
  );
}
