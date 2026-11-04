'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { 
  StickyNote, Plus, Trash2, Search, Shield, Calendar,
  X, Folder, FolderOpen, FolderPlus, Loader2, AlertTriangle, ArrowLeft, FileText
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface NoteItem {
  id: string;
  title: string;
  content: string;
  folder: string;
  updated_at: string;
}

export default function AnotacoesPage() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('Carregando...');
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
    isOpen: false, title: '', message: '', onConfirm: () => {},
  });

  const glassContainerStyle = { backgroundColor: 'color-mix(in srgb, var(--bg-card) 50%, transparent)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', border: '1px solid color-mix(in srgb, var(--border-input) 40%, transparent)', boxShadow: '0 12px 40px rgba(0, 0, 0, 0.08)' };
  const glassSidebarStyle = { backgroundColor: 'color-mix(in srgb, var(--bg-input) 30%, transparent)', borderRight: '1px solid color-mix(in srgb, var(--border-input) 40%, transparent)' };
  const solidCardStyle = { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-input)', boxShadow: '0 12px 40px rgba(0, 0, 0, 0.15)' };
  const solidInputStyle = { backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-main)' };

  useEffect(() => {
    const fetchUserAndNotes = async () => {
      setIsLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        setUserId(session.user.id);
        const { data: perfil } = await supabase.from('doodoo_perfis').select('nome').eq('user_id', session.user.id).single();
        if (perfil) setUserName(perfil.nome);

        const { data: notasData } = await supabase.from('doodoo_notas').select('*').eq('usuario_id', session.user.id).order('updated_at', { ascending: false });
        
        if (notasData) {
          const mappedNotes = notasData.map((n: any) => ({
            id: n.id, title: n.titulo, content: n.conteudo, folder: n.cor || 'Geral', updated_at: n.updated_at
          }));
          setNotes(mappedNotes);
          
          if (window.innerWidth >= 1024 && mappedNotes.length > 0) {
            setSelectedNoteId(mappedNotes[0].id);
          }
        }
      }
      setIsLoading(false);
    };
    fetchUserAndNotes();
  }, []);

  const notifyBell = (title: string, desc: string) => {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('doodoo:notify', { detail: { title, desc } }));
  };

  const handleDirectCreateNote = async (title: string, content: string, folder: string) => {
    if (!userId || !title.trim()) return;
    const { data, error } = await supabase.from('doodoo_notas').insert([{ usuario_id: userId, titulo: title.trim(), conteudo: content.trim() || '', cor: folder }]).select().single();
    if (data && !error) {
      const novaNota = { id: data.id, title: data.titulo, content: data.conteudo, folder: data.cor || 'Geral', updated_at: data.updated_at };
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
      isOpen: true, title: 'Excluir Pasta', message: `Excluir permanentemente o caderno "${folderName}" e todas as anotações dentro dele?`,
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
      isOpen: true, title: 'Excluir Anotação', message: 'A anotação será removida permanentemente do sistema.',
      onConfirm: async () => {
        await supabase.from('doodoo_notas').delete().eq('id', id);
        setNotes(prev => prev.filter(n => n.id !== id));
        setSelectedNoteId(null);
        notifyBell('Nota Excluída', 'A anotação foi removida.');
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleUpdateNote = (id: string, updates: Partial<NoteItem>) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
    const dbUpdates: any = { updated_at: new Date().toISOString() };
    if (updates.title !== undefined) dbUpdates.titulo = updates.title;
    if (updates.content !== undefined) dbUpdates.conteudo = updates.content;
    if (updates.folder !== undefined) dbUpdates.cor = updates.folder;
    
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(async () => {
      await supabase.from('doodoo_notas').update(dbUpdates).eq('id', id);
    }, 1500); // 🚀 Otimizado para não floodar o banco de dados
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

  const selectedNote = useMemo(() => notes.find(n => n.id === selectedNoteId) || null, [notes, selectedNoteId]);

  const formatTime = (dateStr: string) => {
    if (!isMounted) return '';
    const date = new Date(dateStr);
    return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  };

  if (isLoading || !isMounted) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin opacity-50 text-blue-500" />
      </div>
    );
  }

  return (
    <div className="w-full h-full flex-1 flex flex-col animate-in fade-in duration-500 pb-0 relative z-0">
      
      <div className="w-full flex-1 flex flex-col lg:flex-row rounded-t-[2rem] rounded-bl-none rounded-br-none md:rounded-[2.5rem] border-t border-l-0 border-r-0 border-b-0 md:border overflow-hidden relative z-10" style={glassContainerStyle}>
        
        {/* ==========================================================
            COLUNA 1: MENU LATERAL DE PASTAS (Apenas Desktop)
            ========================================================== */}
        <div className="hidden lg:flex flex-col w-[280px] xl:w-[320px] flex-shrink-0" style={glassSidebarStyle}>
          <div className="p-6 md:p-8 space-y-8 flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
            
            <div className="pb-5 border-b" style={{ borderColor: 'color-mix(in srgb, var(--border-input) 40%, transparent)' }}>
              <h3 className="font-extrabold text-base tracking-tight">Bloco Pessoal</h3>
              <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500 mt-1">Sincronizado</p>
            </div>

            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-2xl bg-brand-panel flex items-center justify-center text-white shadow-md flex-shrink-0">
                <StickyNote className="w-6 h-6" />
              </div>
              <div className="overflow-hidden">
                <h3 className="font-extrabold text-[15px] tracking-tight truncate">{userName}</h3>
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 truncate mt-0.5">Autor Principal</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between px-2 mb-3">
                <p className="text-[10px] font-extrabold uppercase tracking-widest opacity-40">Seus Cadernos</p>
                <button onClick={() => setIsFolderModalOpen(true)} className="text-[10px] font-extrabold text-blue-500 hover:text-blue-600 transition-colors flex items-center space-x-1 cursor-pointer">
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>Nova Pasta</span>
                </button>
              </div>
              
              <button onClick={() => setSelectedFolder('Todas')} className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${selectedFolder === 'Todas' ? 'bg-brand-panel text-white shadow-md' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-75'}`}>
                <div className="flex items-center space-x-3"><Folder className="w-4 h-4" /><span>Todas as Notas</span></div>
                <span className="text-[11px] font-extrabold">{notes.length}</span>
              </button>

              {folders.filter(f => f !== 'Todas').map(folder => (
                <div key={folder} className="group relative flex items-center justify-between w-full">
                  <button onClick={() => setSelectedFolder(folder)} className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${selectedFolder === folder ? 'bg-brand-panel text-white shadow-md' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-75'}`}>
                    <div className="flex items-center space-x-3">
                      {selectedFolder === folder ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
                      <span className="truncate max-w-[140px] text-left">{folder}</span>
                    </div>
                    <span className="text-[11px] font-extrabold pr-8">{notes.filter(n => n.folder === folder).length}</span>
                  </button>
                  {folder !== 'Geral' && (
                    <button onClick={(e) => { e.stopPropagation(); confirmDeleteFolder(folder); }} className={`absolute right-2 p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all cursor-pointer ${selectedFolder === folder ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} title="Excluir Pasta">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ==========================================================
            COLUNA 2: LISTA DE NOTAS (Dinâmica)
            ========================================================== */}
        <div className={`${selectedNoteId ? 'hidden lg:flex lg:w-[350px] xl:w-[400px] lg:flex-none lg:border-r' : 'flex-1 w-full'} flex-col h-full overflow-hidden transition-all duration-300`} style={{ borderColor: 'color-mix(in srgb, var(--border-input) 40%, transparent)' }}>
          
          {/* Cabeçalho Mobile */}
          <div className="lg:hidden flex flex-col border-b flex-shrink-0" style={{ borderColor: 'color-mix(in srgb, var(--border-input) 40%, transparent)' }}>
            <div className="flex items-center justify-between p-5 md:p-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-brand-panel flex items-center justify-center text-white shadow-md">
                  <StickyNote className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-[15px] tracking-tight">Bloco Pessoal</h3>
                  <div className="flex items-center space-x-1.5 opacity-60">
                    <Shield className="w-3 h-3 text-blue-500" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">{userName}</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setIsFolderModalOpen(true)} className="p-2.5 rounded-xl border hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer text-blue-500 transition-colors" style={{ borderColor: 'var(--border-input)' }}>
                <FolderPlus className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex overflow-x-auto px-5 pb-5 space-x-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
              <button onClick={() => setSelectedFolder('Todas')} className={`px-5 py-3 rounded-full text-[13px] font-extrabold whitespace-nowrap transition-transform active:scale-95 shadow-sm ${selectedFolder === 'Todas' ? 'bg-brand-panel text-white' : 'border border-[var(--border-input)] opacity-70 hover:opacity-100'}`} style={selectedFolder !== 'Todas' ? { backgroundColor: 'var(--bg-card)' } : {}}>
                Todas ({notes.length})
              </button>
              {folders.filter(f => f !== 'Todas').map(f => (
                <button key={f} onClick={() => setSelectedFolder(f)} className={`px-5 py-3 rounded-full text-[13px] font-extrabold whitespace-nowrap transition-transform active:scale-95 shadow-sm flex items-center space-x-2 ${selectedFolder === f ? 'bg-brand-panel text-white' : 'border border-[var(--border-input)] opacity-70 hover:opacity-100'}`} style={selectedFolder !== f ? { backgroundColor: 'var(--bg-card)' } : {}}>
                  <span>{f}</span>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] ${selectedFolder === f ? 'bg-white/20' : 'bg-black/10 dark:bg-white/10'}`}>{notes.filter(n => n.folder === f).length}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 md:p-6 border-b flex items-center justify-between gap-3 flex-shrink-0" style={{ borderColor: 'color-mix(in srgb, var(--border-input) 40%, transparent)', backgroundColor: 'color-mix(in srgb, var(--bg-card) 60%, transparent)' }}>
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-40" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pesquisar notas..."
                className="w-full pl-10 pr-4 py-3.5 rounded-2xl border text-[13px] font-bold outline-none focus:border-brand-panel transition-colors"
                style={solidInputStyle}
              />
            </div>
            <button 
              onClick={() => { setNewTitle(''); setNewContent(''); setNewNoteFolder(folders[0] || 'Geral'); setIsNoteModalOpen(true); }}
              className="p-3.5 px-5 rounded-2xl bg-brand-panel text-white shadow-md hover:opacity-95 transition-all flex items-center justify-center space-x-2 cursor-pointer flex-shrink-0 active:scale-95"
            >
              <Plus className="w-5 h-5" />
              <span className={`${selectedNoteId ? 'hidden' : 'inline'} font-extrabold text-[13px]`}>Nova</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
            {filteredNotes.map(note => {
              const isSelected = selectedNote?.id === note.id;
              return (
                <div 
                  key={note.id}
                  onClick={() => setSelectedNoteId(note.id)}
                  className={`p-5 rounded-[1.5rem] border transition-all cursor-pointer flex items-start justify-between gap-3 ${isSelected ? 'shadow-md scale-[1.01]' : 'hover:brightness-95 shadow-sm'}`}
                  style={{ 
                    backgroundColor: isSelected ? 'var(--bg-input)' : 'color-mix(in srgb, var(--bg-card) 70%, transparent)', 
                    borderColor: isSelected ? 'var(--tab-active)' : 'var(--border-input)' 
                  }}
                >
                  <div className="overflow-hidden w-full">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[9px] font-extrabold uppercase tracking-widest opacity-80 px-2 py-1 rounded-md bg-black/5 dark:bg-white/5 truncate max-w-[120px]">
                        {note.folder}
                      </span>
                      <span className="text-[10px] opacity-40 font-bold">{formatTime(note.updated_at).split(' às ')[0]}</span>
                    </div>
                    <p className="text-[15px] font-extrabold leading-tight line-clamp-2 break-words">{note.title || 'Sem título'}</p>
                    <p className="text-[12px] opacity-60 line-clamp-2 mt-2 font-medium leading-relaxed">{note.content || 'Sem conteúdo.'}</p>
                  </div>
                </div>
              );
            })}
            {filteredNotes.length === 0 && (
              <div className="h-full min-h-[250px] flex flex-col items-center justify-center text-center opacity-40 space-y-4">
                <FileText className="w-12 h-12 stroke-1" />
                <p className="text-sm font-bold">Nenhuma nota encontrada.</p>
              </div>
            )}
          </div>
        </div>

        {/* ==========================================================
            COLUNA 3: EDITOR (Expande a 100% no Mobile)
            ========================================================== */}
        <div className={`${selectedNoteId ? 'flex' : 'hidden'} flex-col flex-1 h-full overflow-hidden`} style={{ backgroundColor: 'var(--bg-card)' }}>
          {selectedNote && (
            <>
              <div className="p-5 md:p-8 border-b flex flex-col gap-3 flex-shrink-0" style={{ borderColor: 'color-mix(in srgb, var(--border-input) 40%, transparent)' }}>
                <div className="w-full pr-2 flex flex-col">
                  
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <button onClick={() => setSelectedNoteId(null)} className="lg:hidden p-2 -ml-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer flex items-center text-blue-500 font-extrabold text-[13px] transition-colors">
                        <ArrowLeft className="w-4 h-4 mr-1.5" /> Voltar
                      </button>
                      <span className="hidden lg:inline text-[10px] font-bold uppercase tracking-wider opacity-45">
                        <Calendar className="w-3 h-3 inline mr-1" /> {formatTime(selectedNote.updated_at)}
                      </span>
                    </div>
                    
                    <select 
                      value={selectedNote.folder}
                      onChange={(e) => handleUpdateNote(selectedNote.id, { folder: e.target.value })}
                      className="text-[11px] font-extrabold px-3.5 py-2 rounded-xl border outline-none cursor-pointer focus:border-brand-panel transition-colors shadow-sm"
                      style={solidInputStyle}
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
                    className="text-2xl md:text-4xl font-extrabold leading-tight p-1 bg-transparent border-b border-transparent hover:border-black/10 dark:hover:border-white/10 focus:border-brand-panel outline-none w-full transition-colors break-words whitespace-normal"
                  />
                </div>
              </div>

              <div className="flex-1 p-5 md:p-8 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] flex flex-col h-full">
                <textarea 
                  value={selectedNote.content || ''}
                  onChange={(e) => handleUpdateNote(selectedNote.id, { content: e.target.value })}
                  placeholder="Comece a escrever os seus pensamentos aqui..."
                  className="w-full flex-1 p-6 md:p-8 rounded-[2rem] text-[14px] md:text-[15px] leading-relaxed outline-none resize-none border focus:border-brand-panel transition-colors shadow-sm font-medium"
                  style={solidInputStyle}
                />
              </div>

              <div className="p-5 md:p-6 pb-6 border-t flex flex-col sm:flex-row items-center justify-between text-xs gap-4 sm:gap-0 flex-shrink-0" style={{ borderColor: 'color-mix(in srgb, var(--border-input) 40%, transparent)' }}>
                <span className="opacity-50 font-bold text-[11px] text-center sm:text-left w-full sm:w-auto">
                  Este documento é visível apenas para você.
                </span>
                
                <button onClick={() => confirmDeleteNote(selectedNote.id)} className="w-full sm:w-auto px-6 py-3.5 rounded-xl text-red-500 hover:text-white hover:bg-red-500 bg-red-500/10 font-bold flex items-center justify-center space-x-2 cursor-pointer transition-colors shadow-sm">
                  <Trash2 className="w-4 h-4" />
                  <span>Excluir Documento</span>
                </button>
              </div>
            </>
          )}
        </div>

      </div>

      {/* MODAL: NOVA PASTA Z-[999] */}
      {isFolderModalOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-[2.5rem] border shadow-2xl overflow-hidden" style={solidCardStyle}>
            <div className="px-6 md:px-8 py-6 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-input)' }}>
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-panel">Organização</span>
                <h3 className="font-extrabold text-lg mt-0.5">Novo Caderno</h3>
              </div>
              <button onClick={() => setIsFolderModalOpen(false)} className="p-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateFolder} className="p-6 md:p-8 space-y-6">
              <div>
                <label className="text-[11px] font-extrabold opacity-60 block mb-2 uppercase tracking-widest">Nome do Caderno</label>
                <input 
                  type="text" 
                  required
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Ex: Senhas, Projetos..."
                  className="w-full px-4 py-3.5 rounded-2xl border text-[13px] font-bold outline-none focus:border-brand-panel transition-colors"
                  style={solidInputStyle}
                />
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button type="button" onClick={() => setIsFolderModalOpen(false)} className="px-6 py-3.5 rounded-xl border text-[13px] font-bold cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" style={{ borderColor: 'var(--border-input)' }}>
                  Cancelar
                </button>
                <button type="submit" className="px-7 py-3.5 rounded-xl bg-brand-panel text-white text-[13px] font-extrabold cursor-pointer hover:opacity-90 active:scale-95 transition-transform shadow-md">
                  Criar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NOVA NOTA Z-[999] */}
      {isNoteModalOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-[2.5rem] border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" style={solidCardStyle}>
            <div className="px-6 md:px-8 py-6 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-input)' }}>
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-panel">Rascunho</span>
                <h3 className="font-extrabold text-lg md:text-xl mt-1">Nova Anotação</h3>
              </div>
              <button onClick={() => setIsNoteModalOpen(false)} className="p-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateNote} className="p-6 md:p-8 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] space-y-6">
              <div>
                <label className="text-[11px] font-extrabold opacity-60 block mb-2 uppercase tracking-widest">Título da Nota</label>
                <input 
                  type="text" 
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ex: Resumo da Reunião..."
                  className="w-full px-4 py-3.5 rounded-2xl border text-[13px] font-bold outline-none focus:border-brand-panel transition-colors"
                  style={solidInputStyle}
                />
              </div>

              <div>
                <label className="text-[11px] font-extrabold opacity-60 block mb-2 uppercase tracking-widest">Guardar no Caderno</label>
                <select 
                  value={newNoteFolder}
                  onChange={(e) => setNewNoteFolder(e.target.value)}
                  className="w-full px-4 py-3.5 rounded-2xl border text-[13px] font-bold outline-none cursor-pointer focus:border-brand-panel transition-colors"
                  style={solidInputStyle}
                >
                  {folders.map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-extrabold opacity-60 block mb-2 uppercase tracking-widest">Conteúdo (Opcional)</label>
                <textarea 
                  rows={4}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Escreva os detalhes da nota aqui..."
                  className="w-full px-4 py-4 rounded-3xl border text-[13px] leading-relaxed outline-none resize-none focus:border-brand-panel transition-colors font-medium"
                  style={solidInputStyle}
                />
              </div>

              <div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3 pt-4 border-t" style={{ borderColor: 'var(--border-input)' }}>
                <button type="button" onClick={() => setIsNoteModalOpen(false)} className="w-full sm:w-auto px-6 py-3.5 rounded-xl border text-[13px] font-extrabold cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" style={{ borderColor: 'var(--border-input)' }}>
                  Cancelar
                </button>
                <button type="submit" className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-brand-panel text-white text-[13px] font-extrabold shadow-md cursor-pointer hover:opacity-90 active:scale-95 transition-transform">
                  Salvar Nota
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAÇÃO DE EXCLUSÃO */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-full max-w-sm rounded-[2.5rem] border shadow-2xl overflow-hidden" style={solidCardStyle}>
            
            <div className="px-6 md:px-8 py-6 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-input)' }}>
              <div className="flex items-center space-x-2 text-red-500">
                <AlertTriangle className="w-6 h-6" />
                <h3 className="font-extrabold text-base md:text-lg">{confirmModal.title}</h3>
              </div>
              <button onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} className="p-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 md:p-8">
              <p className="text-[13px] font-semibold opacity-80 leading-relaxed text-center">
                {confirmModal.message}
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3 px-6 md:px-8 py-5 border-t" style={{ borderColor: 'var(--border-input)' }}>
              <button onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} className="w-full sm:w-auto px-6 py-3.5 rounded-xl border text-[13px] font-extrabold cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" style={{ borderColor: 'var(--border-input)' }}>
                Cancelar
              </button>
              <button onClick={confirmModal.onConfirm} className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-[13px] font-extrabold cursor-pointer transition-colors shadow-md active:scale-95">
                Sim, Excluir
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}