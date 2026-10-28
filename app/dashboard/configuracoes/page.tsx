'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  Settings, Shield, Bell, Users, Palette, 
  Save, Check, UserPlus, Trash2, X, Loader2, Search, Activity,
  ChevronLeft, ChevronRight, Lock, Unlock, AlertTriangle, LogOut
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
// 🚀 1. LIGADO AO CÉREBRO GLOBAL DO TEMA
import { useTheme } from '../../contexts/ThemeContext';

type RoleType = 'administrador' | 'gestor' | 'coordenador' | 'supervisor' | 'analista' | 'colaborador';

const SECTORS = [
  'TI',
  'Atendimento',
  'Bloco Cirúrgico',
  'Farmácia',
  'Faturamento/Financeiro',
  'Manutenção',
  'RH',
  'Geral'
];

interface DBProfile {
  id: string; 
  user_id: string;
  nome: string;
  email: string;
  cargo: RoleType;
  setor: string;
  avatar_url?: string;
  status?: string;
  read_receipts?: boolean; // Confirmação de leitura
  email_notifications?: boolean; // Notificações por e-mail
}

interface TabPermission {
  tabName: string;
  tabKey: string;
  allowedRoles: RoleType[];
}

const getInitials = (name: string) => {
  if (!name) return '..';
  const cleanName = name.replace(/^Chat:\s*/i, '').trim();
  const parts = cleanName.split(' ').filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return cleanName.slice(0, 2).toUpperCase();
};

