'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { 
  StickyNote, Plus, Trash2, Search, Palette, Shield, 
  X, Folder, FolderOpen, ChevronRight, FolderPlus, Loader2, AlertTriangle 
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
// 🚀 1. LIGADO AO CÉREBRO GLOBAL DO TEMA
import { useTheme } from '../../contexts/ThemeContext';

interface NoteItem {
  id: string;
  title: string;
  content: string;
  folder: string;
  updated_at: string;
}

export default function AnotacoesPage() {
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

  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('Carregando...');
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 🚀 Variável de Referência para Debounce de gravação
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const folders = useMemo(() => {
    const uniqueFolders = Array.from(new Set(notes.map(n => n.folder || 'Geral')));
    if (!uniqueFolders.includes('Geral')) uniqueFolders.unshift('Geral');
    return uniqueFolders;
  }, [notes]);

  const [selectedFolder, setSelectedFolder] = useState<string>('Todas');
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newNoteFolder, setNewNoteFolder] = useState('Geral');

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  useEffect(() => {
    const fetchUserAndNotes = async () => {
      setIsLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        setUserId(session.user.id);
        
        const { data: perfil } = await supabase
          .from('doodoo_perfis')
          .select('nome')
          .eq('user_id', session.user.id)
          .single();

        if (perfil) setUserName(perfil.nome);

        const { data: notasData } = await supabase
          .from('doodoo_notas')
          .select('*')
          .eq('usuario_id', session.user.id)
          .order('updated_at', { ascending: false });
        
        if (notasData) {
          setNotes(notasData as NoteItem[]);
          if (notasData.length > 0) setSelectedNoteId(notasData[0].id);
        }
      }
      setIsLoading(false);
    };

    fetchUserAndNotes();
  }, []);

  const notifyBell = (title: string, desc: string) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('doodoo:notify', { detail: { title, desc } }));
    }
  };

  const handleDirectCreateNote = async (title: string, content: string, folder: string) => {
    if (!userId || !title.trim()) return;
    
    const { data, error } = await supabase
      .from('doodoo_notas')
      .insert([{ 
        usuario_id: userId,
        titulo: title.trim(),
        conteudo: content.trim() || '',
        cor: folder 
      }])
      .select()
      .single();

    if (data && !error) {
      const novaNota = { ...data, title: data.titulo, content: data.conteudo, folder: data.cor };
      setNotes(prev => [novaNota, ...prev]);
      setSelectedNoteId(novaNota.id);
    }
  };

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    const name = newFolderName.trim();
    handleDirectCreateNote(`Nova nota em ${name}`, '', name);
    setNewFolderName('');
    setIsFolderModalOpen(false);
    notifyBell('Nova Pasta', `O caderno "${name}" foi adicionado.`);
  };

  const confirmDeleteFolder = (folderName: string) => {
    if (folderName === 'Geral') return;
      
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Pasta Inteira',
      message: `Tem certeza que deseja excluir permanentemente o caderno "${folderName}" e todas as anotações que estão dentro dele? Esta ação pode ser desfeita.`,
      onConfirm: async () => {
        await supabase.from('doodoo_notas').delete().eq('cor', folderName).eq('usuario_id', userId);
        setNotes(prev => prev.filter(n => n.folder !== folderName));
        if (selectedFolder === folderName) setSelectedFolder('Todas');
        notifyBell('Pasta Excluída', `O caderno "${folderName}" foi removido.`);
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleCreateNote = (e: React.FormEvent) => {
    e.preventDefault();
    handleDirectCreateNote(newTitle, newContent, newNoteFolder);
    setIsNoteModalOpen(false);
    setNewTitle('');
    setNewContent('');
    notifyBell('Nova Anotação', `A nota "${newTitle}" foi criada.`);
  };

  const confirmDeleteNote = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Anotação',
      message: 'Tem certeza que deseja excluir esta anotação? Ela será removida permanentemente do sistema.',
      onConfirm: async () => {
        await supabase.from('doodoo_notas').delete().eq('id', id);
        setNotes(prev => prev.filter(n => n.id !== id));
        setSelectedNoteId(null);
        notifyBell('Nota Excluída', 'A anotação foi removida com sucesso.');
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  // 🚀 2. DEBOUNCE NA ATUALIZAÇÃO (Evita travar o servidor a cada letra digitada)
  const handleUpdateNote = (id: string, updates: Partial<NoteItem>) => {
    // 1. Atualiza a UI Instantaneamente
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
    
    // 2. Prepara os dados para o Supabase
    const dbUpdates: any = { updated_at: new Date().toISOString() };
    if (updates.title !== undefined) dbUpdates.titulo = updates.title;
    if (updates.content !== undefined) dbUpdates.conteudo = updates.content;
    if (updates.folder !== undefined) dbUpdates.cor = updates.folder;

    // 3. Cancela a gravação anterior se o utilizador ainda está a escrever
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // 4. Só envia para o banco 1 segundo depois de parar de escrever
    typingTimeoutRef.current = setTimeout(async () => {
      await supabase.from('doodoo_notas').update(dbUpdates).eq('id', id);
    }, 1000);
  };

  const filteredNotes = useMemo(() => {
    return notes.filter(n => {
      if (selectedFolder !== 'Todas' && n.folder !== selectedFolder) return false;
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        return (n.title || '').toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [notes, selectedFolder, searchQuery]);

  const selectedNote = useMemo(() => {
    return notes.find(n => n.id === selectedNoteId) || null;
  }, [notes, selectedNoteId]);

  const formatTime = (dateStr: string) => {
    if (!isMounted) return '';
    const d = new Date(dateStr);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute:'2-digit' });
  };

  if (isLoading || !isMounted) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin opacity-50 text-blue-500" />
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col animate-in fade-in duration-300">
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 rounded-[2.5rem] border overflow-hidden shadow-2xl backdrop-blur-xl" 
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
        
        {/* COLUNA 1: PASTAS / CADERNOS CRIADOS PELO USUÁRIO */}
        <div className="lg:col-span-3 border-r p-5 flex flex-col justify-between" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
          <div className="space-y-4">
            
            <div className="space-y-3 pb-4 border-b" style={{ borderColor: 'var(--border-input)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-sm tracking-tight">Anotações Doo Doo</h3>
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">Privado</p>
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

              <div className="flex items-center space-x-1.5 px-3 py-2 rounded-xl border text-xs font-bold" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
                <Shield className="w-3.5 h-3.5 opacity-50 text-blue-500" />
                <span className="truncate w-full text-xs font-extrabold">{userName}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-2 mb-1">
                <p className="text-[10px] font-extrabold uppercase tracking-widest opacity-40">Meus Cadernos</p>
                <button 
                  onClick={() => setIsFolderModalOpen(true)}
                  className="text-[10px] font-extrabold text-blue-500 hover:underline flex items-center space-x-1 cursor-pointer"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>Nova Pasta</span>
                </button>
              </div>
              
              <button 
                onClick={() => setSelectedFolder('Todas')}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  selectedFolder === 'Todas' ? 'bg-brand-panel text-white shadow-xs' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-75'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <Folder className="w-4 h-4" />
                  <span>Todas as Notas</span>
                </div>
                <span className="text-[11px] font-extrabold">{notes.length}</span>
              </button>

              {folders.filter(f => f !== 'Todas').map(folder => (
                <div key={folder} className="group relative flex items-center justify-between w-full">
                  <button 
                    onClick={() => setSelectedFolder(folder)}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      selectedFolder === folder ? 'bg-brand-panel text-white shadow-xs' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-75'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      {/* 🚀 MELHORIA VISUAL (Pasta Aberta/Fechada) */}
                      {selectedFolder === folder ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
                      <span className="truncate max-w-[120px] text-left">{folder}</span>
                    </div>
                    <span className="text-[11px] font-extrabold pr-6">{notes.filter(n => n.folder === folder).length}</span>
                  </button>

                  {folder !== 'Geral' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); confirmDeleteFolder(folder); }}
                      className={`absolute right-2 p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-all cursor-pointer ${
                        selectedFolder === folder ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                      title="Excluir Pasta e todas as suas notas"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t text-center text-[10px] opacity-40 font-bold uppercase tracking-wider" style={{ borderColor: 'var(--border-input)' }}>
            Notas Pessoais • Supabase Integrado
          </div>
        </div>

        {/* COLUNA 2: LISTA CENTRAL DE NOTAS */}
        <div className={`${selectedNote ? 'lg:col-span-5 border-r' : 'lg:col-span-9'} flex flex-col h-full overflow-hidden`} style={{ borderColor: 'var(--border-input)' }}>
          <div className="p-4 border-b flex items-center justify-between gap-3" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-card)' }}>
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-40" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pesquisar nas anotações..."
                className="w-full pl-9 pr-4 py-2 rounded-xl border text-xs font-medium outline-none focus:border-blue-500 transition-colors"
                style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
              />
            </div>
            <button 
              onClick={() => {
                setNewTitle('');
                setNewContent('');
                setNewNoteFolder(folders[0] || 'Geral');
                setIsNoteModalOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-brand-panel text-white text-xs font-extrabold shadow-sm hover:opacity-95 transition-all flex items-center space-x-1.5 cursor-pointer flex-shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Nota</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar" style={{ backgroundColor: 'var(--bg-input)' }}>
            {filteredNotes.map(note => {
              const isSelected = selectedNote?.id === note.id;

              return (
                <div 
                  key={note.id}
                  onClick={() => setSelectedNoteId(note.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected ? 'ring-2 ring-blue-500/40 shadow-xs' : 'hover:opacity-90'
                  }`}
                  style={{ 
                    backgroundColor: isSelected ? 'var(--bg-input)' : 'var(--bg-card)', 
                    borderColor: 'var(--border-input)' 
                  }}
                >
                  <div className="overflow-hidden w-full">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-500 truncate max-w-[120px]">
                        {note.folder}
                      </span>
                      <span className="text-[10px] opacity-40 font-semibold">{formatTime(note.updated_at)}</span>
                    </div>
                    <p className="text-xs font-bold leading-snug truncate">
                      {note.title || 'Sem título'}
                    </p>
                    
                    <p className="text-[11px] opacity-60 truncate mt-1">
                      {note.content || 'Sem conteúdo.'}
                    </p>
                  </div>

                  <ChevronRight className="w-4 h-4 opacity-30 flex-shrink-0" />
                </div>
              );
            })}

            {filteredNotes.length === 0 && (
              <div className="h-60 flex flex-col items-center justify-center text-center opacity-40 space-y-2">
                <StickyNote className="w-8 h-8 stroke-1" />
                <p className="text-xs font-semibold">Nenhuma anotação encontrada.</p>
              </div>
            )}
          </div>
        </div>

        {/* COLUNA 3: PAINEL DE LEITURA & EDIÇÃO (ESTILO NOTION) */}
        {selectedNote && (
          <div className="lg:col-span-4 flex flex-col h-full overflow-hidden" style={{ backgroundColor: 'var(--bg-card)' }}>
            
            <div className="p-5 border-b flex items-start justify-between gap-3" style={{ borderColor: 'var(--border-input)' }}>
              <div className="w-full pr-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-45">
                    Atualizado {formatTime(selectedNote.updated_at)}
                  </span>
                  
                  <select 
                    value={selectedNote.folder}
                    onChange={(e) => handleUpdateNote(selectedNote.id, { folder: e.target.value })}
                    className="text-[10px] font-extrabold px-2 py-1 rounded-lg border outline-none cursor-pointer focus:border-blue-500 transition-colors"
                    style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                  >
                    {folders.map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
                <input 
                  type="text"
                  value={selectedNote.title}
                  onChange={(e) => handleUpdateNote(selectedNote.id, { title: e.target.value })}
                  placeholder="Título da anotação..."
                  className="text-lg font-extrabold leading-snug mt-1 p-1 bg-transparent border-b border-transparent hover:border-black/10 dark:hover:border-white/10 focus:border-blue-500 outline-none w-full transition-colors"
                  style={{ color: 'var(--text-main)' }}
                />
              </div>
              <button 
                onClick={() => setSelectedNoteId(null)} 
                className="p-1.5 rounded-xl hover:bg-black/5 opacity-50 hover:opacity-100 cursor-pointer flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar flex flex-col">
              {/* 🚀 BUG CORRIGIDO: Fallback para conteúdo nulo */}
              <textarea 
                value={selectedNote.content || ''}
                onChange={(e) => handleUpdateNote(selectedNote.id, { content: e.target.value })}
                placeholder="Escreva sua anotação aqui..."
                className="w-full flex-1 p-4 rounded-2xl text-xs leading-relaxed outline-none resize-none border focus:border-blue-500 transition-colors"
                style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)', minHeight: '280px' }}
              />
            </div>

            <div className="p-4 border-t flex items-center justify-between text-xs" style={{ borderColor: 'var(--border-input)' }}>
              <span className="opacity-45 text-[11px] font-bold">Autor: {userName}</span>
              
              <button 
                onClick={() => confirmDeleteNote(selectedNote.id)}
                className="text-red-500 hover:underline font-semibold flex items-center space-x-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir nota</span>
              </button>
            </div>

          </div>
        )}

      </div>

      {/* ==========================================================
          MODAL 1: CRIAR NOVA PASTA 
          ========================================================== */}
      {isFolderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl border shadow-xl overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-input)' }}>
              <h3 className="font-extrabold text-sm">Criar Nova Pasta / Caderno</h3>
              <button onClick={() => setIsFolderModalOpen(false)} className="p-1.5 rounded-lg hover:bg-black/5 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateFolder} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold opacity-60 block mb-1">Nome da Pasta</label>
                <input 
                  type="text" 
                  required
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Ex: Senhas, Ideias, Pessoal..."
                  className="w-full px-3.5 py-2.5 rounded-xl border text-xs font-semibold outline-none focus:border-blue-500"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t" style={{ borderColor: 'var(--border-input)' }}>
                <button type="button" onClick={() => setIsFolderModalOpen(false)} className="px-4 py-2 rounded-xl border text-xs font-bold cursor-pointer" style={{ borderColor: 'var(--border-input)' }}>
                  Cancelar
                </button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-brand-panel text-white text-xs font-bold cursor-pointer hover:opacity-90">
                  Criar Pasta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================================
          MODAL 2: NOVA NOTA 
          ========================================================== */}
      {isNoteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-3xl border shadow-xl overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-input)' }}>
              <h3 className="font-extrabold text-base">Nova Anotação</h3>
              <button onClick={() => setIsNoteModalOpen(false)} className="p-1.5 rounded-lg hover:bg-black/5 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateNote} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold opacity-60 block mb-1">Título</label>
                <input 
                  type="text" 
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Título da nota..."
                  className="w-full px-3.5 py-2.5 rounded-xl border text-xs font-semibold outline-none focus:border-blue-500"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                />
              </div>

              <div>
                <label className="text-xs font-bold opacity-60 block mb-1">Salvar na Pasta</label>
                <select 
                  value={newNoteFolder}
                  onChange={(e) => setNewNoteFolder(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border text-xs font-semibold outline-none cursor-pointer focus:border-blue-500"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                >
                  {folders.map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold opacity-60 block mb-1">Conteúdo</label>
                <textarea 
                  rows={4}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Escreva os detalhes da nota..."
                  className="w-full px-3.5 py-2.5 rounded-xl border text-xs outline-none resize-none focus:border-blue-500"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                />
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t" style={{ borderColor: 'var(--border-input)' }}>
                <button type="button" onClick={() => setIsNoteModalOpen(false)} className="px-4 py-2 rounded-xl border text-xs font-bold cursor-pointer" style={{ borderColor: 'var(--border-input)' }}>
                  Cancelar
                </button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-brand-panel text-white text-xs font-bold cursor-pointer hover:opacity-90">
                  Salvar Nota
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================================
            MODAL 3: CONFIRMAÇÃO DE EXCLUSÃO (PASTAS & NOTAS)
          ========================================================== */}
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