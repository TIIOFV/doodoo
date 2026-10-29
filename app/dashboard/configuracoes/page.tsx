'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  Settings, Shield, Bell, Users, Palette, 
  Save, Check, UserPlus, Trash2, X, Loader2, Search, Activity,
  ChevronLeft, ChevronRight, Lock, Unlock, AlertTriangle, LogOut, Tags, Plus, DownloadCloud, Database, Archive
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../contexts/ThemeContext';
import JSZip from 'jszip'; // Biblioteca de ZIP

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

const parseJsonArray = (val: any): any[] => {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return []; }
  }
  return [];
};

export default function ConfiguracoesPage() {
  const { theme, changeTheme } = useTheme();
  const themes = [
    { id: 'light', name: 'Claro', color: '#f5f5f7', border: '#d2d2d7' },
    { id: 'dark', name: 'Escuro', color: '#0f172a', border: '#475569' },
    { id: 'ocean', name: 'Oceano', color: '#005bb5', border: '#005bb5' },
    { id: 'nature', name: 'Natureza', color: '#2e8b57', border: '#2e8b57' },
    { id: 'sunset', name: 'Pôr do Sol', color: '#d9534f', border: '#d9534f' },
  ];

  const [currentUser, setCurrentUser] = useState<DBProfile | null>(null);
  const [companyUsers, setCompanyUsers] = useState<DBProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const [activeTab, setActiveTab] = useState<'geral' | 'usuarios' | 'permissoes' | 'categorias' | 'notificacoes' | 'logs'>('geral');
  const [logTab, setLogTab] = useState<'sistema' | 'retencao'>('sistema');

  const isAdmin = currentUser?.cargo === 'administrador';
  const isManager = isAdmin || currentUser?.cargo === 'gestor' || currentUser?.cargo === 'coordenador';

  const [userSearch, setUserSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<RoleType>('colaborador');
  const [newUserSector, setNewUserSector] = useState(SECTORS[0]);

  const [tabPermissions, setTabPermissions] = useState<TabPermission[]>([]);
  const [taskCategories, setTaskCategories] = useState<TaskCategory[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#3B82F6');

  const [selectedExceptionUserId, setSelectedExceptionUserId] = useState<string | null>(null);
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
  const [adminChannels, setAdminChannels] = useState<{id: string, name: string, isGroup: boolean}[]>([]);

  const notifyBell = (title: string, desc: string) => {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('doodoo:notify', { detail: { title, desc } }));
  };

  const registerLog = async (acao: string, detalhes: string) => {
    if (!currentUser) return;
    const newLog = { autor_nome: currentUser.nome, acao, detalhes };
    await supabase.from('doodoo_logs').insert([newLog]);
    setSystemLogs(prev => [{ ...newLog, id: Date.now().toString(), created_at: new Date().toISOString() }, ...prev]);
  };

  useEffect(() => {
    const fetchSettingsData = async () => {
      try {
        setIsLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        let perfilAtual = null;
        if (session?.user) {
          const { data } = await supabase.from('doodoo_perfis').select('*').eq('user_id', session.user.id).maybeSingle();
          perfilAtual = data;
        }
        if (!perfilAtual) {
          const { data: fallbackUser } = await supabase.from('doodoo_perfis').select('*').ilike('nome', '%Pedro%').limit(1).maybeSingle();
          perfilAtual = fallbackUser || (await supabase.from('doodoo_perfis').select('*').limit(1).maybeSingle()).data;
        }

        if (perfilAtual) {
          setCurrentUser(perfilAtual as DBProfile);
          
          const { data: todosPerfis } = await supabase.from('doodoo_perfis').select('*').order('nome', { ascending: true });
          if (todosPerfis) setCompanyUsers(todosPerfis as DBProfile[]);

          if (perfilAtual.cargo === 'administrador' || perfilAtual.cargo === 'gestor' || perfilAtual.cargo === 'coordenador') {
            const { data: permissoesDb } = await supabase.from('doodoo_permissoes').select('*').order('aba_key', { ascending: true });
            if (permissoesDb) {
              setTabPermissions(permissoesDb.map(p => ({
                tabKey: p.aba_key, 
                tabName: TAB_NAMES[p.aba_key] || p.aba_key, 
                allowedRoles: parseJsonArray(p.cargos_permitidos), 
                allowedUsers: parseJsonArray(p.usuarios_permitidos)
              })));
            }

            const { data: catsDb } = await supabase.from('doodoo_tarefas_categorias').select('*').order('created_at', { ascending: true });
            if (catsDb) setTaskCategories(catsDb);
            
            const { data: logsDb } = await supabase.from('doodoo_logs').select('*').order('created_at', { ascending: false }).limit(50);
            if (logsDb) setSystemLogs(logsDb);
          }

          if (perfilAtual.cargo === 'administrador') {
            const { data: canaisAdmin } = await supabase.from('doodoo_canais').select('id, nome, is_group, is_direct, membros');
            if (canaisAdmin) {
              const mapped = canaisAdmin.map(c => {
                 let cName = c.nome || 'Canal Sem Nome';
                 if (c.is_direct && c.membros?.length === 2) {
                   cName = `Direta: ${c.membros[0].name.split(' ')[0]} & ${c.membros[1].name.split(' ')[0]}`;
                 }
                 return { id: c.id, name: cName, isGroup: c.is_group };
              });
              setAdminChannels(mapped);
            }
          }
        } else { setAuthError(true); }
      } catch (error) { setAuthError(true); } finally { setIsLoading(false); }
    };
    fetchSettingsData();
  }, []);

  const handleForceLogout = async () => { await supabase.auth.signOut(); window.location.href = '/'; };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    const { error } = await supabase.from('doodoo_perfis').update({ nome: currentUser.nome, setor: currentUser.setor, avatar_url: currentUser.avatar_url }).eq('user_id', currentUser.user_id);
    if (!error) {
      setSavedSuccess(true); notifyBell('⚙️ Perfil Atualizado', 'Suas informações foram salvas com sucesso.');
      registerLog('Perfil Atualizado', 'Atualizou as próprias informações de perfil.');
      setTimeout(() => setSavedSuccess(false), 3000);
      setCompanyUsers(prev => prev.map(u => u.user_id === currentUser.user_id ? currentUser : u));
    }
  };

  const handleUpdateUserRoleAndSector = async (userId: string, field: 'cargo' | 'setor', value: string) => {
    const previousUser = companyUsers.find(u => u.id === userId);
    if (!previousUser || previousUser[field] === value) return;
    setCompanyUsers(prev => prev.map(u => u.id === userId ? { ...u, [field]: value } : u));
    const { error } = await supabase.from('doodoo_perfis').update({ [field]: value }).eq('id', userId);
    if (error) { 
      setCompanyUsers(prev => prev.map(u => u.id === userId ? previousUser : u)); 
      notifyBell('Erro', `Falha ao atualizar ${field}.`); 
    } else {
      registerLog('Alteração de Cadastro', `Alterou o ${field} de ${previousUser.nome} para ${value.toUpperCase()}.`);
    }
  };

  const handleToggleUserStatus = async (userId: string, nome: string, currentStatus: string = 'ativo') => {
    const newStatus = currentStatus === 'bloqueado' ? 'ativo' : 'bloqueado';
    if (window.confirm(`Deseja ${newStatus === 'bloqueado' ? 'bloquear' : 'desbloquear'} o acesso de ${nome}?`)) {
      const previousUser = companyUsers.find(u => u.id === userId);
      setCompanyUsers(prev => prev.map(u => u.id === userId ? { ...u, status: newStatus } : u));
      const { error } = await supabase.from('doodoo_perfis').update({ status: newStatus }).eq('id', userId);
      if (error && previousUser) {
        setCompanyUsers(prev => prev.map(u => u.id === userId ? previousUser : u));
      } else {
        notifyBell('Status Atualizado', `Acesso de ${nome} foi ${newStatus}.`);
        registerLog('Bloqueio/Desbloqueio', `${newStatus === 'bloqueado' ? 'Bloqueou' : 'Desbloqueou'} o acesso de ${nome}.`);
      }
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim()) return;
    const { data, error } = await supabase.from('doodoo_perfis').insert([{
        user_id: '00000000-0000-0000-0000-000000000000', nome: newUserName.trim(), email: newUserEmail.trim(), cargo: newUserRole, setor: newUserSector,
    }]).select().single();
    if (data && !error) {
      setCompanyUsers(prev => [...prev, data as DBProfile]);
      setIsUserModalOpen(false); setNewUserName(''); setNewUserEmail(''); 
      notifyBell('👤 Novo Colaborador', `${data.nome} adicionado.`);
      registerLog('Novo Colaborador', `Cadastrou ${data.nome} no setor ${data.setor} como ${data.cargo}.`);
    }
  };

  const handleDeleteUser = async (id: string, nome: string) => {
    if (window.confirm(`Deseja EXCLUIR o registro de ${nome}?`)) {
      await supabase.from('doodoo_perfis').delete().eq('id', id);
      setCompanyUsers(prev => prev.filter(u => u.id !== id));
      if (currentUsers.length === 1 && currentPage > 1) setCurrentPage(currentPage - 1);
      registerLog('Exclusão de Conta', `Excluiu permanentemente a conta de ${nome}.`);
    }
  };

  const toggleRolePermission = async (tabKey: string, role: RoleType) => {
    const currentTab = tabPermissions.find(t => t.tabKey === tabKey);
    if (!currentTab) return;
    const exists = currentTab.allowedRoles.includes(role);
    const updatedRoles = exists ? currentTab.allowedRoles.filter(r => r !== role) : [...currentTab.allowedRoles, role];

    setTabPermissions(prev => prev.map(tab => tab.tabKey === tabKey ? { ...tab, allowedRoles: updatedRoles } : tab));
    const { error } = await supabase.from('doodoo_permissoes').update({ cargos_permitidos: updatedRoles }).eq('aba_key', tabKey);
    
    if (error) {
      setTabPermissions(prev => prev.map(tab => tab.tabKey === tabKey ? { ...tab, allowedRoles: currentTab.allowedRoles } : tab));
      notifyBell('Erro de Sincronia', 'Falha ao salvar permissões no banco.');
    } else { 
      const acaoTxt = exists ? 'Bloqueou' : 'Liberou';
      notifyBell('Controle de Acesso', `${acaoTxt} a aba ${currentTab.tabName} para ${role.toUpperCase()}.`);
      registerLog('Alteração de Permissão', `${acaoTxt} o acesso da aba "${currentTab.tabName}" para o cargo de ${role.toUpperCase()}.`);
    }
  };

  const toggleUserException = async (userId: string, tabKey: string) => {
    const currentTab = tabPermissions.find(t => t.tabKey === tabKey);
    if (!currentTab) return;
    
    const exists = currentTab.allowedUsers.includes(userId);
    const updatedUsers = exists ? currentTab.allowedUsers.filter(id => id !== userId) : [...currentTab.allowedUsers, userId];
    
    setTabPermissions(prev => prev.map(tab => tab.tabKey === tabKey ? { ...tab, allowedUsers: updatedUsers } : tab));
    
    const { error } = await supabase.from('doodoo_permissoes').update({ usuarios_permitidos: updatedUsers }).eq('aba_key', tabKey);
    
    if (error) {
      setTabPermissions(prev => prev.map(tab => tab.tabKey === tabKey ? { ...tab, allowedUsers: currentTab.allowedUsers } : tab));
      notifyBell('Erro', 'Falha ao salvar a exceção no banco.');
    } else {
      const user = companyUsers.find(u => u.user_id === userId);
      const acaoTxt = exists ? 'Removeu' : 'Concedeu';
      notifyBell('Acesso VIP Atualizado', `${acaoTxt} o acesso de ${user?.nome?.split(' ')[0]} à aba ${currentTab.tabName}.`);
      registerLog('Alteração VIP', `${acaoTxt} acesso individual à aba "${currentTab.tabName}" para ${user?.nome}.`);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    const { data, error } = await supabase.from('doodoo_tarefas_categorias').insert([{ nome: newCategoryName.trim(), cor: newCategoryColor }]).select().single();
    if (data && !error) {
      setTaskCategories(prev => [...prev, data]);
      setNewCategoryName('');
      notifyBell('Categoria Criada', `A categoria ${data.nome} foi adicionada.`);
      registerLog('Nova Categoria', `Criou a categoria de tarefas "${data.nome}".`);
    }
  };

  const handleDeleteCategory = async (id: string, nome: string) => {
    if (window.confirm('Tem certeza que deseja excluir esta categoria?')) {
      await supabase.from('doodoo_tarefas_categorias').delete().eq('id', id);
      setTaskCategories(prev => prev.filter(c => c.id !== id));
      notifyBell('Categoria Removida', 'A categoria foi excluída com sucesso.');
      registerLog('Exclusão de Categoria', `Removeu a categoria de tarefas "${nome}".`);
    }
  };

  const handleTogglePrivacySetting = async (field: 'read_receipts' | 'email_notifications') => {
    if (!currentUser) return;
    const newValue = !(currentUser[field] ?? true);
    setCurrentUser({ ...currentUser, [field]: newValue });
    const { error } = await supabase.from('doodoo_perfis').update({ [field]: newValue }).eq('user_id', currentUser.user_id);
    if (!error) notifyBell('Privacidade', 'Preferências salvas.');
    else setCurrentUser({ ...currentUser, [field]: !newValue });
  };

  const handleDownloadTranscript = async (canalId: string, canalNome: string) => {
    notifyBell('A Preparar Transcript', 'O seu download iniciará em breve...');
    const { data } = await supabase.from('doodoo_mensagens').select('*').eq('canal_id', canalId).order('created_at', { ascending: true });
    
    if (!data || data.length === 0) {
      return notifyBell('Sem dados', 'Nenhuma mensagem encontrada neste canal.');
    }
    
    let txt = `========================================================\n`;
    txt += ` AUDITORIA DE CHAT - DOO DOO OS\n`;
    txt += ` Conversa: ${canalNome}\n`;
    txt += ` Exportado em: ${new Date().toLocaleString('pt-BR')}\n`;
    txt += `========================================================\n\n`;
    
    data.forEach(m => {
       const dataStr = new Date(m.created_at).toLocaleDateString('pt-BR');
       const horaStr = new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
       
       let textoFormatado = m.texto ? m.texto.replace(/\n/g, ' ') : '';
       
       if (m.tipo === 'image') textoFormatado = `📷 [IMAGEM ANEXADA] ${m.metadata?.mediaUrl || ''}`;
       if (m.tipo === 'file') textoFormatado = `📎 [ARQUIVO] ${m.metadata?.fileName || ''} (${m.metadata?.mediaUrl || ''})`;
       if (m.tipo === 'event') textoFormatado = `📅 [REUNIÃO] ${m.metadata?.eventDetails?.title || ''} - ${m.metadata?.eventDetails?.date} às ${m.metadata?.eventDetails?.time}`;
       
       if (m.metadata?.deleted) {
          textoFormatado = `🚫 [MENSAGEM APAGADA PELO USUÁRIO] (Conteúdo Original: "${textoFormatado}")`;
       }
       
       txt += `[${dataStr} ${horaStr}] ${m.sender_nome}: ${textoFormatado}\n`;
    });
    
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `Auditoria_Chat_${canalNome.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    registerLog('Download de Dados', `Efetuou o download do transcript (.txt) do canal "${canalNome}".`);
  };

  const handleDownloadZipBackup = async () => {
    notifyBell('A Gerar Backup', 'Isto pode demorar alguns segundos...');
    try {
      const { data: allMsgs } = await supabase.from('doodoo_mensagens').select('*').order('created_at', { ascending: true });
      if (!allMsgs || allMsgs.length === 0) return notifyBell('Sem dados', 'A base de dados de mensagens está vazia.');

      const zip = new JSZip();
      
      const grouped = allMsgs.reduce((acc: any, m: any) => {
        if (!acc[m.canal_id]) acc[m.canal_id] = [];
        acc[m.canal_id].push(m);
        return acc;
      }, {});

      Object.keys(grouped).forEach(canalId => {
         const canal = adminChannels.find(c => c.id === canalId) || { name: `Canal_Desconhecido_${canalId.substring(0,6)}` };
         const msgs = grouped[canalId];
         
         let txt = `========================================================\n`;
         txt += ` AUDITORIA GLOBAL DE CHAT - DOO DOO OS\n`;
         txt += ` Conversa: ${canal.name}\n`;
         txt += ` Exportado em: ${new Date().toLocaleString('pt-BR')}\n`;
         txt += `========================================================\n\n`;

         msgs.forEach((m: any) => {
           const dataStr = new Date(m.created_at).toLocaleDateString('pt-BR');
           const horaStr = new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
           let textoFormatado = m.texto ? m.texto.replace(/\n/g, ' ') : '';
           
           if (m.tipo === 'image') textoFormatado = `📷 [IMAGEM ANEXADA] ${m.metadata?.mediaUrl || ''}`;
           if (m.tipo === 'file') textoFormatado = `📎 [ARQUIVO] ${m.metadata?.fileName || ''} (${m.metadata?.mediaUrl || ''})`;
           if (m.tipo === 'event') textoFormatado = `📅 [REUNIÃO] ${m.metadata?.eventDetails?.title || ''}`;
           if (m.metadata?.deleted) textoFormatado = `🚫 [MENSAGEM APAGADA PELO USUÁRIO] (Conteúdo Original: "${textoFormatado}")`;
           
           txt += `[${dataStr} ${horaStr}] ${m.sender_nome}: ${textoFormatado}\n`;
         });
         
         zip.file(`Auditoria_Chat_${canal.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`, txt);
      });

      const blob = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.setAttribute("download", `DooDoo_Backup_Total_Mensagens_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.zip`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      registerLog('Backup Global', `Realizou um Backup Geral em ZIP de todo o histórico de chats do sistema.`);
    } catch (e) {
      notifyBell('Erro', 'Ocorreu um problema ao gerar o ZIP. Certifique-se que o pacote jszip está instalado.');
    }
  };

  const handlePurgeChannel = async (canalId: string, canalNome: string) => {
    if (window.confirm(`ATENÇÃO: Deseja apagar permanentemente TODAS as mensagens do canal "${canalNome}"? Esta ação não pode ser desfeita.`)) {
      await supabase.from('doodoo_mensagens').delete().eq('canal_id', canalId);
      notifyBell('Histórico Excluído', `As mensagens de ${canalNome} foram apagadas.`);
      registerLog('Exclusão de Dados', `Apagou manualmente todo o histórico de mensagens do canal "${canalNome}".`);
    }
  };

  const handlePurgeOldGlobal = async () => {
    if (window.confirm(`ATENÇÃO: Deseja forçar a exclusão de TODAS as mensagens do sistema com mais de 7 dias para libertar espaço na base de dados?`)) {
      const seteDias = new Date();
      seteDias.setDate(seteDias.getDate() - 7);
      
      const { error } = await supabase.from('doodoo_mensagens').delete().lt('created_at', seteDias.toISOString());
      if (!error) {
        notifyBell('Limpeza Concluída', 'Mensagens antigas removidas da base de dados.');
        registerLog('Limpeza de Base de Dados', 'Forçou a limpeza global de mensagens do chat mais antigas que 7 dias.');
        
        // Atualiza os logs imediatamente para refletir a nova data na interface
        const newLog = { autor_nome: currentUser?.nome || 'Sistema', acao: 'Limpeza de Base de Dados', detalhes: 'Forçou a limpeza global de mensagens do chat mais antigas que 7 dias.' };
        setSystemLogs(prev => [{ ...newLog, id: Date.now().toString(), created_at: new Date().toISOString() }, ...prev]);
      } else {
        notifyBell('Erro', 'Ocorreu um erro ao limpar a base de dados.');
      }
    }
  };

  useEffect(() => { setCurrentPage(1); }, [userSearch]);

  const searchedUsers = useMemo(() => {
    return companyUsers.filter(u => u.nome.toLowerCase().includes(userSearch.toLowerCase()) || u.setor.toLowerCase().includes(userSearch.toLowerCase()));
  }, [companyUsers, userSearch]);

  const totalPages = Math.ceil(searchedUsers.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentUsers = searchedUsers.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const usersWithExceptions = useMemo(() => {
    return companyUsers.filter(u => tabPermissions.some(tab => tab.allowedUsers.includes(u.user_id)));
  }, [companyUsers, tabPermissions]);

  // 🚀 BUSCA A DATA DA ÚLTIMA LIMPEZA GLOBAL
  const dataUltimaLimpeza = useMemo(() => {
    const ultimoRegisto = systemLogs.find(log => log.acao === 'Limpeza de Base de Dados');
    return ultimoRegisto ? new Date(ultimoRegisto.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Nunca realizada';
  }, [systemLogs]);

  if (isLoading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin opacity-50 text-blue-500" />
      </div>
    );
  }
  
  if (authError || !currentUser) {
    return <div className="w-full h-full bg-transparent"></div>; 
  }

  return (
    <div className="w-full h-full flex flex-col animate-in fade-in duration-300">
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 rounded-[2.5rem] border overflow-hidden shadow-2xl backdrop-blur-xl" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
        
        {/* COLUNA 1: MENU LATERAL */}
        <div className="lg:col-span-3 border-r p-5 flex flex-col justify-between" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
          <div className="space-y-4">
            <div className="space-y-3 pb-4 border-b" style={{ borderColor: 'var(--border-input)' }}>
              <div className="flex items-center justify-between">
                <div><h3 className="font-extrabold text-sm tracking-tight">Painel de Ajustes</h3><p className="text-[10px] font-bold uppercase tracking-widest opacity-40">Doo Doo OS</p></div>
                <div className="flex items-center px-2 py-1 rounded-xl border shadow-sm" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
                  <Palette className="w-3.5 h-3.5 mr-1.5 opacity-40 flex-shrink-0" />
                  <div className="flex items-center space-x-1">
                    {themes.map((t) => (
                      <button key={t.id} onClick={() => changeTheme(t.id)} style={{ width: '10px', height: '10px', backgroundColor: t.color, borderColor: t.border, boxShadow: theme === t.id ? `0 0 0 2px var(--bg-card), 0 0 0 2.5px ${t.border}` : 'none' }} className={`rounded-full border transition-all duration-300 flex-shrink-0 cursor-pointer ${theme === t.id ? 'scale-110' : 'opacity-70 hover:opacity-100'}`} />
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2.5 px-3 py-2 rounded-xl border" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
                <Shield className="w-4 h-4 opacity-70 text-blue-500" />
                <div className="flex flex-col overflow-hidden">
                  <span className="truncate w-full text-xs font-extrabold leading-tight">{currentUser.nome}</span>
                  <span className="text-[9px] font-bold opacity-50 uppercase tracking-wider">{currentUser.cargo} • {currentUser.setor}</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-[10px] font-extrabold uppercase tracking-widest opacity-40 px-2 mb-1">Pessoal</p>
              <button onClick={() => setActiveTab('geral')} className={`w-full flex items-center space-x-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'geral' ? 'bg-brand-panel text-white shadow-xs' : 'hover:bg-black/5 opacity-75'}`}><Settings className="w-4 h-4" /><span>Meu Perfil & Avatar</span></button>
              <button onClick={() => setActiveTab('notificacoes')} className={`w-full flex items-center space-x-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'notificacoes' ? 'bg-brand-panel text-white shadow-xs' : 'hover:bg-black/5 opacity-75'}`}><Bell className="w-4 h-4" /><span>Privacidade</span></button>

              {isManager && (
                <>
                  <div className="pt-3 pb-1"><p className="text-[10px] font-extrabold uppercase tracking-widest opacity-40 px-2">Gestão</p></div>
                  <button onClick={() => setActiveTab('usuarios')} className={`w-full flex items-center space-x-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'usuarios' ? 'bg-brand-panel text-white shadow-xs' : 'hover:bg-black/5 opacity-75'}`}><Users className="w-4 h-4" /><span>Equipe & Colaboradores</span></button>
                  <button onClick={() => setActiveTab('permissoes')} className={`w-full flex items-center space-x-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'permissoes' ? 'bg-brand-panel text-white shadow-xs' : 'hover:bg-black/5 opacity-75'}`}><Shield className="w-4 h-4" /><span>Permissões de Abas</span></button>
                  <button onClick={() => setActiveTab('categorias')} className={`w-full flex items-center space-x-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'categorias' ? 'bg-brand-panel text-white shadow-xs' : 'hover:bg-black/5 opacity-75'}`}><Tags className="w-4 h-4" /><span>Categorias de Tarefas</span></button>
                </>
              )}

              {isAdmin && (
                <>
                  <div className="pt-3 pb-1"><p className="text-[10px] font-extrabold uppercase tracking-widest opacity-40 px-2">Sistema</p></div>
                  <button onClick={() => setActiveTab('logs')} className={`w-full flex items-center space-x-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'logs' ? 'bg-brand-panel text-white shadow-xs' : 'hover:bg-black/5 opacity-75'}`}><Activity className="w-4 h-4" /><span>Auditoria & Dados</span></button>
                </>
              )}
            </div>
          </div>
          <div className="pt-4 border-t text-center text-[10px] opacity-40 font-bold uppercase tracking-wider" style={{ borderColor: 'var(--border-input)' }}>Doo Doo Corporativo</div>
        </div>

        {/* COLUNA 2: CONTEÚDO */}
        <div className="lg:col-span-9 flex flex-col h-full overflow-y-auto p-8 space-y-6 custom-scrollbar" style={{ backgroundColor: 'var(--bg-card)' }}>
          <div className="pb-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-input)' }}>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--tab-active)' }}>Configurações</p>
              <h2 className="text-2xl font-extrabold tracking-tight mt-0.5">
                {activeTab === 'geral' && 'Meu Perfil, Foto & Cargo'}
                {activeTab === 'usuarios' && 'Controle de Colaboradores'}
                {activeTab === 'permissoes' && 'Permissões e Exceções VIP'}
                {activeTab === 'categorias' && 'Categorias das Tarefas'}
                {activeTab === 'notificacoes' && 'Privacidade'}
                {activeTab === 'logs' && 'Auditoria de Sistema & Dados'}
              </h2>
            </div>
            {savedSuccess && (
              <span className="inline-flex items-center px-3 py-1 rounded-xl bg-emerald-500/10 text-emerald-500 text-xs font-extrabold border border-emerald-500/20"><Check className="w-3.5 h-3.5 mr-1" /> Salvo!</span>
            )}
          </div>

          {activeTab === 'geral' && (
            <form onSubmit={handleSaveProfile} className="space-y-6 max-w-3xl">
              <div className="p-6 rounded-2xl border space-y-5" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                <h3 className="text-sm font-extrabold">Avatar</h3>
                <div className="flex items-center space-x-5">
                  <div className="relative">
                    {currentUser.avatar_url ? <img src={currentUser.avatar_url} alt="Avatar" className="w-16 h-16 rounded-2xl object-cover border-2" style={{ borderColor: 'var(--border-input)' }} /> : <div className="w-16 h-16 rounded-2xl bg-brand-panel text-white font-extrabold flex items-center justify-center text-lg">{getInitials(currentUser.nome)}</div>}
                  </div>
                  <div className="flex-1"><input type="url" value={currentUser.avatar_url || ''} onChange={(e) => setCurrentUser(prev => prev ? { ...prev, avatar_url: e.target.value } : null)} placeholder="URL da foto" className="w-full p-2.5 rounded-xl border text-xs outline-none focus:border-blue-500" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }} /></div>
                </div>
              </div>
              <div className="p-6 rounded-2xl border space-y-4" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                <h3 className="text-sm font-extrabold">Dados Pessoais</h3>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div><label className="opacity-60 font-bold block mb-1">Nome</label><input type="text" value={currentUser.nome} onChange={(e) => setCurrentUser(prev => prev ? { ...prev, nome: e.target.value } : null)} className="w-full p-3 rounded-xl border font-bold outline-none" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }} /></div>
                  <div><label className="opacity-60 font-bold block mb-1">Setor</label><select value={currentUser.setor} onChange={(e) => setCurrentUser(prev => prev ? { ...prev, setor: e.target.value } : null)} className="w-full p-3 rounded-xl border font-bold outline-none" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}>{SECTORS.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                </div>
              </div>
              <button type="submit" className="px-6 py-3 rounded-xl bg-brand-panel text-white text-xs font-extrabold shadow-lg float-right"><Save className="w-4 h-4 inline mr-2" />Salvar</button>
            </form>
          )}

          {/* 🚀 TABELA DE COLABORADORES COM PAGINAÇÃO RESTAURADA */}
          {activeTab === 'usuarios' && isManager && (
            <div className="space-y-5 max-w-5xl">
              <div className="flex items-center justify-between">
                <div className="relative w-80"><Search className="w-4 h-4 absolute left-3 top-3 opacity-40" /><input type="text" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Buscar colaborador..." className="w-full pl-9 pr-4 py-2.5 rounded-xl border text-xs font-bold outline-none focus:border-blue-500" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }} /></div>
                <button onClick={() => setIsUserModalOpen(true)} className="px-4 py-2.5 rounded-xl bg-brand-panel text-white text-xs font-extrabold shadow-sm flex items-center"><UserPlus className="w-4 h-4 mr-2" />Novo Colaborador</button>
              </div>
              <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                <table className="w-full text-left text-xs">
                  <thead><tr className="border-b opacity-55 font-extrabold uppercase text-[10px]" style={{ borderColor: 'var(--border-input)' }}><th className="p-4">Colaborador</th><th className="p-4">Cargo</th><th className="p-4">Setor</th><th className="p-4 text-right">Ações</th></tr></thead>
                  <tbody className="divide-y" style={{ borderColor: 'var(--border-input)' }}>
                    {currentUsers.map(user => (
                      <tr key={user.id} className={user.status === 'bloqueado' ? 'opacity-50' : ''}>
                        <td className="p-4 font-bold flex items-center space-x-3">{user.avatar_url ? <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-lg object-cover" /> : <div className="w-8 h-8 rounded-lg bg-brand-panel text-white flex items-center justify-center">{getInitials(user.nome)}</div>}<span>{user.nome}</span></td>
                        <td className="p-4"><select value={user.cargo} disabled={user.status === 'bloqueado'} onChange={(e) => handleUpdateUserRoleAndSector(user.id, 'cargo', e.target.value)} className="w-full p-1.5 rounded-lg border font-bold text-[11px] uppercase bg-transparent" style={{ borderColor: 'var(--border-input)', color: 'var(--text-main)' }}><option value="administrador">Admin</option><option value="gestor">Gestor</option><option value="coordenador">Coordenador</option><option value="supervisor">Supervisor</option><option value="analista">Analista</option><option value="colaborador">Colaborador</option></select></td>
                        <td className="p-4"><select value={user.setor} disabled={user.status === 'bloqueado'} onChange={(e) => handleUpdateUserRoleAndSector(user.id, 'setor', e.target.value)} className="w-full p-1.5 rounded-lg border font-bold text-[11px] bg-transparent" style={{ borderColor: 'var(--border-input)', color: 'var(--text-main)' }}>{SECTORS.map(s => <option key={s} value={s}>{s}</option>)}</select></td>
                        <td className="p-4 text-right flex items-center justify-end space-x-1">
                          <button onClick={() => handleToggleUserStatus(user.id, user.nome, user.status)} className="p-2 text-blue-500 hover:bg-blue-500/10 rounded-lg">{user.status === 'bloqueado' ? <Unlock className="w-4 h-4"/> : <Lock className="w-4 h-4"/>}</button>
                          <button onClick={() => handleDeleteUser(user.id, user.nome)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg"><Trash2 className="w-4 h-4"/></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {/* 🚀 PAGINAÇÃO RESTAURADA */}
                {totalPages > 1 && (
                  <div className="p-4 border-t flex items-center justify-between bg-black/5 dark:bg-white/5" style={{ borderColor: 'var(--border-input)' }}>
                    <span className="text-[10px] font-bold opacity-50">Página {currentPage} de {totalPages}</span>
                    <div className="flex space-x-2">
                      <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded-lg border hover:bg-black/10 disabled:opacity-30 cursor-pointer transition-colors" style={{ borderColor: 'var(--border-input)' }}><ChevronLeft className="w-4 h-4" /></button>
                      <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1.5 rounded-lg border hover:bg-black/10 disabled:opacity-30 cursor-pointer transition-colors" style={{ borderColor: 'var(--border-input)' }}><ChevronRight className="w-4 h-4" /></button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'categorias' && isManager && (
            <div className="space-y-6 max-w-4xl">
              <form onSubmit={handleAddCategory} className="flex items-end space-x-3 p-5 rounded-2xl border" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                <div className="flex-1"><label className="text-[10px] font-bold uppercase opacity-60 block mb-1">Nome da Categoria</label><input type="text" required value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder="Ex: Financeiro, Urgente..." className="w-full p-3 rounded-xl border text-xs font-bold outline-none focus:border-blue-500" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }} /></div>
                <div><label className="text-[10px] font-bold uppercase opacity-60 block mb-1">Cor</label><input type="color" value={newCategoryColor} onChange={e => setNewCategoryColor(e.target.value)} className="w-12 h-[42px] p-1 rounded-xl border bg-transparent" style={{ borderColor: 'var(--border-input)' }} /></div>
                <button type="submit" className="px-5 py-3 rounded-xl bg-brand-panel text-white text-xs font-extrabold flex items-center justify-center cursor-pointer hover:opacity-90"><Plus className="w-4 h-4 mr-1.5" /> Adicionar</button>
              </form>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {taskCategories.map(cat => (
                  <div key={cat.id} className="p-3 rounded-xl border flex items-center justify-between shadow-xs" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
                    <div className="flex items-center space-x-2.5 overflow-hidden"><span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.cor }}></span><span className="text-xs font-bold truncate">{cat.nome}</span></div>
                    <button onClick={() => handleDeleteCategory(cat.id, cat.nome)} className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-md cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'permissoes' && isManager && (
            <div className="space-y-8 max-w-6xl">
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-extrabold flex items-center"><Users className="w-4 h-4 mr-2 text-brand-panel"/> Matriz de Acesso por Cargo</h3>
                  <p className="text-[11px] opacity-60 mt-1">Defina as permissões nativas. Todos os utilizadores do cargo selecionado terão acesso imediato à aba.</p>
                </div>
                <div className="rounded-2xl border overflow-hidden shadow-xs overflow-x-auto" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                  <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                    <thead>
                      <tr className="border-b opacity-55 font-extrabold uppercase text-[9px]" style={{ borderColor: 'var(--border-input)' }}>
                        <th className="p-4">Funcionalidade</th>
                        <th className="p-4 text-center">Admin/Gestor</th>
                        <th className="p-4 text-center">Coordenador</th>
                        <th className="p-4 text-center">Supervisor</th>
                        <th className="p-4 text-center">Analista</th>
                        <th className="p-4 text-center">Colaborador</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: 'var(--border-input)' }}>
                      {tabPermissions.map(tab => (
                        <tr key={tab.tabKey} className="hover:bg-black/5 transition-colors">
                          <td className="p-4 font-bold">{tab.tabName}</td>
                          {(['gestor', 'coordenador', 'supervisor', 'analista', 'colaborador'] as RoleType[]).map(role => {
                            const hasAccess = tab.allowedRoles.includes(role);
                            return (
                              <td key={role} className="p-4 text-center">
                                <button onClick={() => toggleRolePermission(tab.tabKey, role)} className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${hasAccess ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'opacity-40 hover:opacity-100'}`} style={!hasAccess ? { backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)', color: 'var(--text-main)' } : undefined}>
                                  {hasAccess ? 'Acesso Livre' : 'Bloqueado'}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-5 pt-4 border-t" style={{ borderColor: 'var(--border-input)' }}>
                <div>
                  <h3 className="text-sm font-extrabold flex items-center text-blue-500"><Shield className="w-4 h-4 mr-2"/> Acessos Individuais (Exceções VIP)</h3>
                  <p className="text-[11px] opacity-60 mt-1">
                    Selecione um colaborador para dar ou retirar acesso a funcionalidades independentemente do seu cargo.
                  </p>
                </div>
                
                {usersWithExceptions.length > 0 && (
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-[10px] font-bold opacity-50 mr-1 uppercase">VIPs Ativos:</span>
                    {usersWithExceptions.map(u => (
                       <button 
                         key={u.user_id} 
                         onClick={() => setSelectedExceptionUserId(u.user_id)} 
                         className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${selectedExceptionUserId === u.user_id ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-blue-500/10 text-blue-500 border-blue-500/30 hover:bg-blue-500/20'}`}
                       >
                          {u.nome.split(' ')[0]}
                       </button>
                    ))}
                  </div>
                )}

                <div className="max-w-md relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                  <select 
                     value={selectedExceptionUserId || ''} 
                     onChange={(e) => setSelectedExceptionUserId(e.target.value)}
                     className="w-full pl-9 pr-3 py-3 rounded-xl border text-xs font-bold outline-none focus:border-blue-500 shadow-sm appearance-none cursor-pointer"
                     style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                  >
                     <option value="" disabled>Buscar e selecionar colaborador...</option>
                     {companyUsers.map(u => (
                       <option key={u.user_id} value={u.user_id}>{u.nome} ({u.cargo})</option>
                     ))}
                  </select>
                </div>

                {selectedExceptionUserId && (
                   <div className="p-5 rounded-2xl border shadow-sm animate-in fade-in slide-in-from-bottom-4" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                      <div className="flex items-center space-x-3 mb-5 pb-5 border-b" style={{ borderColor: 'var(--border-input)' }}>
                         <div className="w-10 h-10 rounded-xl bg-brand-panel text-white font-extrabold flex items-center justify-center text-xs shadow-sm">
                           {getInitials(companyUsers.find(u => u.user_id === selectedExceptionUserId)?.nome || '')}
                         </div>
                         <div>
                           <p className="font-extrabold text-sm">{companyUsers.find(u => u.user_id === selectedExceptionUserId)?.nome}</p>
                           <p className="text-[10px] uppercase font-bold opacity-50 tracking-wider mt-0.5">{companyUsers.find(u => u.user_id === selectedExceptionUserId)?.cargo}</p>
                         </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                         {tabPermissions.map(tab => {
                            const user = companyUsers.find(u => u.user_id === selectedExceptionUserId);
                            const userRole = (user?.cargo || '').toLowerCase();
                            const hasRoleAccess = tab.allowedRoles.some(r => r.toLowerCase() === userRole);
                            const isVip = tab.allowedUsers.includes(selectedExceptionUserId);

                            return (
                               <div key={tab.tabKey} className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 transition-colors ${isVip ? 'border-blue-500 bg-blue-500/5' : ''}`} style={{ backgroundColor: 'var(--bg-card)', borderColor: isVip ? '' : 'var(--border-input)' }}>
                                  <span className="font-bold text-xs">{tab.tabName}</span>
                                  <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: 'var(--border-input)' }}>
                                     {hasRoleAccess ? (
                                        <span className="text-[9px] font-extrabold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/20">Acesso Nativo do Cargo</span>
                                     ) : (
                                        <label className="flex items-center space-x-2 cursor-pointer w-full justify-between group">
                                           <span className={`text-[10px] font-bold transition-opacity ${isVip ? 'text-blue-500' : 'opacity-40 group-hover:opacity-80'}`}>{isVip ? 'Exceção Concedida' : 'Sem Acesso'}</span>
                                           <input type="checkbox" checked={isVip} onChange={() => toggleUserException(selectedExceptionUserId, tab.tabKey)} className="w-4 h-4 rounded accent-blue-600 cursor-pointer" />
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

          {activeTab === 'logs' && isAdmin && ( 
            <div className="space-y-4 max-w-5xl">
              
              <div className="flex space-x-2 border-b pb-4 mb-4" style={{ borderColor: 'var(--border-input)' }}>
                <button onClick={() => setLogTab('sistema')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${logTab === 'sistema' ? 'bg-brand-panel text-white' : 'hover:bg-black/5 opacity-60 hover:opacity-100'}`}>Auditoria de Ações</button>
                <button onClick={() => setLogTab('retencao')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center ${logTab === 'retencao' ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-black/5 opacity-60 hover:opacity-100'}`}><Database className="w-4 h-4 mr-1.5" /> Retenção do Chat</button>
              </div>

              {logTab === 'sistema' ? (
                <div className="rounded-2xl border overflow-hidden shadow-xs" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b opacity-55 font-extrabold uppercase text-[10px]" style={{ borderColor: 'var(--border-input)' }}>
                        <th className="p-4">Data / Hora</th>
                        <th className="p-4">Autor</th>
                        <th className="p-4">Ação</th>
                        <th className="p-4 w-1/2">Detalhes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: 'var(--border-input)' }}>
                      {systemLogs.map(log => (
                        <tr key={log.id} className="hover:bg-black/5 transition-colors">
                          <td className="p-4 whitespace-nowrap opacity-70">
                            {new Date(log.created_at).toLocaleDateString('pt-BR')} às {new Date(log.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute:'2-digit' })}
                          </td>
                          <td className="p-4 font-bold">{log.autor_nome}</td>
                          <td className="p-4 font-semibold text-blue-500">{log.acao}</td>
                          <td className="p-4 opacity-80">{log.detalhes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="space-y-6">
                  
                  <div className="p-5 rounded-2xl border flex items-center justify-between shadow-sm bg-emerald-500/5 border-emerald-500/20">
                    <div>
                      <h3 className="font-extrabold text-sm text-emerald-600 flex items-center"><Archive className="w-4 h-4 mr-2" /> Backup Completo (ZIP)</h3>
                      <p className="text-xs opacity-70 mt-1 max-w-xl">Baixe todas as mensagens e históricos de todos os canais do sistema em um único arquivo ZIP antes de realizar limpezas.</p>
                    </div>
                    <button onClick={handleDownloadZipBackup} className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm transition-colors cursor-pointer flex items-center">
                      <DownloadCloud className="w-4 h-4 mr-2" /> Baixar ZIP
                    </button>
                  </div>

                  <div className="p-5 rounded-2xl border shadow-sm bg-blue-500/5 border-blue-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h3 className="font-extrabold text-sm text-blue-600 flex items-center"><Database className="w-4 h-4 mr-2" /> Gestão de Espaço do Banco de Dados</h3>
                      <p className="text-xs opacity-70 mt-1 max-w-xl">O sistema retém e exibe mensagens por 7 dias para os utilizadores. Você pode forçar a exclusão imediata de todas as mensagens mais antigas que 7 dias para libertar espaço da base de dados do Supabase.</p>
                      
                      {/* 🚀 DATA DA ÚLTIMA LIMPEZA RESTAURADA E POSICIONADA AQUI */}
                      <div className="mt-3 inline-flex items-center px-2.5 py-1 rounded-md bg-blue-500/10 border border-blue-500/20">
                        <span className="text-[10px] font-bold opacity-70 mr-1.5">Última Limpeza Global efetuada em:</span>
                        <span className="text-[10px] font-extrabold text-blue-600">{dataUltimaLimpeza}</span>
                      </div>
                    </div>
                    
                    <button onClick={handlePurgeOldGlobal} className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-sm transition-colors cursor-pointer flex-shrink-0">
                      Forçar Limpeza Global
                    </button>
                  </div>

                  <div className="space-y-3">
                     <h3 className="font-extrabold text-xs uppercase tracking-widest opacity-60">Extração Individual de Canais</h3>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {adminChannels.map(canal => (
                          <div key={canal.id} className="p-4 rounded-xl border flex flex-col justify-between space-y-4 shadow-sm" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
                             <div className="flex items-center space-x-3">
                               <div className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center font-bold text-white shadow-inner bg-brand-panel">
                                 {getInitials(canal.name)}
                               </div>
                               <div className="overflow-hidden">
                                 <p className="font-extrabold text-sm truncate">{canal.name}</p>
                                 <p className="text-[10px] uppercase font-bold opacity-50 mt-0.5">{canal.isGroup ? 'Canal / Grupo' : 'Conversa Direta'}</p>
                               </div>
                             </div>

                             <div className="flex space-x-2 pt-3 border-t" style={{ borderColor: 'var(--border-input)' }}>
                               <button onClick={() => handleDownloadTranscript(canal.id, canal.name)} className="flex-1 py-2 rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 text-[11px] font-extrabold transition-colors flex items-center justify-center cursor-pointer">
                                 <DownloadCloud className="w-3.5 h-3.5 mr-1.5" /> Baixar Transcript (.txt)
                               </button>
                               <button onClick={() => handlePurgeChannel(canal.id, canal.name)} className="px-3 py-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 text-[11px] font-extrabold transition-colors cursor-pointer" title="Apagar Histórico deste Canal">
                                 <Trash2 className="w-3.5 h-3.5" />
                               </button>
                             </div>
                          </div>
                        ))}
                     </div>
                  </div>
                </div>
              )}
            </div> 
          )}

          {activeTab === 'notificacoes' && (
            <div className="space-y-4 max-w-3xl">
              <div className="p-5 rounded-2xl border space-y-3 text-xs" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                <label className="flex items-center justify-between p-3 rounded-xl border cursor-pointer hover:bg-black/5"><span className="font-bold">Notificações por E-mail</span><input type="checkbox" checked={currentUser.email_notifications ?? false} onChange={() => handleTogglePrivacySetting('email_notifications')} className="w-4 h-4 accent-blue-600 cursor-pointer" /></label>
                <div className="h-px w-full my-4" style={{ backgroundColor: 'var(--border-input)' }}></div>
                <h3 className="font-extrabold opacity-60 uppercase tracking-widest text-[10px]">Privacidade no Chat</h3>
                <label className="flex items-center justify-between p-3 rounded-xl border cursor-pointer hover:bg-black/5">
                  <div><span className="font-bold block">Confirmação de Leitura (Visto Azul)</span><span className="text-[10px] opacity-60 mt-1 block">Colegas veem quando leu a mensagem.</span></div>
                  <input type="checkbox" checked={currentUser.read_receipts ?? true} onChange={() => handleTogglePrivacySetting('read_receipts')} className="w-4 h-4 accent-blue-600 cursor-pointer" />
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Modal Novo Colaborador */}
      {isUserModalOpen && ( <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in" style={{ color: 'var(--text-main)' }}> <div className="w-full max-w-md rounded-3xl border shadow-xl overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}> <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-input)' }}><h3 className="font-extrabold text-sm">Novo Colaborador</h3><button onClick={() => setIsUserModalOpen(false)} className="p-1.5 rounded-lg hover:bg-black/5"><X className="w-4 h-4" /></button></div> <form onSubmit={handleCreateUser} className="p-6 space-y-4 text-xs"> <div><label className="font-bold opacity-60 block mb-1">Nome Completo</label><input type="text" required value={newUserName} onChange={(e) => setNewUserName(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl border font-semibold outline-none focus:border-blue-500" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }} /></div> <div><label className="font-bold opacity-60 block mb-1">E-mail</label><input type="email" required value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl border font-semibold outline-none focus:border-blue-500" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }} /></div> <div className="grid grid-cols-2 gap-3"> <div><label className="font-bold opacity-60 block mb-1">Cargo</label><select value={newUserRole} onChange={(e: any) => setNewUserRole(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border font-bold outline-none cursor-pointer" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}><option value="administrador">Administrador</option><option value="gestor">Gestor</option><option value="coordenador">Coordenador</option><option value="supervisor">Supervisor</option><option value="analista">Analista</option><option value="colaborador">Colaborador</option></select></div> <div><label className="font-bold opacity-60 block mb-1">Setor</label><select value={newUserSector} onChange={(e) => setNewUserSector(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border font-bold outline-none cursor-pointer" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}>{SECTORS.map(s => <option key={s} value={s}>{s}</option>)}</select></div> </div> <div className="flex justify-end space-x-2 pt-4 border-t" style={{ borderColor: 'var(--border-input)' }}><button type="button" onClick={() => setIsUserModalOpen(false)} className="px-4 py-2 rounded-xl border font-bold" style={{ borderColor: 'var(--border-input)' }}>Cancelar</button><button type="submit" className="px-5 py-2 rounded-xl bg-brand-panel text-white font-extrabold">Salvar</button></div> </form> </div> </div> )}
    </div>
  );
}
