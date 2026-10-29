'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  Settings, Shield, Bell, Users, Palette, 
  Save, Check, UserPlus, Trash2, X, Loader2, Search, Activity,
  ChevronLeft, ChevronRight, Lock, Unlock, AlertTriangle, LogOut, Tags, Plus
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../contexts/ThemeContext';

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

  const [isExceptionsModalOpen, setIsExceptionsModalOpen] = useState(false);
  const [selectedTabForExceptions, setSelectedTabForExceptions] = useState<TabPermission | null>(null);
  const [selectedUsersForExceptions, setSelectedUsersForExceptions] = useState<string[]>([]);
  
  // 🚀 NOVO ESTADO DE PESQUISA DO VIP
  const [vipSearchQuery, setVipSearchQuery] = useState('');

  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);

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

  const handleSaveExceptions = async () => {
    if (!selectedTabForExceptions) return;
    setTabPermissions(prev => prev.map(tab => tab.tabKey === selectedTabForExceptions.tabKey ? { ...tab, allowedUsers: selectedUsersForExceptions } : tab));
    setIsExceptionsModalOpen(false);
    
    const { error } = await supabase.from('doodoo_permissoes').update({ usuarios_permitidos: selectedUsersForExceptions }).eq('aba_key', selectedTabForExceptions.tabKey);
    if (!error) {
      notifyBell('Acesso VIP Atualizado', `Exceções salvas para a aba ${selectedTabForExceptions.tabName}.`);
      registerLog('Acesso VIP', `Atualizou a lista de exceções individuais para a aba "${selectedTabForExceptions.tabName}" (${selectedUsersForExceptions.length} usuários VIPs).`);
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

  useEffect(() => { setCurrentPage(1); }, [userSearch]);

  const searchedUsers = useMemo(() => {
    return companyUsers.filter(u => u.nome.toLowerCase().includes(userSearch.toLowerCase()) || u.setor.toLowerCase().includes(userSearch.toLowerCase()));
  }, [companyUsers, userSearch]);

  const totalPages = Math.ceil(searchedUsers.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentUsers = searchedUsers.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  if (isLoading) return <div className="w-full h-full flex flex-col items-center justify-center"><Loader2 className="w-8 h-8 animate-spin opacity-50 text-blue-500" /></div>;
  if (authError || !currentUser) return <div className="w-full h-full flex items-center justify-center"><button onClick={handleForceLogout} className="px-6 py-3 rounded-2xl bg-brand-panel text-white font-bold"><LogOut className="w-4 h-4 inline mr-2" />Sair</button></div>;

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
                  <button onClick={() => setActiveTab('logs')} className={`w-full flex items-center space-x-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'logs' ? 'bg-brand-panel text-white shadow-xs' : 'hover:bg-black/5 opacity-75'}`}><Activity className="w-4 h-4" /><span>Auditoria de Logs</span></button>
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
                {activeTab === 'logs' && 'Auditoria de Sistema (Logs)'}
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
                        <td className="p-4"><select value={user.cargo} disabled={user.status === 'bloqueado'} onChange={(e) => handleUpdateUserRoleAndSector(user.id, 'cargo', e.target.value)} className="w-full p-1.5 rounded-lg border font-bold text-[11px] uppercase bg-transparent" style={{ borderColor: 'var(--border-input)' }}><option value="administrador">Admin</option><option value="gestor">Gestor</option><option value="coordenador">Coordenador</option><option value="supervisor">Supervisor</option><option value="analista">Analista</option><option value="colaborador">Colaborador</option></select></td>
                        <td className="p-4"><select value={user.setor} disabled={user.status === 'bloqueado'} onChange={(e) => handleUpdateUserRoleAndSector(user.id, 'setor', e.target.value)} className="w-full p-1.5 rounded-lg border font-bold text-[11px] bg-transparent" style={{ borderColor: 'var(--border-input)' }}>{SECTORS.map(s => <option key={s} value={s}>{s}</option>)}</select></td>
                        <td className="p-4 text-right flex items-center justify-end space-x-1">
                          <button onClick={() => handleToggleUserStatus(user.id, user.nome, user.status)} className="p-2 text-blue-500 hover:bg-blue-500/10 rounded-lg">{user.status === 'bloqueado' ? <Unlock className="w-4 h-4"/> : <Lock className="w-4 h-4"/>}</button>
                          <button onClick={() => handleDeleteUser(user.id, user.nome)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg"><Trash2 className="w-4 h-4"/></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                  <div key={cat.id} className="p-3 rounded-xl border flex items-center justify-between shadow-xs bg-white dark:bg-slate-800" style={{ borderColor: 'var(--border-input)' }}>
                    <div className="flex items-center space-x-2.5 overflow-hidden"><span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.cor }}></span><span className="text-xs font-bold truncate">{cat.nome}</span></div>
                    <button onClick={() => handleDeleteCategory(cat.id, cat.nome)} className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-md cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'permissoes' && isManager && (
            <div className="space-y-5 max-w-6xl">
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
                      <th className="p-4 text-center text-blue-500">Exceções Individuais</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'var(--border-input)' }}>
                    {tabPermissions.map(tab => (
                      <tr key={tab.tabKey} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                        <td className="p-4 font-bold">{tab.tabName}</td>
                        {(['gestor', 'coordenador', 'supervisor', 'analista', 'colaborador'] as RoleType[]).map(role => {
                          const hasAccess = tab.allowedRoles.includes(role);
                          return (
                            <td key={role} className="p-4 text-center">
                              <button onClick={() => toggleRolePermission(tab.tabKey, role)} className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${hasAccess ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'opacity-40 hover:opacity-100'}`} style={!hasAccess ? { backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' } : undefined}>
                                {hasAccess ? 'Acesso Livre' : 'Bloqueado'}
                              </button>
                            </td>
                          );
                        })}
                        <td className="p-4 text-center">
                          <button onClick={() => { 
                            setSelectedTabForExceptions(tab); 
                            setSelectedUsersForExceptions(tab.allowedUsers || []); 
                            setVipSearchQuery(''); // 🚀 Limpa a pesquisa ao abrir o modal
                            setIsExceptionsModalOpen(true); 
                          }} className="px-3 py-1 rounded-lg text-[10px] font-bold border border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-white transition-colors cursor-pointer shadow-sm">
                            + Exceções ({tab.allowedUsers?.length || 0})
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'logs' && isAdmin && ( 
            <div className="space-y-4 max-w-5xl">
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
                      <tr key={log.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
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

      {/* 🚀 MODAL VIP TOTALMENTE REFEITO (PESQUISÁVEL E FÁCIL) */}
      {isExceptionsModalOpen && selectedTabForExceptions && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[85vh]" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
            
            <div className="px-6 py-4 border-b flex items-center justify-between bg-black/5 dark:bg-white/5" style={{ borderColor: 'var(--border-input)' }}>
              <div>
                <h3 className="font-extrabold text-sm text-blue-500">Acessos VIP (Exceções)</h3>
                <p className="text-[10px] font-bold opacity-60 uppercase mt-0.5">Aba: {selectedTabForExceptions.tabName}</p>
              </div>
              <button onClick={() => setIsExceptionsModalOpen(false)} className="p-2 rounded-xl hover:bg-black/10 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            
            {/* BARRA DE PESQUISA */}
            <div className="p-4 border-b" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                <input 
                  type="text" 
                  value={vipSearchQuery}
                  onChange={(e) => setVipSearchQuery(e.target.value)}
                  placeholder="Pesquisar colaborador por nome..." 
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border text-xs font-bold outline-none focus:border-blue-500 shadow-sm"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                />
              </div>
            </div>
            
            {/* LISTA COMPLETA E PESQUISÁVEL COM CHECKBOX */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar" style={{ backgroundColor: 'var(--bg-input)' }}>
              {companyUsers
                .filter(u => u.nome.toLowerCase().includes(vipSearchQuery.toLowerCase()) || u.cargo.toLowerCase().includes(vipSearchQuery.toLowerCase()))
                .map(u => {
                  const userRole = (u.cargo || '').toLowerCase();
                  const hasRoleAccess = Array.isArray(selectedTabForExceptions.allowedRoles) 
                    ? selectedTabForExceptions.allowedRoles.some(r => (r || '').toLowerCase() === userRole)
                    : false;
                    
                  const isVip = selectedUsersForExceptions.includes(u.user_id);
                  
                  return (
                    <label key={u.id} className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors ${isVip ? 'border-blue-500 bg-blue-500/5' : 'hover:border-blue-500 bg-white dark:bg-slate-800'}`} style={{ borderColor: isVip ? '' : 'var(--border-input)' }}>
                      <div className="flex items-center space-x-3">
                         <div className="w-8 h-8 rounded-lg bg-brand-panel text-white font-bold flex items-center justify-center text-[10px]">{getInitials(u.nome)}</div>
                         <div>
                           <span className="font-bold text-xs block">{u.nome}</span>
                           <span className="text-[9px] uppercase tracking-wider opacity-60">{u.cargo} • {u.setor}</span>
                         </div>
                      </div>
                      
                      <div className="flex items-center space-x-3">
                        {hasRoleAccess && !isVip && (
                          <span className="text-[9px] font-extrabold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/20">Acesso Geral Ativo</span>
                        )}
                        <input 
                          type="checkbox" 
                          checked={isVip} 
                          onChange={(e) => { 
                            if (e.target.checked) setSelectedUsersForExceptions(prev => [...prev, u.user_id]); 
                            else setSelectedUsersForExceptions(prev => prev.filter(id => id !== u.user_id)); 
                          }} 
                          className="w-4.5 h-4.5 rounded accent-blue-600 cursor-pointer" 
                        />
                      </div>
                    </label>
                  );
              })}
              
              {companyUsers.filter(u => u.nome.toLowerCase().includes(vipSearchQuery.toLowerCase())).length === 0 && (
                 <div className="text-center p-4 border border-dashed rounded-xl opacity-50 text-[11px] font-bold" style={{ borderColor: 'var(--border-input)' }}>
                   Nenhum colaborador encontrado com "{vipSearchQuery}".
                 </div>
              )}
            </div>

            <div className="p-4 border-t flex justify-between items-center" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-card)' }}>
              <span className="text-[10px] font-bold opacity-50">{selectedUsersForExceptions.length} selecionado(s)</span>
              <div className="flex space-x-2">
                <button onClick={() => setIsExceptionsModalOpen(false)} className="px-4 py-2.5 rounded-xl border text-xs font-bold hover:opacity-80 transition-opacity">Cancelar</button>
                <button onClick={handleSaveExceptions} className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-extrabold hover:bg-blue-700 shadow-sm flex items-center transition-colors cursor-pointer"><Check className="w-4 h-4 mr-1.5" /> Salvar VIPs</button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal Novo Colaborador */}
      {isUserModalOpen && ( <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in"> <div className="w-full max-w-md rounded-3xl border shadow-xl overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}> <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-input)' }}><h3 className="font-extrabold text-sm">Novo Colaborador</h3><button onClick={() => setIsUserModalOpen(false)} className="p-1.5 rounded-lg hover:bg-black/5"><X className="w-4 h-4" /></button></div> <form onSubmit={handleCreateUser} className="p-6 space-y-4 text-xs"> <div><label className="font-bold opacity-60 block mb-1">Nome Completo</label><input type="text" required value={newUserName} onChange={(e) => setNewUserName(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl border font-semibold outline-none focus:border-blue-500" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }} /></div> <div><label className="font-bold opacity-60 block mb-1">E-mail</label><input type="email" required value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl border font-semibold outline-none focus:border-blue-500" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }} /></div> <div className="grid grid-cols-2 gap-3"> <div><label className="font-bold opacity-60 block mb-1">Cargo</label><select value={newUserRole} onChange={(e: any) => setNewUserRole(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border font-bold outline-none cursor-pointer" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}><option value="administrador">Administrador</option><option value="gestor">Gestor</option><option value="coordenador">Coordenador</option><option value="supervisor">Supervisor</option><option value="analista">Analista</option><option value="colaborador">Colaborador</option></select></div> <div><label className="font-bold opacity-60 block mb-1">Setor</label><select value={newUserSector} onChange={(e) => setNewUserSector(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border font-bold outline-none cursor-pointer" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}>{SECTORS.map(s => <option key={s} value={s}>{s}</option>)}</select></div> </div> <div className="flex justify-end space-x-2 pt-4 border-t" style={{ borderColor: 'var(--border-input)' }}><button type="button" onClick={() => setIsUserModalOpen(false)} className="px-4 py-2 rounded-xl border font-bold">Cancelar</button><button type="submit" className="px-5 py-2 rounded-xl bg-brand-panel text-white font-extrabold">Salvar</button></div> </form> </div> </div> )}
    </div>
  );
}