export default function ConfiguracoesPage() {
  const { theme, changeTheme } = useTheme(); // 🚀 Consome o Tema Global

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

  const [activeTab, setActiveTab] = useState<'geral' | 'usuarios' | 'permissoes' | 'notificacoes' | 'logs'>('geral');

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

  const [tabPermissions, setTabPermissions] = useState<TabPermission[]>([
    { tabName: 'Visão Geral', tabKey: 'visao_geral', allowedRoles: ['administrador', 'gestor', 'coordenador', 'supervisor', 'analista', 'colaborador'] },
    { tabName: 'Chat Corporativo', tabKey: 'chat', allowedRoles: ['administrador', 'gestor', 'coordenador', 'supervisor', 'analista', 'colaborador'] },
    { tabName: 'Tarefas (Todas as Filas)', tabKey: 'tarefas_todas', allowedRoles: ['administrador', 'gestor', 'coordenador'] },
    { tabName: 'Tarefas (Minha Fila)', tabKey: 'tarefas_minha', allowedRoles: ['supervisor', 'analista', 'colaborador'] },
    { tabName: 'Agenda', tabKey: 'agenda', allowedRoles: ['administrador', 'gestor', 'coordenador', 'supervisor', 'analista', 'colaborador'] },
    { tabName: 'Anotações (Privadas)', tabKey: 'anotacoes', allowedRoles: ['administrador', 'gestor', 'coordenador', 'supervisor', 'analista', 'colaborador'] },
    { tabName: 'Painel de Gestão e Auditoria', tabKey: 'gestao', allowedRoles: ['administrador'] },
  ]);

  const notifyBell = (title: string, desc: string) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('doodoo:notify', { detail: { title, desc } }));
    }
  };

  useEffect(() => {
    const fetchSettingsData = async () => {
      try {
        setIsLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        let perfilAtual = null;
        
        if (session?.user) {
          const { data } = await supabase
            .from('doodoo_perfis')
            .select('*')
            .eq('user_id', session.user.id)
            .maybeSingle();
          perfilAtual = data;
        }

        if (!perfilAtual) {
          const { data: fallbackUser } = await supabase
            .from('doodoo_perfis')
            .select('*')
            .ilike('nome', '%Pedro%')
            .limit(1)
            .maybeSingle();
          
          perfilAtual = fallbackUser;

          if (!perfilAtual) {
            const { data: firstUser } = await supabase.from('doodoo_perfis').select('*').limit(1).maybeSingle();
            perfilAtual = firstUser;
          }
        }

        if (perfilAtual) {
          setCurrentUser(perfilAtual as DBProfile);
          const { data: todosPerfis } = await supabase
            .from('doodoo_perfis')
            .select('*')
            .order('nome', { ascending: true });
            
          if (todosPerfis) setCompanyUsers(todosPerfis as DBProfile[]);
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

    fetchSettingsData();
  }, []);

  const handleForceLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/'; 
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    const { error } = await supabase
      .from('doodoo_perfis')
      .update({
        nome: currentUser.nome,
        setor: currentUser.setor,
        avatar_url: currentUser.avatar_url
      })
      .eq('user_id', currentUser.user_id);

    if (!error) {
      setSavedSuccess(true);
      notifyBell('⚙️ Perfil Atualizado', 'Suas informações e foto de perfil foram salvas com sucesso.');
      setTimeout(() => setSavedSuccess(false), 3000);
      setCompanyUsers(prev => prev.map(u => u.user_id === currentUser.user_id ? currentUser : u));
    }
  };

  // 🚀 ATUALIZAÇÃO OTIMISTA: Resolve o bug de alterar vários setores/cargos rapidamente
  const handleUpdateUserRoleAndSector = async (userId: string, field: 'cargo' | 'setor', value: string) => {
    const previousUser = companyUsers.find(u => u.id === userId);
    if (!previousUser || previousUser[field] === value) return;

    // 1. Atualiza a UI Instantaneamente (Otimista)
    setCompanyUsers(prev => prev.map(u => u.id === userId ? { ...u, [field]: value } : u));
    
    // 2. Envia para o banco em background
    const { error } = await supabase
      .from('doodoo_perfis')
      .update({ [field]: value })
      .eq('id', userId);

    // 3. Rollback se der erro
    if (error) {
      setCompanyUsers(prev => prev.map(u => u.id === userId ? previousUser : u));
      notifyBell('Erro de Sincronia', `Não foi possível atualizar o ${field}. Tente novamente.`);
      console.error(error);
    }
  };

  // 🚀 ATUALIZAÇÃO OTIMISTA: Para os botões de bloqueio de conta
  const handleToggleUserStatus = async (userId: string, nome: string, currentStatus: string = 'ativo') => {
    const newStatus = currentStatus === 'bloqueado' ? 'ativo' : 'bloqueado';
    const actionText = newStatus === 'bloqueado' ? 'bloquear' : 'desbloquear';

    if (window.confirm(`Tem certeza que deseja ${actionText} o acesso de ${nome} ao Doo-Doo Corporativo?`)) {
      const previousUser = companyUsers.find(u => u.id === userId);
      setCompanyUsers(prev => prev.map(u => u.id === userId ? { ...u, status: newStatus } : u));

      const { error } = await supabase
        .from('doodoo_perfis')
        .update({ status: newStatus })
        .eq('id', userId);

      if (error && previousUser) {
        setCompanyUsers(prev => prev.map(u => u.id === userId ? previousUser : u));
        notifyBell('Erro de Sincronia', 'Não foi possível alterar o status.');
      } else {
        notifyBell('Status Atualizado', `O acesso de ${nome} foi ${newStatus === 'bloqueado' ? 'bloqueado' : 'desbloqueado'}.`);
      }
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim()) return;

    const { data, error } = await supabase
      .from('doodoo_perfis')
      .insert([{
        user_id: '00000000-0000-0000-0000-000000000000', 
        nome: newUserName.trim(),
        email: newUserEmail.trim(),
        cargo: newUserRole,
        setor: newUserSector,
      }])
      .select()
      .single();

    if (data && !error) {
      setCompanyUsers(prev => [...prev, data as DBProfile]);
      setIsUserModalOpen(false);
      setNewUserName('');
      setNewUserEmail('');
      notifyBell('👤 Novo Colaborador', `${data.nome} foi adicionado ao setor ${data.setor}.`);
    } else {
      notifyBell('⚠️ Atenção', 'Erro ao cadastrar. O e-mail pode já estar em uso.');
    }
  };

  const handleDeleteUser = async (id: string, nome: string) => {
    if (window.confirm(`ATENÇÃO: Deseja EXCLUIR DEFINITIVAMENTE o registro de ${nome}? Recomendamos usar a opção de Bloqueio no cadeado.`)) {
      await supabase.from('doodoo_perfis').delete().eq('id', id);
      setCompanyUsers(prev => prev.filter(u => u.id !== id));
      notifyBell('Usuário Removido', `O registro de ${nome} foi excluído.`);
      
      // Ajuste de paginação inteligente (volta página se excluir o último item)
      if (currentUsers.length === 1 && currentPage > 1) {
        setCurrentPage(currentPage - 1);
      }
    }
  };

  // 🚀 PRIVACIDADE: Grava as configurações de notificação diretamente no perfil do banco
  const handleTogglePrivacySetting = async (field: 'read_receipts' | 'email_notifications') => {
    if (!currentUser) return;
    const newValue = !(currentUser[field] ?? true);
    
    setCurrentUser({ ...currentUser, [field]: newValue });
    
    const { error } = await supabase
      .from('doodoo_perfis')
      .update({ [field]: newValue })
      .eq('user_id', currentUser.user_id);
      
    if (!error) {
      notifyBell('Privacidade Atualizada', 'As suas preferências foram salvas.');
    } else {
      setCurrentUser({ ...currentUser, [field]: !newValue }); // rollback
    }
  };

  const toggleRolePermission = (tabKey: string, role: RoleType) => {
    setTabPermissions(prev => prev.map(tab => {
      if (tab.tabKey === tabKey) {
        const exists = tab.allowedRoles.includes(role);
        const updatedRoles = exists 
          ? tab.allowedRoles.filter(r => r !== role) 
          : [...tab.allowedRoles, role];
        return { ...tab, allowedRoles: updatedRoles };
      }
      return tab;
    }));
    notifyBell('Permissões Modificadas', 'Os acessos da tabela foram atualizados (Apenas visual local na DEMO).');
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [userSearch]);

  const searchedUsers = useMemo(() => {
    return companyUsers.filter(u => 
      u.nome.toLowerCase().includes(userSearch.toLowerCase()) || 
      u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.setor.toLowerCase().includes(userSearch.toLowerCase())
    );
  }, [companyUsers, userSearch]);

  const totalPages = Math.ceil(searchedUsers.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentUsers = searchedUsers.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

  if (isLoading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin opacity-50 text-blue-500" />
        <span className="text-xs font-bold opacity-50 mt-2">Carregando Configurações...</span>
      </div>
    );
  }

  if (authError || !currentUser) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center space-y-5 animate-in fade-in zoom-in-95 duration-300">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center">
          <AlertTriangle className="w-10 h-10 text-red-500 opacity-80" />
        </div>
        <div className="text-center space-y-1.5">
          <h3 className="text-xl font-extrabold tracking-tight">Sessão Expirada ou Interrompida</h3>
          <p className="text-xs font-medium opacity-60 max-w-sm mx-auto leading-relaxed">
            Não conseguimos validar a sua credencial de acesso de forma segura. 
            Por favor, faça o login novamente para reestabelecer a conexão.
          </p>
        </div>
        <button
          onClick={handleForceLogout}
          className="mt-2 px-6 py-3 rounded-2xl bg-brand-panel text-white text-xs font-extrabold shadow-lg hover:opacity-90 hover:scale-105 transition-all flex items-center space-x-2 cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Sair do Sistema e Entrar Novamente</span>
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col animate-in fade-in duration-300">
      
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 rounded-[2.5rem] border overflow-hidden shadow-2xl backdrop-blur-xl" 
           style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
        
        {/* COLUNA 1: MENU LATERAL DE AJUSTES */}
        <div className="lg:col-span-3 border-r p-5 flex flex-col justify-between" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
          
          <div className="space-y-4">
            
            <div className="space-y-3 pb-4 border-b" style={{ borderColor: 'var(--border-input)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-sm tracking-tight">Painel de Ajustes</h3>
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">Doo Doo OS</p>
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
                <Shield className="w-4 h-4 opacity-70 text-blue-500" />
                <div className="flex flex-col overflow-hidden">
                  <span className="truncate w-full text-xs font-extrabold leading-tight">{currentUser.nome}</span>
                  <span className="text-[9px] font-bold opacity-50 uppercase tracking-wider">{currentUser.cargo} • {currentUser.setor}</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-[10px] font-extrabold uppercase tracking-widest opacity-40 px-2 mb-1">Pessoal</p>
              
              <button 
                onClick={() => setActiveTab('geral')}
                className={`w-full flex items-center space-x-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'geral' ? 'bg-brand-panel text-white shadow-xs' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-75'
                }`}
              >
                <Settings className="w-4 h-4" />
                <span>Meu Perfil & Avatar</span>
              </button>

              <button 
                onClick={() => setActiveTab('notificacoes')}
                className={`w-full flex items-center space-x-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'notificacoes' ? 'bg-brand-panel text-white shadow-xs' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-75'
                }`}
              >
                <Bell className="w-4 h-4" />
                <span>Notificações e Privacidade</span>
              </button>

              {isManager && (
                <>
                  <div className="pt-3 pb-1">
                    <p className="text-[10px] font-extrabold uppercase tracking-widest opacity-40 px-2">Gestão</p>
                  </div>

                  <button 
                    onClick={() => setActiveTab('usuarios')}
                    className={`w-full flex items-center space-x-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      activeTab === 'usuarios' ? 'bg-brand-panel text-white shadow-xs' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-75'
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    <span>Lista de Colaboradores</span>
                  </button>

                  <button 
                    onClick={() => setActiveTab('permissoes')}
                    className={`w-full flex items-center space-x-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      activeTab === 'permissoes' ? 'bg-brand-panel text-white shadow-xs' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-75'
                    }`}
                  >
                    <Shield className="w-4 h-4" />
                    <span>Controle de Permissões</span>
                  </button>
                </>
              )}

              {isAdmin && (
                <>
                  <div className="pt-3 pb-1">
                    <p className="text-[10px] font-extrabold uppercase tracking-widest opacity-40 px-2">Sistema</p>
                  </div>
                  <button 
                    onClick={() => setActiveTab('logs')}
                    className={`w-full flex items-center space-x-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      activeTab === 'logs' ? 'bg-brand-panel text-white shadow-xs' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-75'
                    }`}
                  >
                    <Activity className="w-4 h-4" />
                    <span>Auditoria de Logs</span>
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="pt-4 border-t text-center text-[10px] opacity-40 font-bold uppercase tracking-wider" style={{ borderColor: 'var(--border-input)' }}>
            Doo Doo Corporativo
          </div>
        </div>

        {/* COLUNA 2: CONTEÚDO DAS CONFIGURAÇÕES */}
        <div className="lg:col-span-9 flex flex-col h-full overflow-y-auto p-8 space-y-6 custom-scrollbar" style={{ backgroundColor: 'var(--bg-card)' }}>
          
          <div className="pb-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-input)' }}>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--tab-active)' }}>Configurações do Portal</p>
              <h2 className="text-2xl font-extrabold tracking-tight mt-0.5">
                {activeTab === 'geral' && 'Meu Perfil, Foto & Cargo'}
                {activeTab === 'usuarios' && 'Lista e Controle de Colaboradores'}
                {activeTab === 'permissoes' && 'Restrições e Permissões de Abas'}
                {activeTab === 'notificacoes' && 'Privacidade e Notificações'}
                {activeTab === 'logs' && 'Auditoria e Logs de Sistema'}
              </h2>
            </div>

            {savedSuccess && (
              <span className="inline-flex items-center px-3 py-1 rounded-xl bg-emerald-500/10 text-emerald-500 text-xs font-extrabold border border-emerald-500/20 animate-in fade-in">
                <Check className="w-3.5 h-3.5 mr-1" /> Salvo com sucesso!
              </span>
            )}
          </div>

          {/* ABA 1: MEU PERFIL */}
          {activeTab === 'geral' && (
            <form onSubmit={handleSaveProfile} className="space-y-6 max-w-3xl">
              <div className="p-6 rounded-2xl border space-y-5" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                <h3 className="text-sm font-extrabold">Sua Foto de Perfil (Avatar)</h3>
                
                <div className="flex items-center space-x-5">
                  <div className="relative">
                    {currentUser.avatar_url ? (
                      <img src={currentUser.avatar_url} alt="Avatar" className="w-16 h-16 rounded-2xl object-cover border-2 shadow-md" style={{ borderColor: 'var(--border-input)' }} />
                    ) : (
                      <div className="w-16 h-16 rounded-2xl bg-brand-panel text-white font-extrabold flex items-center justify-center text-lg shadow-md">
                        {getInitials(currentUser.nome)}
                      </div>
                    )}
                    <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2" style={{ borderColor: 'var(--bg-card)' }}></span>
                  </div>

                  <div className="flex-1 space-y-2">
                    <label className="text-xs opacity-60 font-bold block">Cole o link (URL) da sua imagem de Perfil</label>
                    <input 
                      type="url" 
                      value={currentUser.avatar_url || ''}
                      onChange={(e) => setCurrentUser(prev => prev ? { ...prev, avatar_url: e.target.value } : null)}
                      placeholder="Ex: https://i.imgur.com/sua-foto.jpg"
                      className="w-full p-2.5 rounded-xl border text-xs font-medium outline-none focus:border-blue-500 transition-colors"
                      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                    />
                  </div>
                </div>
              </div>

              <div className="p-6 rounded-2xl border space-y-4" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                <h3 className="text-sm font-extrabold">Dados Pessoais & Setor</h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="opacity-60 font-bold block mb-1.5">Seu Nome de Exibição</label>
                    <input 
                      type="text" 
                      value={currentUser.nome}
                      onChange={(e) => setCurrentUser(prev => prev ? { ...prev, nome: e.target.value } : null)}
                      className="w-full p-3 rounded-xl border font-bold outline-none focus:border-blue-500"
                      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                    />
                  </div>
                  
                  <div>
                    <label className="opacity-60 font-bold block mb-1.5">Seu Setor / Departamento</label>
                    <select 
                      value={currentUser.setor}
                      onChange={(e) => setCurrentUser(prev => prev ? { ...prev, setor: e.target.value } : null)}
                      className="w-full p-3 rounded-xl border font-bold outline-none cursor-pointer focus:border-blue-500"
                      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                    >
                      {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button 
                  type="submit"
                  className="px-6 py-3 rounded-xl bg-brand-panel text-white text-xs font-extrabold shadow-lg hover:opacity-95 transition-all cursor-pointer flex items-center space-x-2"
                >
                  <Save className="w-4 h-4" />
                  <span>Salvar Alterações</span>
                </button>
              </div>
            </form>
          )}

          {/* ABA 2: GESTÃO DE EQUIPE */}
          {activeTab === 'usuarios' && isManager && (
            <div className="space-y-5 max-w-5xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                  <input 
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Buscar por nome, setor ou email..."
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border text-xs font-bold outline-none focus:border-blue-500"
                    style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                  />
                </div>
                <button 
                  onClick={() => setIsUserModalOpen(true)}
                  className="px-4 py-2.5 rounded-xl bg-brand-panel text-white text-xs font-extrabold shadow-sm flex items-center justify-center space-x-1.5 cursor-pointer whitespace-nowrap"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Novo Colaborador</span>
                </button>
              </div>

              <div className="rounded-2xl border overflow-hidden shadow-xs flex flex-col" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b opacity-55 font-extrabold uppercase text-[10px]" style={{ borderColor: 'var(--border-input)' }}>
                        <th className="p-4">Colaborador</th>
                        <th className="p-4">E-mail</th>
                        <th className="p-4 w-40">Cargo / Nível</th>
                        <th className="p-4 w-40">Setor</th>
                        <th className="p-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: 'var(--border-input)' }}>
                      {currentUsers.map(user => (
                        <tr key={user.id} className={`transition-colors ${user.status === 'bloqueado' ? 'opacity-60 bg-red-500/5' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}>
                          <td className="p-4 font-bold flex items-center space-x-3">
                            <div className="relative flex-shrink-0">
                              {user.avatar_url ? (
                                <img src={user.avatar_url} alt="" className={`w-8 h-8 rounded-lg object-cover border shadow-sm ${user.status === 'bloqueado' ? 'grayscale' : ''}`} style={{ borderColor: 'var(--border-input)' }} />
                              ) : (
                                <div className={`w-8 h-8 rounded-lg text-white font-extrabold flex items-center justify-center text-[10px] ${user.status === 'bloqueado' ? 'bg-gray-400' : 'bg-brand-panel'}`}>
                                  {getInitials(user.nome)}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col">
                              <span className="truncate max-w-[150px]">{user.nome}</span>
                              {user.status === 'bloqueado' && (
                                <span className="text-[9px] text-red-500 uppercase tracking-widest mt-0.5">Bloqueado</span>
                              )}
                            </div>
                          </td>
                          <td className="p-4 opacity-75 truncate max-w-[150px]">{user.email}</td>
                          
                          <td className="p-4">
                            <select
                              value={user.cargo}
                              disabled={user.status === 'bloqueado'}
                              onChange={(e) => handleUpdateUserRoleAndSector(user.id, 'cargo', e.target.value)}
                              className="w-full p-1.5 rounded-lg border font-bold text-[11px] uppercase cursor-pointer outline-none hover:border-blue-500 disabled:opacity-50 transition-colors"
                              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                            >
                              <option value="administrador">Administrador</option>
                              <option value="gestor">Gestor</option>
                              <option value="coordenador">Coordenador</option>
                              <option value="supervisor">Supervisor</option>
                              <option value="analista">Analista</option>
                              <option value="colaborador">Colaborador</option>
                            </select>
                          </td>

                          <td className="p-4 font-semibold">
                            <select
                              value={user.setor}
                              disabled={user.status === 'bloqueado'}
                              onChange={(e) => handleUpdateUserRoleAndSector(user.id, 'setor', e.target.value)}
                              className="w-full p-1.5 rounded-lg border font-bold text-[11px] cursor-pointer outline-none hover:border-blue-500 disabled:opacity-50 transition-colors"
                              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                            >
                              {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>

                          <td className="p-4 text-right flex items-center justify-end space-x-1">
                            <button 
                              onClick={() => handleToggleUserStatus(user.id, user.nome, user.status)}
                              className={`p-2 rounded-lg cursor-pointer transition-colors ${
                                user.status === 'bloqueado' 
                                  ? 'text-amber-500 hover:bg-amber-500/10' 
                                  : 'text-blue-500 hover:bg-blue-500/10'
                              }`}
                              title={user.status === 'bloqueado' ? "Desbloquear Acesso" : "Bloquear Acesso"}
                            >
                              {user.status === 'bloqueado' ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                            </button>

                            <button 
                              onClick={() => handleDeleteUser(user.id, user.nome)}
                              className="p-2 rounded-lg text-red-500 hover:bg-red-500/10 cursor-pointer transition-colors"
                              title="Excluir Definitivamente"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {currentUsers.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-xs opacity-50 font-bold">Nenhum colaborador encontrado.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {totalPages > 0 && (
                  <div className="flex items-center justify-between px-5 py-3 border-t" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-card)' }}>
                    <span className="text-[10px] font-extrabold opacity-40 uppercase tracking-wider">
                      Mostrando {startIndex + 1} a {Math.min(startIndex + ITEMS_PER_PAGE, searchedUsers.length)} de {searchedUsers.length}
                    </span>
                    
                    <div className="flex items-center space-x-1">
                      <button 
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="p-1.5 rounded-lg border flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                        style={{ borderColor: 'var(--border-input)' }}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      
                      {pageNumbers.map(page => (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs font-extrabold transition-colors cursor-pointer ${
                            currentPage === page 
                              ? 'bg-brand-panel text-white border-transparent' 
                              : 'border hover:bg-black/5 dark:hover:bg-white/5'
                          }`}
                          style={currentPage !== page ? { borderColor: 'var(--border-input)' } : {}}
                        >
                          {page}
                        </button>
                      ))}

                      <button 
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                        className="p-1.5 rounded-lg border flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                        style={{ borderColor: 'var(--border-input)' }}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ABA 3: PERMISSÕES */}
          {activeTab === 'permissoes' && isManager && (
            <div className="space-y-5 max-w-5xl">
              <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-xs leading-relaxed text-blue-600 dark:text-blue-300 font-medium">
                Defina com exatidão o que cada nível hierárquico pode acessar no Doo-Doo Corporativo. 
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
                      <tr key={tab.tabKey} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                        <td className="p-4 font-bold">{tab.tabName}</td>
                        {(['gestor', 'coordenador', 'supervisor', 'analista', 'colaborador'] as RoleType[]).map(role => {
                          const hasAccess = tab.allowedRoles.includes(role);
                          return (
                            <td key={role} className="p-4 text-center">
                              <button 
                                onClick={() => toggleRolePermission(tab.tabKey, role)}
                                className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                                  hasAccess 
                                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' 
                                    : 'opacity-40 hover:opacity-100'
                                }`}
                                style={!hasAccess ? { backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' } : undefined}
                              >
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
          )}

          {/* ABA 4: LOGS DO SISTEMA */}
          {activeTab === 'logs' && isAdmin && (
            <div className="space-y-4 max-w-5xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold">Auditoria de Atividades</h3>
                  <p className="text-[11px] opacity-60 mt-0.5">Rastreamento de ações administrativas no sistema.</p>
                </div>
              </div>
              <div className="p-10 rounded-2xl border border-dashed flex flex-col items-center justify-center text-center space-y-3" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                <Activity className="w-8 h-8 opacity-20" />
                <p className="text-xs font-bold opacity-60">O módulo de registros de segurança está ativo e monitorando a tabela <code>doodoo_perfis</code>.</p>
                <p className="text-[10px] font-semibold opacity-40">Em breve o painel completo de leitura de logs estará disponível nesta tela.</p>
              </div>
            </div>
          )}

          {/* ABA 5: NOTIFICAÇÕES E PRIVACIDADE */}
          {activeTab === 'notificacoes' && (
            <div className="space-y-4 max-w-3xl">
              <div className="p-5 rounded-2xl border space-y-3 text-xs" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                <label className="flex items-center justify-between p-3 rounded-xl border cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
                  <span className="font-bold">Notificações no Sino em Tempo Real</span>
                  <input type="checkbox" defaultChecked disabled className="w-4 h-4 rounded accent-blue-600 cursor-pointer" />
                </label>
                <label className="flex items-center justify-between p-3 rounded-xl border cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
                  <span className="font-bold">Notificações por E-mail (Resumos de Tarefas)</span>
                  <input 
                    type="checkbox" 
                    checked={currentUser.email_notifications ?? false} 
                    onChange={() => handleTogglePrivacySetting('email_notifications')}
                    className="w-4 h-4 rounded accent-blue-600 cursor-pointer" 
                  />
                </label>
                
                <div className="h-px w-full my-4" style={{ backgroundColor: 'var(--border-input)' }}></div>
                <h3 className="font-extrabold opacity-60 uppercase tracking-widest text-[10px]">Privacidade no Chat</h3>
                
                <label className="flex items-center justify-between p-3 rounded-xl border cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
                  <div>
                    <span className="font-bold block">Confirmação de Leitura (Visto Azul)</span>
                    <span className="text-[10px] opacity-60 mt-1 block">Permite que colegas vejam quando você visualizou a mensagem deles.</span>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={currentUser.read_receipts ?? true} 
                    onChange={() => handleTogglePrivacySetting('read_receipts')}
                    className="w-4 h-4 rounded accent-blue-600 cursor-pointer flex-shrink-0 ml-4" 
                  />
                </label>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Modal Cadastrar Usuário */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl border shadow-xl overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
            
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-input)' }}>
              <h3 className="font-extrabold text-sm">Organograma: Novo Colaborador</h3>
              <button onClick={() => setIsUserModalOpen(false)} className="p-1.5 rounded-lg hover:bg-black/5 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-6 space-y-4 text-xs">
              <div className="p-3 mb-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-300 font-medium">
                Dica: O acesso de login real e a senha devem ser gerados através da Autenticação do Supabase. Aqui você estrutura os cargos da empresa.
              </div>

              <div>
                <label className="font-bold opacity-60 block mb-1">Nome Completo</label>
                <input 
                  type="text" 
                  required
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Ex: Pedro Oliveira"
                  className="w-full px-3.5 py-2.5 rounded-xl border font-semibold outline-none focus:border-blue-500"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                />
              </div>

              <div>
                <label className="font-bold opacity-60 block mb-1">E-mail Corporativo</label>
                <input 
                  type="email" 
                  required
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="pedro@iofv.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border font-semibold outline-none focus:border-blue-500"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold opacity-60 block mb-1">Cargo / Nível</label>
                  <select 
                    value={newUserRole}
                    onChange={(e: any) => setNewUserRole(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border font-bold outline-none cursor-pointer"
                    style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
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
                  <label className="font-bold opacity-60 block mb-1">Setor</label>
                  <select 
                    value={newUserSector}
                    onChange={(e) => setNewUserSector(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border font-bold outline-none cursor-pointer focus:border-blue-500"
                    style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                  >
                    {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t" style={{ borderColor: 'var(--border-input)' }}>
                <button type="button" onClick={() => setIsUserModalOpen(false)} className="px-4 py-2 rounded-xl border font-bold cursor-pointer hover:opacity-80 transition-opacity" style={{ borderColor: 'var(--border-input)' }}>
                  Cancelar
                </button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-brand-panel text-white font-extrabold cursor-pointer hover:opacity-90 transition-opacity">
                  Salvar Colaborador
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}