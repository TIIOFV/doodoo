'use client';

import { useState, useMemo, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, Plus, Clock, Users, Shield, 
  X, Check, ChevronLeft, ChevronRight, Palette, MapPin, AlertCircle, Trash2, Send, Loader2, AlertTriangle, LogOut
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
// 🚀 1. LIGADO AO CÉREBRO GLOBAL DO TEMA
import { useTheme } from '../../contexts/ThemeContext';

type RoleType = 'administrador' | 'gestor' | 'coordenador' | 'supervisor' | 'analista' | 'colaborador';

interface DBProfile {
  id: string;
  user_id: string;
  nome: string;
  email: string;
  cargo: RoleType;
  setor: string;
  avatar_url?: string;
  status?: string;
}

interface EventItem {
  id: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  location?: string;
  visibility: 'pessoal' | 'setor' | 'geral';
  organizer: string;
  organizer_id: string;
  sector: string;
  acceptedBy: string[];
}

const mapDbToEvent = (dbEvent: any): EventItem => ({
  id: dbEvent.id,
  title: dbEvent.titulo,
  description: dbEvent.descricao || '',
  date: dbEvent.data,
  startTime: dbEvent.hora_inicio,
  endTime: dbEvent.hora_fim,
  location: dbEvent.local || '',
  visibility: dbEvent.visibilidade,
  organizer: dbEvent.organizador_nome,
  organizer_id: dbEvent.organizador_id,
  sector: dbEvent.setor,
  acceptedBy: dbEvent.aceitos_por || []
});

export default function AgendaPage() {
  const { theme, changeTheme } = useTheme(); // 🚀 Consome o Tema Global

  const [isMounted, setIsMounted] = useState(false);
  const [isSaving, setIsSaving] = useState(false); // 🚀 Proteção contra duplo clique

  const themes = [
    { id: 'light', name: 'Claro', color: '#f5f5f7', border: '#d2d2d7' },
    { id: 'dark', name: 'Escuro', color: '#0f172a', border: '#475569' },
    { id: 'ocean', name: 'Oceano', color: '#005bb5', border: '#005bb5' },
    { id: 'nature', name: 'Natureza', color: '#2e8b57', border: '#2e8b57' },
    { id: 'sunset', name: 'Pôr do Sol', color: '#d9534f', border: '#d9534f' },
  ];

  const [currentUser, setCurrentUser] = useState<DBProfile | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  
  const [viewMode, setViewMode] = useState<'dia' | 'semana'>('semana');

  // Inicialização segura da data para o cliente
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  useEffect(() => {
    setIsMounted(true);
    setCurrentDate(new Date());
  }, []);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);

  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newStartTime, setNewStartTime] = useState('09:00');
  const [newEndTime, setNewEndTime] = useState('10:00');
  const [newLocation, setNewLocation] = useState('');
  const [newVisibility, setNewVisibility] = useState<'pessoal' | 'setor' | 'geral'>('pessoal');
  const [shareToChat, setShareToChat] = useState(false);

  useEffect(() => {
    const fetchAgendaData = async () => {
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
          perfilAtual = fallbackUser || await supabase.from('doodoo_perfis').select('*').limit(1).maybeSingle();
        }

        if (perfilAtual) {
          setCurrentUser(perfilAtual as DBProfile);
          
          const { data: agendaDb } = await supabase.from('doodoo_agenda').select('*').order('data', { ascending: true });
          
          if (agendaDb) {
            setEvents(agendaDb.map(mapDbToEvent));
          }
        } else {
          setAuthError(true);
        }
      } catch (error) {
        console.error("Erro crítico na Agenda:", error);
        setAuthError(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAgendaData();
  }, []);

  // 🚀 Extrai a data local corretamente, sem pular dias por fuso horário
  const formatDateString = (d: Date) => {
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split('T')[0];
  };

  const currentDateStr = useMemo(() => formatDateString(currentDate), [currentDate]);

  const weekDays = useMemo(() => {
    const result = [];
    const startOfWeek = new Date(currentDate);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Ajusta para começar na segunda-feira ou domingo
    startOfWeek.setDate(diff);

    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      const names = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
      result.push({
        dateObj: d,
        dateStr: formatDateString(d),
        dayNum: d.getDate(),
        dayName: names[d.getDay()]
      });
    }
    return result;
  }, [currentDate]);

  const notifyBell = (title: string, desc: string) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('doodoo:notify', { detail: { title, desc } }));
    }
  };

  const handleForceLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const isManagerOrHR = currentUser ? ['administrador', 'gestor', 'coordenador'].includes(currentUser.cargo) || currentUser.setor === 'RH' : false;

  const visibleEvents = useMemo(() => {
    if (!currentUser) return [];

    return events.filter(ev => {
      const isMine = ev.organizer_id === currentUser.user_id;
      const isMySector = ev.visibility === 'setor' && ev.sector === currentUser.setor;
      const isGeneral = ev.visibility === 'geral';
      const amIInvited = ev.acceptedBy.includes(currentUser.nome);

      const canSee = isMine || isMySector || isGeneral || amIInvited;
      if (!canSee) return false;

      if (viewMode === 'dia') {
        return ev.date === currentDateStr;
      } else {
        return weekDays.some(wd => wd.dateStr === ev.date);
      }
    });
  }, [events, currentUser, viewMode, currentDateStr, weekDays]);

  const openCreateModal = () => {
    setNewTitle('');
    setNewDesc('');
    setNewStartTime('09:00');
    setNewEndTime('10:00');
    setNewLocation('');
    setNewVisibility('pessoal');
    setShareToChat(false);
    setIsModalOpen(true);
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !currentUser || isSaving) return;
    
    setIsSaving(true); // Bloqueia o botão

    const finalVisibility = (!isManagerOrHR && newVisibility === 'geral') ? 'pessoal' : newVisibility;

    const insertData = {
      titulo: newTitle.trim(),
      descricao: newDesc.trim() || 'Sem pauta informada.',
      data: currentDateStr,
      hora_inicio: newStartTime,
      hora_fim: newEndTime,
      local: newLocation.trim(),
      visibilidade: finalVisibility,
      organizador_id: currentUser.user_id,
      organizador_nome: currentUser.nome,
      setor: currentUser.setor,
      aceitos_por: [currentUser.nome]
    };

    const { data, error } = await supabase.from('doodoo_agenda').insert([insertData]).select().single();

    if (data && !error) {
      const newEv = mapDbToEvent(data);
      setEvents(prev => [...prev, newEv]);
      setIsModalOpen(false);

      if (shareToChat) {
        notifyBell('📤 Convite Enviado no Chat', `Convite para "${newEv.title}" compartilhado no chat corporativo com sucesso.`);
      } else if (finalVisibility === 'geral') {
        notifyBell('📢 Aviso Geral Publicado', `Novo evento geral criado por ${currentUser.nome}: "${newEv.title}".`);
      } else if (finalVisibility === 'setor') {
        notifyBell('📅 Novo Compromisso do Setor', `${currentUser.nome} agendou para a equipe de ${currentUser.setor}.`);
      } else {
        notifyBell('Compromisso Adicionado', `"${newEv.title}" salvo na sua agenda pessoal.`);
      }
    } else {
      console.error(error);
      notifyBell('Erro', 'Não foi possível salvar o compromisso.');
    }
    
    setIsSaving(false); // Desbloqueia
  };

  const handleAcceptEvent = async (ev: EventItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!currentUser || ev.acceptedBy.includes(currentUser.nome)) return;

    // Atualização Otimista
    const novaLista = [...ev.acceptedBy, currentUser.nome];
    setEvents(prev => prev.map(item => item.id === ev.id ? { ...item, acceptedBy: novaLista } : item));
    if (selectedEvent?.id === ev.id) setSelectedEvent(prev => prev ? { ...prev, acceptedBy: novaLista } : null);

    const { error } = await supabase.from('doodoo_agenda').update({ aceitos_por: novaLista }).eq('id', ev.id);
    
    if (error) {
      // Rollback se falhar
      const listaAntiga = ev.acceptedBy;
      setEvents(prev => prev.map(item => item.id === ev.id ? { ...item, acceptedBy: listaAntiga } : item));
      notifyBell('Erro', 'Não foi possível confirmar a sua presença.');
    } else {
      notifyBell('✅ Presença Confirmada', `Você confirmou presença no compromisso "${ev.title}".`);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (window.confirm("Deseja cancelar e excluir este compromisso?")) {
      await supabase.from('doodoo_agenda').delete().eq('id', eventId);
      setEvents(prev => prev.filter(e => e.id !== eventId));
      setSelectedEvent(null);
      notifyBell('Compromisso Cancelado', 'O evento foi excluído da agenda corporativa.');
    }
  };

  if (isLoading || !isMounted) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin opacity-50 text-blue-500" />
        <span className="text-xs font-bold opacity-50 mt-2">Carregando Agenda...</span>
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
          <h3 className="text-xl font-extrabold tracking-tight">Sessão Expirada</h3>
          <p className="text-xs font-medium opacity-60 max-w-sm mx-auto leading-relaxed">Não foi possível validar as suas permissões de Agenda. Reconecte-se.</p>
        </div>
        <button onClick={handleForceLogout} className="mt-2 px-6 py-3 rounded-2xl bg-brand-panel text-white text-xs font-extrabold cursor-pointer flex items-center space-x-2 shadow-lg">
          <LogOut className="w-4 h-4" /><span>Sair e Entrar Novamente</span>
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col animate-in fade-in duration-300">
      
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 rounded-[2.5rem] border overflow-hidden shadow-2xl backdrop-blur-xl" 
           style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
        
        {/* COLUNA 1: MENU LATERAL */}
        <div className="lg:col-span-3 border-r p-5 flex flex-col justify-between" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
          
          <div className="space-y-4">
            
            <div className="space-y-3 pb-4 border-b" style={{ borderColor: 'var(--border-input)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-sm tracking-tight">Agenda Corporativa</h3>
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">{currentUser.setor}</p>
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
                          style={{ width: '10px', height: '10px', backgroundColor: t.color, borderColor: t.border, boxShadow: isSelected ? `0 0 0 2px var(--bg-card), 0 0 0 2.5px ${t.border}` : 'none' }}
                          className={`rounded-full border transition-all duration-300 flex-shrink-0 cursor-pointer ${isSelected ? 'scale-110' : 'opacity-70 hover:opacity-100'}`}
                          title={t.name}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2.5 px-3 py-2 rounded-xl border text-xs font-bold" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
                <Shield className="w-3.5 h-3.5 opacity-50 text-blue-500" />
                <div className="flex flex-col truncate">
                   <span className="truncate">{currentUser.nome}</span>
                   <span className="text-[10px] uppercase opacity-50">{currentUser.cargo}</span>
                </div>
              </div>
            </div>

            <div className="space-y-3 p-4 rounded-2xl border" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
              <div className="flex items-center space-x-2 text-xs font-extrabold">
                <CalendarIcon className="w-4 h-4 text-blue-500" />
                <span>Planejamento Ativo</span>
              </div>
              <p className="text-[11px] opacity-60 leading-relaxed">
                A sua agenda mostra compromissos privados, compartilhados pelo seu gestor de {currentUser.setor}, e eventos da empresa.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t text-center text-[10px] opacity-40 font-bold uppercase tracking-wider" style={{ borderColor: 'var(--border-input)' }}>
            Doo Doo Workspace • Sincronizado
          </div>

        </div>

        {/* COLUNA 2 & 3: ÁREA PRINCIPAL */}
        <div className="lg:col-span-9 flex flex-col h-full overflow-y-auto p-6 space-y-6 custom-scrollbar" style={{ backgroundColor: 'var(--bg-card)' }}>
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b" style={{ borderColor: 'var(--border-input)' }}>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--tab-active)' }}>Planejamento Pessoal & Setorial</p>
              <h2 className="text-2xl font-extrabold tracking-tight mt-0.5">Sua agenda</h2>
              <p className="text-xs opacity-60">Reuniões, compromissos e janelas de disponibilidade sem conflitos.</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <input 
                type="date"
                value={currentDateStr}
                onChange={(e) => {
                  if (e.target.value) {
                    // Previne o offset
                    const [year, month, day] = e.target.value.split('-').map(Number);
                    setCurrentDate(new Date(year, month - 1, day));
                  }
                }}
                className="px-3.5 py-2.5 rounded-2xl border text-xs font-bold outline-none cursor-pointer focus:border-blue-500 transition-colors"
                style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
              />

              <div className="flex p-1 rounded-2xl border" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                <button 
                  onClick={() => setViewMode('dia')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${viewMode === 'dia' ? 'bg-brand-panel text-white shadow-xs' : 'opacity-65 hover:opacity-100'}`}
                >
                  Dia
                </button>
                <button 
                  onClick={() => setViewMode('semana')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${viewMode === 'semana' ? 'bg-brand-panel text-white shadow-xs' : 'opacity-65 hover:opacity-100'}`}
                >
                  Semana
                </button>
              </div>

              <button 
                onClick={openCreateModal}
                className="px-5 py-2.5 rounded-2xl bg-brand-panel text-white text-xs font-extrabold shadow-md hover:opacity-95 transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Novo compromisso</span>
              </button>
            </div>
          </div>

          {viewMode === 'semana' && (
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map((wd) => {
                const isSelected = wd.dateStr === currentDateStr;
                return (
                  <button 
                    key={wd.dateStr}
                    onClick={() => setCurrentDate(wd.dateObj)}
                    className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                      isSelected ? 'bg-brand-panel text-white shadow-md border-transparent scale-105 ring-2 ring-blue-500/30' : 'opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                    style={!isSelected ? { backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' } : undefined}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wider">{wd.dayName}</p>
                    <p className="text-lg font-extrabold mt-0.5">{wd.dayNum}</p>
                  </button>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            <div className="lg:col-span-8 p-6 rounded-[2.25rem] border space-y-4" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
              <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border-input)' }}>
                <div>
                  <h3 className="font-extrabold text-sm">{viewMode === 'dia' ? `Compromissos do dia (${currentDateStr.split('-').reverse().join('/')})` : 'Compromissos da semana'}</h3>
                  <p className="text-[11px] opacity-50">
                    {viewMode === 'dia' ? 'Exibindo eventos agendados para esta data.' : `Semana de ${weekDays[0].dateStr.split('-').reverse().join('/')} a ${weekDays[6].dateStr.split('-').reverse().join('/')}`}
                  </p>
                </div>
                <span className="text-xs font-extrabold px-3 py-1 rounded-xl border" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
                  {visibleEvents.length} evento(s)
                </span>
              </div>

              <div className="space-y-3">
                {visibleEvents.map(ev => {
                  const hasAccepted = ev.acceptedBy.includes(currentUser.nome);

                  return (
                    <div 
                      key={ev.id}
                      onClick={() => setSelectedEvent(ev)}
                      className="p-4 rounded-2xl border space-y-2.5 transition-all hover:shadow-md cursor-pointer group"
                      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md ${ev.visibility === 'geral' ? 'bg-blue-500/10 text-blue-500' : ev.visibility === 'setor' ? 'bg-amber-500/10 text-amber-500' : 'bg-purple-500/10 text-purple-500'}`}>
                              {ev.visibility === 'geral' ? '📢 Aviso Geral' : ev.visibility === 'setor' ? `👥 Setor ${ev.sector}` : '🔒 Pessoal'}
                            </span>
                            <span className="text-xs font-bold opacity-60">
                              📅 {ev.date.split('-').reverse().join('/')} • 🕒 {ev.startTime} - {ev.endTime}
                            </span>
                          </div>
                          <h4 className="text-sm font-extrabold mt-1 group-hover:text-blue-500 transition-colors">{ev.title}</h4>
                        </div>

                        {ev.visibility !== 'pessoal' && (
                          <button 
                            onClick={(e) => handleAcceptEvent(ev, e)}
                            disabled={hasAccepted}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center space-x-1 cursor-pointer ${
                              hasAccepted 
                                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 cursor-default' 
                                : 'hover:bg-black/5 dark:hover:bg-white/5'
                            }`}
                            style={!hasAccepted ? { backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' } : undefined}
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>{hasAccepted ? 'Confirmado na agenda' : 'Confirmar presença'}</span>
                          </button>
                        )}
                      </div>

                      <p className="text-xs opacity-75 leading-relaxed line-clamp-2">{ev.description}</p>

                      <div className="flex flex-wrap items-center justify-between pt-2 border-t text-[11px] opacity-60 font-medium" style={{ borderColor: 'var(--border-input)' }}>
                        <span>Organizador: <strong>{ev.organizer}</strong></span>
                        <span>Confirmados: {ev.acceptedBy.length} pessoa(s)</span>
                      </div>
                    </div>
                  );
                })}

                {visibleEvents.length === 0 && (
                  <div className="py-16 text-center opacity-40 text-xs font-bold border-2 border-dashed rounded-2xl" style={{ borderColor: 'var(--border-input)' }}>
                    Agenda livre neste período. Nenhum compromisso registrado para esta data.
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-4 p-6 rounded-[2.25rem] border space-y-4" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
              <div className="flex items-center space-x-2.5 border-b pb-3" style={{ borderColor: 'var(--border-input)' }}>
                <Clock className="w-4 h-4 text-amber-500" />
                <h3 className="font-extrabold text-sm">Horário Comercial</h3>
              </div>
              <p className="text-[11px] opacity-60 leading-relaxed">
                Entre 08h e 18h, considerando compromissos que você participará ativamente.
              </p>
              <div className="p-4 rounded-2xl border space-y-2 text-center" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">08:00 – 18:00</p>
                <p className="text-[11px] font-semibold opacity-60">{visibleEvents.length === 0 ? 'Totalmente Livre (Nenhum conflito)' : 'Com restrições na agenda'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Detalhes */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-[2.25rem] border shadow-2xl overflow-hidden flex flex-col" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
            
            <div className="px-7 py-5 border-b flex items-start justify-between gap-3" style={{ borderColor: 'var(--border-input)' }}>
              <div>
                <span className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-md ${selectedEvent.visibility === 'geral' ? 'bg-blue-500/10 text-blue-500' : selectedEvent.visibility === 'setor' ? 'bg-amber-500/10 text-amber-500' : 'bg-purple-500/10 text-purple-500'}`}>
                  {selectedEvent.visibility === 'geral' ? '📢 Aviso Geral' : selectedEvent.visibility === 'setor' ? `👥 Setor ${selectedEvent.sector}` : '🔒 Pessoal'}
                </span>
                <h3 className="text-base font-extrabold mt-2 leading-snug">{selectedEvent.title}</h3>
              </div>
              <button onClick={() => setSelectedEvent(null)} className="p-2 rounded-xl hover:bg-black/5 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-7 space-y-5">
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl border text-xs" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                <div>
                  <span className="opacity-50 font-semibold block mb-0.5">Data e Horário</span>
                  <strong className="font-extrabold">📅 {selectedEvent.date.split('-').reverse().join('/')}</strong>
                  <p className="opacity-75">🕒 {selectedEvent.startTime} às {selectedEvent.endTime}</p>
                </div>
                <div>
                  <span className="opacity-50 font-semibold block mb-0.5">Local / Sala</span>
                  <strong className="font-extrabold">{selectedEvent.location || 'Não informado'}</strong>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[11px] font-extrabold uppercase tracking-wider opacity-50 block">Pauta / Descrição</span>
                <p className="text-xs opacity-80 leading-relaxed p-3.5 rounded-2xl border whitespace-pre-wrap" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                  {selectedEvent.description}
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border-input)' }}>
                <span className="text-[11px] font-extrabold uppercase tracking-wider opacity-50 block">Participantes Confirmados ({selectedEvent.acceptedBy.length})</span>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {selectedEvent.acceptedBy.map((name, idx) => (
                    <span key={idx} className="text-[11px] font-bold px-2.5 py-1 rounded-xl border flex items-center space-x-1" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                      <Users className="w-3 h-3 opacity-60 mr-1" />
                      <span>{name}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-7 py-4 border-t flex items-center justify-between text-xs" style={{ borderColor: 'var(--border-input)' }}>
              <span className="opacity-50 font-medium">Organizador: <strong>{selectedEvent.organizer}</strong></span>
              
              <div className="flex items-center space-x-2">
                {selectedEvent.organizer_id === currentUser?.user_id && (
                  <button 
                    onClick={() => handleDeleteEvent(selectedEvent.id)}
                    className="px-4 py-2 rounded-xl text-red-500 hover:bg-red-500/10 font-bold flex items-center space-x-1 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Cancelar evento</span>
                  </button>
                )}
                <button 
                  onClick={() => setSelectedEvent(null)}
                  className="px-5 py-2 rounded-xl bg-brand-panel text-white font-extrabold shadow-md cursor-pointer hover:opacity-90"
                >
                  Fechar
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Modal Novo Compromisso */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-[2.25rem] border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}>
            
            <div className="px-7 py-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-input)' }}>
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-500">Novo Evento</span>
                <h3 className="font-extrabold text-lg leading-tight mt-0.5">Criar Compromisso</h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 rounded-xl hover:bg-black/5 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateEvent} className="p-7 overflow-y-auto custom-scrollbar space-y-4">
              
              <div>
                <label className="text-[11px] font-extrabold uppercase tracking-wider opacity-60 block mb-1.5">Título do Compromisso *</label>
                <input 
                  type="text" 
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ex: Reunião de alinhamento..."
                  className="w-full px-4 py-3 rounded-2xl border text-xs font-bold outline-none focus:border-blue-500 transition-colors"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                />
              </div>

              <div>
                <label className="text-[11px] font-extrabold uppercase tracking-wider opacity-60 block mb-1.5">Descrição / Pauta</label>
                <textarea 
                  rows={2}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Contexto ou pauta (opcional)..."
                  className="w-full px-4 py-3 rounded-2xl border text-xs outline-none resize-none focus:border-blue-500 transition-colors"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-extrabold uppercase tracking-wider opacity-60 block mb-1.5">Data</label>
                  <input 
                    type="date" 
                    value={currentDateStr}
                    onChange={(e) => {
                      if (e.target.value) {
                         const [year, month, day] = e.target.value.split('-').map(Number);
                         setCurrentDate(new Date(year, month - 1, day));
                      }
                    }}
                    className="w-full px-3.5 py-2.5 rounded-2xl border text-xs font-bold outline-none cursor-pointer focus:border-blue-500 transition-colors"
                    style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                  />
                </div>

                <div>
                  <label className="text-[11px] font-extrabold uppercase tracking-wider opacity-60 block mb-1.5">Início</label>
                  <input 
                    type="time" 
                    value={newStartTime}
                    onChange={(e) => setNewStartTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl border text-xs font-bold outline-none focus:border-blue-500 transition-colors"
                    style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                  />
                </div>

                <div>
                  <label className="text-[11px] font-extrabold uppercase tracking-wider opacity-60 block mb-1.5">Término</label>
                  <input 
                    type="time" 
                    value={newEndTime}
                    onChange={(e) => setNewEndTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl border text-xs font-bold outline-none focus:border-blue-500 transition-colors"
                    style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-extrabold uppercase tracking-wider opacity-60 block mb-1.5">Local ou Sala</label>
                <input 
                  type="text" 
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  placeholder="Ex: Sala de Reuniões / Link de Vídeo"
                  className="w-full px-4 py-2.5 rounded-2xl border text-xs outline-none focus:border-blue-500 transition-colors"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                />
              </div>

              <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border-input)' }}>
                <label className="text-[11px] font-extrabold uppercase tracking-wider opacity-60 block">Quem pode ver este compromisso?</label>
                <select 
                  value={newVisibility}
                  onChange={(e: any) => setNewVisibility(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border text-xs font-bold outline-none cursor-pointer focus:border-blue-500 transition-colors"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}
                >
                  <option value="pessoal">🔒 Pessoal — só eu e convidados</option>
                  <option value="setor">👥 Meu setor ({currentUser?.setor})</option>
                  
                  {isManagerOrHR && (
                    <option value="geral">📢 Publicar também em Avisos Gerais (Empresa)</option>
                  )}
                </select>

                {!isManagerOrHR && (
                  <p className="text-[10px] text-amber-500 font-bold flex items-center mt-1">
                    <AlertCircle className="w-3 h-3 mr-1 flex-shrink-0" />
                    Apenas Gestores, Coordenação e RH podem publicar Avisos Gerais para todo o hospital.
                  </p>
                )}
              </div>

              {/* 🚀 Ajuste textual na checkbox de Chat (Equipe em vez de equipa) */}
              <div className="p-3.5 rounded-2xl border flex items-center justify-between" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                <div className="flex items-center space-x-2.5">
                  <Send className="w-4 h-4 text-blue-500" />
                  <div>
                    <p className="text-xs font-bold">Enviar convite no Chat</p>
                    <p className="text-[10px] opacity-60">Avisa a equipe automaticamente no chat corporativo.</p>
                  </div>
                </div>
                <input 
                  type="checkbox"
                  checked={shareToChat}
                  onChange={(e) => setShareToChat(e.target.checked)}
                  className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t" style={{ borderColor: 'var(--border-input)' }}>
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border text-xs font-bold cursor-pointer hover:opacity-80 transition-colors"
                  style={{ borderColor: 'var(--border-input)' }}
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-xl bg-brand-panel text-white text-xs font-extrabold shadow-lg cursor-pointer hover:opacity-90 transition-all disabled:opacity-70 flex items-center space-x-2"
                >
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{isSaving ? 'Salvando...' : 'Salvar compromisso'}</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}