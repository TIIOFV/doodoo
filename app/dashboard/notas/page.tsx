'use client';
import './notes-workspace.css';

import { primaryActionStyle } from '@/app/components/BrandMark';
import { Button, inputStyle, panelStyle } from '@/app/components/ui';
import { notify as notifyBell, searchKey } from '@/app/lib/domain';
import { useHydrated } from '@/app/lib/useHydrated';
import {
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  List,
  ListChecks,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  Search,
  Shield,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import ModalShell from '../ModalShell';
import { useDialogAction } from '../useDialogAction';
import { storedNoteDrafts, useNoteDrafts, type NotePatch } from '../useNoteDrafts';

interface NoteItem {
  id: string;
  title: string;
  content: string;
  folder: string;
  updated_at: string;
}

export default function AnotacoesPage() {
  const dialogAction = useDialogAction();
  const isMounted = useHydrated();

  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('Carregando...');
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [orphanDrafts, setOrphanDrafts] = useState<{ id: string; patch: NotePatch }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const drafts = useNoteDrafts(userId);
  const draftsRef = useRef(drafts);
  useEffect(() => {
    draftsRef.current = drafts;
  });

  const folders = useMemo(() => {
    const uniqueFolders = Array.from(new Set(notes.map((n) => n.folder || 'Geral')));
    if (!uniqueFolders.includes('Geral')) uniqueFolders.unshift('Geral');
    return uniqueFolders;
  }, [notes]);

  const [selectedFolder, setSelectedFolder] = useState<string>('Todas');
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const noteTitleRef = useRef<HTMLTextAreaElement>(null);
  const noteContentRef = useRef<HTMLTextAreaElement>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [sortBy, setSortBy] = useState<'recent' | 'title'>('recent');
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

  const glassContainerStyle = {
    ...panelStyle,
    boxShadow: 'var(--shadow-card, 0 1px 2px rgb(15 23 42 / 0.04))',
  };
  const solidInputStyle = inputStyle;

  useEffect(() => {
    const fetchUserAndNotes = async () => {
      setIsLoading(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        setUserId(session.user.id);
        const { data: perfil } = await supabase.from('doodoo_perfis').select('nome').eq('user_id', session.user.id).single();
        if (perfil) setUserName(perfil.nome);

        const { data: notasData, error: notesError } = await supabase
          .from('doodoo_notas')
          .select('*')
          .eq('usuario_id', session.user.id)
          .order('updated_at', { ascending: false });

        if (notesError) {
          notifyBell('Erro ao carregar', 'Não foi possível carregar as anotações. Recarregue para tentar novamente.');
        }
        if (notasData) {
          try {
            setOrphanDrafts(storedNoteDrafts(session.user.id).filter((d) => !notasData.some((n) => n.id === d.id)));
          } catch {
            notifyBell('Recuperação indisponível', 'Não foi possível ler os rascunhos locais.');
          }
          const mappedNotes = notasData.map((n) => {
            const patch = draftsRef.current.restore(n.id, n.updated_at);
            return {
              id: n.id,
              title: patch.titulo ?? n.titulo,
              content: patch.conteudo ?? n.conteudo,
              folder: patch.cor ?? n.cor ?? 'Geral',
              updated_at: n.updated_at,
            };
          });
          setNotes(mappedNotes);

          if (window.innerWidth >= 1024 && mappedNotes.length > 0) {
            setSelectedNoteId(mappedNotes[0].id);
          }
        }
      }
      setIsLoading(false);
    };
    void fetchUserAndNotes();
  }, []);

  const handleDirectCreateNote = async (title: string, content: string, folder: string) => {
    if (!userId || !title.trim()) return false;
    const { data, error } = await supabase
      .from('doodoo_notas')
      .insert([{ usuario_id: userId, titulo: title.trim(), conteudo: content.trim() || '', cor: folder, updated_at: new Date().toISOString() }])
      .select()
      .single();
    if (error || !data) {
      notifyBell('Erro ao salvar', 'Não foi possível criar a anotação. Tente novamente.');
      return false;
    }
    const novaNota = { id: data.id, title: data.titulo, content: data.conteudo, folder: data.cor || 'Geral', updated_at: data.updated_at };
    setNotes((prev) => [novaNota, ...prev]);
    setSelectedNoteId(novaNota.id);
    return true;
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    const name = newFolderName.trim();
    if (!(await handleDirectCreateNote(`Nova nota em ${name}`, '', name))) return;
    setNewFolderName('');
    setIsFolderModalOpen(false);
    notifyBell('Nova Pasta', `O caderno "${name}" foi adicionado.`);
  };

  const confirmDeleteFolder = (folderName: string) => {
    if (folderName === 'Geral') return;
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Pasta',
      message: `Excluir permanentemente o caderno "${folderName}" e todas as anotações dentro dele?`,
      onConfirm: async () => {
        if (!(await drafts.flushAll())) return;
        const { data, error } = await supabase.from('doodoo_notas').delete().eq('cor', folderName).eq('usuario_id', userId).select('id');
        if (error) throw error;
        if (!data?.length) throw new Error('Nenhuma nota foi removida. Verifique o acesso e atualize a página.');
        const removed = new Set(data.map((n) => n.id));
        setNotes((prev) => prev.filter((n) => !removed.has(n.id)));
        if (selectedNoteId && removed.has(selectedNoteId)) setSelectedNoteId(null);
        for (const id of removed) drafts.forget(id);
        if (notes.some((n) => n.folder === folderName && !removed.has(n.id))) {
          notifyBell('Exclusão parcial', 'Algumas notas não foram removidas. Atualize a página antes de continuar.');
          return;
        }
        if (selectedFolder === folderName) setSelectedFolder('Todas');
        notifyBell('Pasta Excluída', `O caderno "${folderName}" foi removido.`);
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(await handleDirectCreateNote(newTitle, newContent, newNoteFolder))) return;
    setIsNoteModalOpen(false);
    setNewTitle('');
    setNewContent('');
    notifyBell('Nova Anotação', `A nota "${newTitle}" foi criada.`);
  };

  const confirmDeleteNote = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Anotação',
      message: 'A anotação será removida permanentemente do sistema.',
      onConfirm: async () => {
        const { error } = await supabase.from('doodoo_notas').delete().eq('id', id).eq('usuario_id', userId);
        if (error) throw error;
        drafts.forget(id);
        setNotes((prev) => prev.filter((n) => n.id !== id));
        setSelectedNoteId(null);
        notifyBell('Nota Excluída', 'A anotação foi removida.');
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const handleUpdateNote = (id: string, updates: Partial<NoteItem>) => {
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    const version = draftsRef.current.version(id) || note.updated_at;
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...updates } : n)));
    drafts.edit(
      id,
      {
        ...(updates.title !== undefined ? { titulo: updates.title } : {}),
        ...(updates.content !== undefined ? { conteudo: updates.content } : {}),
        ...(updates.folder !== undefined ? { cor: updates.folder } : {}),
      },
      version
    );
  };

  const insertSnippet = (snippet: string) => {
    if (!selectedNote) return;
    const el = noteContentRef.current;
    const current = selectedNote.content || '';
    if (!el) {
      handleUpdateNote(selectedNote.id, { content: current + snippet });
      return;
    }
    const isFocused = document.activeElement === el;
    const start = isFocused ? (el.selectionStart ?? current.length) : current.length;
    const end = isFocused ? (el.selectionEnd ?? current.length) : current.length;
    const needsNewline = start > 0 && current[start - 1] !== '\n' && !snippet.startsWith('\n');
    const inserted = (needsNewline ? '\n' : '') + snippet;
    const next = current.slice(0, start) + inserted + current.slice(end);
    handleUpdateNote(selectedNote.id, { content: next });
    window.requestAnimationFrame(() => {
      el.focus();
      const caret = start + inserted.length;
      el.setSelectionRange(caret, caret);
    });
  };

  const handleCopyNote = async () => {
    if (!selectedNote) return;
    const payload = `${selectedNote.title ? selectedNote.title + '\n\n' : ''}${selectedNote.content || ''}`.trim();
    try {
      await navigator.clipboard.writeText(payload);
      setCopiedId(selectedNote.id);
      window.setTimeout(() => setCopiedId((prev) => (prev === selectedNote.id ? null : prev)), 2000);
    } catch {
      notifyBell('Cópia indisponível', 'Não foi possível copiar o conteúdo neste navegador.');
    }
  };

  const openNewNoteModal = () => {
    setNewTitle('');
    setNewContent('');
    setNewNoteFolder(selectedFolder !== 'Todas' ? selectedFolder : folders[0] || 'Geral');
    setIsNoteModalOpen(true);
  };

  const filteredNotes = useMemo(() => {
    return notes
      .filter((n) => {
        if (selectedFolder !== 'Todas' && n.folder !== selectedFolder) return false;
        if (searchQuery.trim() !== '') {
          const q = searchKey(searchQuery);
          return searchKey(n.title || '').includes(q) || searchKey(n.content || '').includes(q);
        }
        return true;
      })
      .sort((a, b) => (sortBy === 'title' ? (a.title || '').localeCompare(b.title || '', 'pt-BR') : b.updated_at.localeCompare(a.updated_at)));
  }, [notes, selectedFolder, searchQuery, sortBy]);

  const selectedNote = notes.find((n) => n.id === selectedNoteId) || null;

  useEffect(() => {
    const node = noteTitleRef.current;
    if (!node) return;
    let width = node.clientWidth;
    let frame = 0;
    const resize = () => {
      node.style.height = 'auto';
      node.style.height = node.scrollHeight + 'px';
    };
    resize();
    const observer = new ResizeObserver(() => {
      if (node.clientWidth !== width) {
        width = node.clientWidth;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(resize);
      }
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [selectedNote?.id, selectedNote?.title]);

  const formatTime = (dateStr: string) => {
    if (!isMounted || !dateStr) return '';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const selectedWordCount = selectedNote ? selectedNote.content.trim().split(/\s+/).filter(Boolean).length : 0;
  const selectedCharCount = selectedNote ? selectedNote.content.length : 0;

  if (isLoading || !isMounted) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-brand-panel" />
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          Carregando suas anotações...
        </span>
      </div>
    );
  }

  return (
    <div
      onBlur={() => {
        void drafts.flushAll();
      }}
      data-focus={focusMode && Boolean(selectedNoteId)}
      className="notes-workspace w-full h-full min-h-0 min-w-0 flex-1 flex flex-col pb-0 relative z-0"
    >
      {orphanDrafts.length > 0 && (
        <div role="alert" className="shrink-0 flex flex-wrap items-center gap-3 border rounded-xl p-3 mb-3" style={solidInputStyle}>
          <p className="text-sm">Há rascunhos de notas removidas ou indisponíveis. Recupere como uma nova nota privada.</p>
          {orphanDrafts.map((d) => (
            <Button
              key={d.id}
              variant="secondary"
              disabled={dialogAction.pending}
              onClick={() =>
                dialogAction.run(async () => {
                  if (await handleDirectCreateNote(d.patch.titulo || 'Nota recuperada', d.patch.conteudo || '', d.patch.cor || 'Geral')) {
                    drafts.forget(d.id);
                    setOrphanDrafts((prev) => prev.filter((v) => v.id !== d.id));
                  }
                })
              }
            >
              Recuperar {d.patch.titulo || 'rascunho'}
            </Button>
          ))}
        </div>
      )}

      <div
        className="w-full flex-1 flex flex-col lg:flex-row rounded-none md:rounded-2xl border-t border-l-0 border-r-0 border-b-0 md:border overflow-hidden relative z-10"
        style={glassContainerStyle}
      >
        {/* ==========================================================
            COLUNA 1: CADERNOS (Desktop Rail v2)
            ========================================================== */}
        <div
          className="notes-folders hidden lg:flex flex-col flex-shrink-0 border-r"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}
        >
          <div className="p-5 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
            {/* Cabeçalho do Bloco Pessoal */}
            <div className="flex items-center gap-3 pb-4 border-b" style={{ borderColor: 'var(--border-input)' }}>
              <div className="notes-brand-icon">
                <StickyNote className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-[15px] tracking-tight truncate">Bloco Pessoal</h3>
                <p className="text-[11px] font-medium truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {drafts.status === 'saving' ? 'Salvando…' : drafts.status === 'error' ? 'Revisar salvamento' : 'Anotações privadas'}
                </p>
              </div>
            </div>

            {/* Cadernos */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1 mb-2.5">
                <div className="flex items-center gap-2">
                  <span className="notes-accent-bar" aria-hidden="true" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--text-muted)' }}>
                    Seus Cadernos
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Novo Caderno"
                  onClick={() => setIsFolderModalOpen(true)}
                  className="text-[11px] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                  style={{ color: 'var(--tab-active)' }}
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>Nova Pasta</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSelectedFolder('Todas')}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13px] transition-all cursor-pointer ${
                  selectedFolder === 'Todas' ? 'text-white font-semibold' : 'font-medium hover:bg-[var(--surface-hover)]'
                }`}
                style={selectedFolder === 'Todas' ? primaryActionStyle : { color: 'var(--text-muted)' }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Folder className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">Todas as Notas</span>
                </div>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    selectedFolder === 'Todas' ? 'bg-white/20 text-white' : ''
                  }`}
                  style={selectedFolder !== 'Todas' ? { backgroundColor: 'var(--bg-input)', color: 'var(--text-muted)' } : undefined}
                >
                  {notes.length}
                </span>
              </button>

              {folders
                .filter((f) => f !== 'Todas')
                .map((folder) => {
                  const isFolderActive = selectedFolder === folder;
                  const count = notes.filter((n) => n.folder === folder).length;
                  return (
                    <div key={folder} className="group relative flex items-center w-full">
                      <button
                        type="button"
                        onClick={() => setSelectedFolder(folder)}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13px] transition-all cursor-pointer ${
                          isFolderActive ? 'text-white font-semibold' : 'font-medium hover:bg-[var(--surface-hover)]'
                        }`}
                        style={isFolderActive ? primaryActionStyle : { color: 'var(--text-muted)' }}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {isFolderActive ? <FolderOpen className="w-4 h-4 flex-shrink-0" /> : <Folder className="w-4 h-4 flex-shrink-0" />}
                          <span className="truncate max-w-[118px] text-left">{folder}</span>
                        </div>
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full transition-all ${
                            folder !== 'Geral' ? 'mr-6' : ''
                          } ${isFolderActive ? 'bg-white/20 text-white' : ''}`}
                          style={!isFolderActive ? { backgroundColor: 'var(--bg-input)', color: 'var(--text-muted)' } : undefined}
                        >
                          {count}
                        </span>
                      </button>
                      {folder !== 'Geral' && (
                        <button
                          type="button"
                          aria-label="Excluir Pasta"
                          onClick={(e) => {
                            e.stopPropagation();
                            confirmDeleteFolder(folder);
                          }}
                          className={`absolute right-1.5 p-1.5 rounded-lg transition-all cursor-pointer ${
                            isFolderActive
                              ? 'text-white/85 hover:text-white hover:bg-white/15 opacity-100'
                              : 'text-[var(--error-text)] hover:bg-red-500/10 opacity-0 group-hover:opacity-100'
                          }`}
                          title="Excluir Pasta"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Rodapé de privacidade do autor */}
          <div className="p-4 border-t" style={{ borderColor: 'var(--border-input)' }}>
            <div
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border"
              style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}
            >
              <Shield className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--tab-active)' }} />
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">{userName}</p>
                <p className="text-[10px] font-medium truncate" style={{ color: 'var(--text-muted)' }}>
                  Acesso exclusivo ao autor
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ==========================================================
            COLUNA 2: LISTA DE NOTAS
            ========================================================== */}
        <div
          className={`${
            selectedNoteId ? 'hidden lg:flex lg:flex-none lg:border-r' : 'flex-1 w-full'
          } notes-list flex-col min-h-0 min-w-0 h-full overflow-hidden transition-all duration-200`}
          style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-page)' }}
        >
          {/* Cabeçalho Mobile */}
          <div className="lg:hidden flex flex-col border-b flex-shrink-0" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-card)' }}>
            <div className="flex items-center justify-between px-4 py-3.5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="notes-brand-icon">
                  <StickyNote className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-[15px] tracking-tight truncate">Bloco Pessoal</h3>
                  <div className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                    <Shield className="w-3 h-3" style={{ color: 'var(--tab-active)' }} />
                    <span className="text-[11px] font-medium truncate">{userName}</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                aria-label="Novo Caderno"
                onClick={() => setIsFolderModalOpen(true)}
                className="p-2 rounded-xl border hover:bg-[var(--surface-hover)] cursor-pointer transition-colors"
                style={{ borderColor: 'var(--border-input)', color: 'var(--tab-active)' }}
              >
                <FolderPlus className="w-4 h-4" />
              </button>
            </div>

            <div className="flex overflow-x-auto px-4 pb-3.5 gap-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
              <button
                type="button"
                onClick={() => setSelectedFolder('Todas')}
                className={`px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                  selectedFolder === 'Todas' ? 'text-white' : 'border'
                }`}
                style={
                  selectedFolder === 'Todas'
                    ? primaryActionStyle
                    : { backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-muted)' }
                }
              >
                Todas ({notes.length})
              </button>
              {folders
                .filter((f) => f !== 'Todas')
                .map((f) => (
                  <button
                    type="button"
                    key={f}
                    onClick={() => setSelectedFolder(f)}
                    className={`px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                      selectedFolder === f ? 'text-white' : 'border'
                    }`}
                    style={
                      selectedFolder === f
                        ? primaryActionStyle
                        : { backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-muted)' }
                    }
                  >
                    <span>{f}</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${selectedFolder === f ? 'bg-white/20' : 'bg-black/5 dark:bg-white/10'}`}>
                      {notes.filter((n) => n.folder === f).length}
                    </span>
                  </button>
                ))}
            </div>
          </div>

          {/* Barra de Busca + Nova Anotação */}
          <div
            className="p-3.5 md:p-4 border-b flex items-center gap-2.5 flex-shrink-0"
            style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-card)' }}
          >
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Pesquisar anotações"
                placeholder="Pesquisar notas..."
                className="w-full pl-9 pr-8 py-2.5 rounded-xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors"
                style={solidInputStyle}
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Limpar pesquisa"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-[var(--surface-hover)] cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              type="button"
              aria-label="Nova Anotação"
              onClick={openNewNoteModal}
              className="h-10 px-3.5 rounded-xl text-white transition-all hover:brightness-105 flex items-center justify-center gap-1.5 cursor-pointer flex-shrink-0 active:scale-95"
              style={primaryActionStyle}
            >
              <Plus className="w-4 h-4" />
              <span className={`${selectedNoteId ? 'hidden xl:inline' : 'inline'} font-semibold text-xs`}>Nova</span>
            </button>
          </div>

          {/* Lista Rolável de Cards */}
          <div className="notes-list-scroll min-h-0 flex-1 overflow-y-auto custom-scrollbar space-y-2.5">
            <div className="notes-sort">
              <span className="font-semibold">
                {filteredNotes.length} {filteredNotes.length === 1 ? 'nota' : 'notas'}
              </span>
              <label className="flex items-center gap-1.5">
                <span>Ordenar</span>
                <select
                  aria-label="Ordenar anotações"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                >
                  <option value="recent">Mais recentes</option>
                  <option value="title">Título A–Z</option>
                </select>
              </label>
            </div>

            {filteredNotes.map((note) => {
              const isSelected = selectedNote?.id === note.id;
              return (
                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      event.currentTarget.click();
                    }
                  }}
                  data-note-card
                  data-selected={isSelected}
                  key={note.id}
                  onClick={() => setSelectedNoteId(note.id)}
                  className="notes-card cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="notes-folder-pill truncate max-w-[140px]">{note.folder}</span>
                    <span className="text-[11px] font-medium flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                      {formatTime(note.updated_at).split(' às ')[0]}
                    </span>
                  </div>
                  <p className="text-[14px] font-semibold leading-snug line-clamp-2 break-words">
                    {note.title || 'Sem título'}
                  </p>
                  <p className="text-[12px] line-clamp-2 mt-1.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                    {note.content || 'Comece a escrever…'}
                  </p>
                </div>
              );
            })}

            {filteredNotes.length === 0 && (
              <div className="min-h-[240px] flex flex-col items-center justify-center text-center px-4 py-10 gap-3">
                <div className="notes-brand-icon">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Nenhuma nota encontrada</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    {searchQuery ? 'Tente outro termo de pesquisa.' : 'Crie uma nova anotação para começar.'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ==========================================================
            COLUNA 3: EDITOR DE DOCUMENTOS V2
            ========================================================== */}
        <div
          className={`${selectedNoteId ? 'flex' : 'hidden lg:flex'} notes-editor flex-col min-h-0 min-w-0 flex-1 h-full overflow-hidden`}
          style={{ backgroundColor: 'var(--bg-card)' }}
        >
          {selectedNote ? (
            <>
              {/* Barra Superior de Status & Ações */}
              <div
                className="notes-status-bar flex shrink-0 items-center justify-between gap-3 border-b"
                style={{ borderColor: 'var(--border-input)' }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedNoteId(null);
                      setFocusMode(false);
                    }}
                    className="lg:hidden p-1.5 -ml-1.5 rounded-lg hover:bg-[var(--surface-hover)] cursor-pointer flex items-center text-xs font-semibold transition-colors"
                    style={{ color: 'var(--tab-active)' }}
                  >
                    <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
                  </button>

                  <span role="status" className="notes-save-pill" data-state={drafts.status}>
                    {drafts.status === 'saving' ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Salvando alterações...</span>
                      </>
                    ) : drafts.status === 'error' ? (
                      <span>Alterações não salvas. Rascunho preservado.</span>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Todas as alterações salvas</span>
                      </>
                    )}
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {drafts.status === 'error' && (
                    <div className="flex flex-wrap gap-1.5">
                      <Button variant="secondary" onClick={() => drafts.flushAll()}>
                        Tentar salvar novamente
                      </Button>
                      <Button variant="secondary" onClick={() => drafts.resolve(selectedNote.id)}>
                        Mesclar rascunho
                      </Button>
                    </div>
                  )}

                  <select
                    aria-label="Caderno da anotação"
                    value={selectedNote.folder}
                    onChange={(e) => handleUpdateNote(selectedNote.id, { folder: e.target.value })}
                    className="notes-folder-select text-xs font-semibold px-3 py-1.5 rounded-lg border outline-none cursor-pointer transition-colors"
                    style={solidInputStyle}
                  >
                    {folders.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>

                  <div className="notes-editor-tools">
                    <button
                      type="button"
                      aria-label="Copiar anotação"
                      title="Copiar conteúdo"
                      onClick={() => void handleCopyNote()}
                    >
                      {copiedId === selectedNote.id ? <Check size={15} /> : <Copy size={15} />}
                    </button>
                    <button
                      type="button"
                      aria-label={focusMode ? 'Sair do modo foco' : 'Modo foco'}
                      title={focusMode ? 'Sair do modo foco' : 'Modo foco'}
                      onClick={() => setFocusMode((v) => !v)}
                    >
                      {focusMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                    </button>
                    <button
                      type="button"
                      aria-label="Exportar anotação"
                      title="Exportar (.txt)"
                      onClick={() => {
                        const url = URL.createObjectURL(
                          new Blob([selectedNote.title + '\n\n' + selectedNote.content], { type: 'text/plain;charset=utf-8' })
                        );
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = (selectedNote.title || 'anotacao').replace(/[<>:"/\\|?*]/g, '-').slice(0, 100) + '.txt';
                        a.click();
                        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                      }}
                    >
                      <Download size={15} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Cabeçalho Editorial da Nota */}
              <div className="notes-editor-header flex flex-col gap-2.5 flex-shrink-0">
                <div className="flex items-center flex-wrap gap-2 text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                  <span className="notes-folder-pill">{selectedNote.folder}</span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatTime(selectedNote.updated_at)}
                  </span>
                </div>

                <textarea
                  ref={noteTitleRef}
                  rows={1}
                  aria-label="Título da anotação"
                  value={selectedNote.title}
                  onChange={(e) => handleUpdateNote(selectedNote.id, { title: e.target.value })}
                  placeholder="Título da anotação..."
                  className="notes-title font-bold leading-tight bg-transparent border-0 outline-none w-full break-words whitespace-normal"
                />

                {/* Barra de Inserção Rápida */}
                <div className="notes-quick-bar" aria-label="Inserção rápida">
                  <button type="button" onClick={() => insertSnippet('• ')}>
                    <List size={13} />
                    <span>Tópico</span>
                  </button>
                  <button type="button" onClick={() => insertSnippet('[ ] ')}>
                    <ListChecks size={13} />
                    <span>Checklist</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      insertSnippet(
                        `${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} — `
                      )
                    }
                  >
                    <Clock size={13} />
                    <span>Data e hora</span>
                  </button>
                  <button type="button" onClick={() => insertSnippet('\n──────────────\n')}>
                    <Minus size={13} />
                    <span>Divisor</span>
                  </button>
                </div>
              </div>

              {/* Corpo da Anotação */}
              <div className="notes-content min-w-0 flex-1 flex min-h-0 flex-col">
                <textarea
                  ref={noteContentRef}
                  aria-label="Conteúdo da anotação"
                  value={selectedNote.content || ''}
                  onChange={(e) => handleUpdateNote(selectedNote.id, { content: e.target.value })}
                  placeholder="Comece a escrever suas ideias, atas ou rascunhos aqui..."
                  className="w-full flex-1 outline-none resize-none bg-transparent custom-scrollbar"
                />
              </div>

              {/* Rodapé do Documento */}
              <div className="notes-footer border-t flex items-center justify-between text-xs gap-3 flex-shrink-0" style={{ borderColor: 'var(--border-input)' }}>
                <span className="font-medium" style={{ color: 'var(--text-muted)' }}>
                  {selectedWordCount} {selectedWordCount === 1 ? 'palavra' : 'palavras'} · {selectedCharCount} caracteres · Documento privado
                </span>

                <button
                  type="button"
                  onClick={() => confirmDeleteNote(selectedNote.id)}
                  className="px-3 py-1.5 rounded-lg text-[var(--error-text)] hover:bg-red-500/10 font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir Documento</span>
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-4">
              <div className="notes-brand-icon w-14 h-14 rounded-2xl">
                <StickyNote className="w-7 h-7" />
              </div>
              <div className="max-w-xs">
                <h3 className="text-base font-bold tracking-tight">Seu espaço privado de anotações</h3>
                <p className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Selecione uma anotação na lista ao lado ou crie um novo documento para começar.
                </p>
              </div>
              <button
                type="button"
                onClick={openNewNoteModal}
                className="px-4 py-2.5 rounded-xl text-white text-xs font-semibold flex items-center gap-2 cursor-pointer hover:brightness-105"
                style={primaryActionStyle}
              >
                <Plus className="w-4 h-4" />
                <span>Criar anotação</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: NOVA PASTA */}
      {isFolderModalOpen && (
        <ModalShell
          open
          description={<span className="text-xs font-semibold uppercase tracking-widest text-brand-panel">Organização</span>}
          title="Novo Caderno"
          onClose={() => setIsFolderModalOpen(false)}
          busy={dialogAction.pending}
          footer={
            <div className="flex justify-end gap-3 pt-2">
              <button
                form="modal-form-1"
                type="button"
                onClick={() => setIsFolderModalOpen(false)}
                className="px-5 py-2.5 rounded-xl border text-sm font-medium cursor-pointer hover:bg-[var(--surface-hover)] transition-colors"
                style={{ borderColor: 'var(--border-input)' }}
              >
                Cancelar
              </button>
              <button
                form="modal-form-1"
                type="submit"
                className="px-6 py-2.5 rounded-xl text-white text-sm font-semibold cursor-pointer hover:brightness-105 transition-all"
                style={primaryActionStyle}
              >
                Criar
              </button>
            </div>
          }
        >
          <form
            id="modal-form-1"
            onSubmit={(event) => {
              event.preventDefault();
              void dialogAction.run(() => handleCreateFolder(event));
            }}
            className="p-6 md:p-7 space-y-5"
          >
            <div>
              <label htmlFor="field-1" className="text-xs font-semibold block mb-1.5">
                Nome do Caderno
              </label>
              <input
                id="field-1"
                type="text"
                required
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Ex: Projetos, Atas de Reunião..."
                className="w-full px-3.5 py-3 rounded-xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors"
                style={solidInputStyle}
              />
            </div>
          </form>
        </ModalShell>
      )}

      {/* MODAL: NOVA NOTA */}
      {isNoteModalOpen && (
        <ModalShell
          open
          description={<span className="text-xs font-semibold uppercase tracking-widest text-brand-panel">Rascunho</span>}
          title="Nova Anotação"
          onClose={() => setIsNoteModalOpen(false)}
          busy={dialogAction.pending}
          footer={
            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t" style={{ borderColor: 'var(--border-input)' }}>
              <button
                form="modal-form-2"
                type="button"
                onClick={() => setIsNoteModalOpen(false)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl border text-sm font-semibold cursor-pointer hover:bg-[var(--surface-hover)] transition-colors"
                style={{ borderColor: 'var(--border-input)' }}
              >
                Cancelar
              </button>
              <button
                form="modal-form-2"
                type="submit"
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl text-white text-sm font-semibold cursor-pointer hover:brightness-105 transition-all"
                style={primaryActionStyle}
              >
                Salvar Nota
              </button>
            </div>
          }
        >
          <form
            id="modal-form-2"
            onSubmit={(event) => {
              event.preventDefault();
              void dialogAction.run(() => handleCreateNote(event));
            }}
            className="p-6 md:p-7 overflow-y-auto custom-scrollbar space-y-5"
          >
            <div>
              <label htmlFor="field-2" className="text-xs font-semibold block mb-1.5">
                Título da Nota
              </label>
              <input
                id="field-2"
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Ex: Resumo da Reunião..."
                className="w-full px-3.5 py-3 rounded-xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors"
                style={solidInputStyle}
              />
            </div>

            <div>
              <label htmlFor="field-3" className="text-xs font-semibold block mb-1.5">
                Guardar no Caderno
              </label>
              <select
                id="field-3"
                value={newNoteFolder}
                onChange={(e) => setNewNoteFolder(e.target.value)}
                className="w-full px-3.5 py-3 rounded-xl border text-sm font-medium outline-none cursor-pointer focus:border-brand-panel transition-colors"
                style={solidInputStyle}
              >
                {folders.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="field-4" className="text-xs font-semibold block mb-1.5">
                Conteúdo (Opcional)
              </label>
              <textarea
                id="field-4"
                rows={4}
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Escreva os detalhes da nota aqui..."
                className="w-full px-3.5 py-3 rounded-xl border text-sm leading-relaxed outline-none resize-none focus:border-brand-panel transition-colors font-medium"
                style={solidInputStyle}
              />
            </div>
          </form>
        </ModalShell>
      )}

      {/* MODAL: CONFIRMAÇÃO DE EXCLUSÃO */}
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
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold cursor-pointer transition-colors shadow-sm"
              >
                Sim, Excluir
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
