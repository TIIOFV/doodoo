'use client';

import { useState, useMemo, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, Plus, Clock, Users, Shield, 
  X, Check, AlertCircle, Trash2, Send, Loader2, AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

type RoleType = 'administrador' | 'gestor' | 'coordenador' | 'supervisor' | 'analista' | 'colaborador';
interface DBProfile { id: string; user_id: string; nome: string; email: string; cargo: RoleType; setor: string; avatar_url?: string; status?: string; }
interface EventItem { id: string; title: string; description: string; date: string; startTime: string; endTime: string; location?: string; visibility: 'pessoal' | 'setor' | 'geral'; organizer: string; organizer_id: string; sector: string; acceptedBy: string[]; }

const mapDbToEvent = (dbEvent: any): EventItem => ({
  id: dbEvent.id, title: dbEvent.titulo, description: dbEvent.descricao || '', date: dbEvent.data, startTime: dbEvent.hora_inicio, endTime: dbEvent.hora_fim,
  location: dbEvent.local || '', visibility: dbEvent.visibilidade, organizer: dbEvent.organizador_nome, organizer_id: dbEvent.organizador_id, sector: dbEvent.setor, acceptedBy: dbEvent.aceitos_por || []
});

export default function AgendaPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [currentUser, setCurrentUser] = useState<DBProfile | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [viewMode, setViewMode] = useState<'dia' | 'semana'>('semana');
  // 🚀 Inicializa a data como null ou define via useEffect para evitar erro de prerender do Next.js
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date(2026, 0, 1)); // Data segura de fallback

  useEffect(() => {
    setCurrentDate(new Date()); // Define a data real assim que monta no cliente
  }, []);

  const glassContainerStyle = { backgroundColor: 'color-mix(in srgb, var(--bg-card) 50%, transparent)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', border: '1px solid color-mix(in srgb, var(--border-input) 40%, transparent)', boxShadow: '0 12px 40px rgba(0, 0, 0, 0.08)' };
  const glassSidebarStyle = { backgroundColor: 'color-mix(in srgb, var(--bg-input) 30%, transparent)', borderRight: '1px solid color-mix(in srgb, var(--border-input) 40%, transparent)' };
  const glassItemStyle = { backgroundColor: 'color-mix(in srgb, var(--bg-card) 70%, transparent)', border: '1px solid color-mix(in srgb, var(--border-input) 50%, transparent)' };
  const solidCardStyle = { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-input)', boxShadow: '0 12px 40px rgba(0, 0, 0, 0.15)' };
  const solidInputStyle = { backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-main)' };

  useEffect(() => { setIsMounted(true); setCurrentDate(new Date()); }, []);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  
  // States do Formulário
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
        if (!session?.user) { setIsLoading(false); return; }
        
        const { data: perfilAtual } = await supabase.from('doodoo_perfis').select('*').eq('user_id', session.user.id).single();
        if (perfilAtual) {
          setCurrentUser(perfilAtual as DBProfile);
          const { data: agendaDb } = await supabase.from('doodoo_agenda').select('*').order('data', { ascending: true });
          if (agendaDb) setEvents(agendaDb.map(mapDbToEvent));
        }
      } catch (error) { console.error(error); } finally { setIsLoading(false); }
    };
    fetchAgendaData();
  }, []);

  const formatDateString = (d: Date) => {
    const year = d.getFullYear(); const month = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const currentDateStr = useMemo(() => formatDateString(currentDate), [currentDate]);

  const weekDays = useMemo(() => {
    const result = []; 
    const startOfWeek = new Date(currentDate); 
    startOfWeek.setHours(0, 0, 0, 0); 
    const day = startOfWeek.getDay(); 
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek); d.setDate(startOfWeek.getDate() + i);
      const names = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      result.push({ dateObj: d, dateStr: formatDateString(d), dayNum: d.getDate(), dayName: names[d.getDay()] });
    }
    return result;
  }, [currentDate]);

  const changeWeek = (direction: 'next' | 'prev') => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + (direction === 'next' ? 7 : -7));
    setCurrentDate(newDate);
  };

  const notifyBell = (title: string, desc: string) => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('doodoo:notify', { detail: { title, desc } })); };

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
      
      if (viewMode === 'dia') return ev.date === currentDateStr;
      return weekDays.some(wd => wd.dateStr === ev.date);
    });
  }, [events, currentUser, viewMode, currentDateStr, weekDays]);

  const openCreateModal = () => { setNewTitle(''); setNewDesc(''); setNewStartTime('09:00'); setNewEndTime('10:00'); setNewLocation(''); setNewVisibility('pessoal'); setShareToChat(false); setIsModalOpen(true); };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !currentUser || isSaving) return;
    setIsSaving(true);
    
    const finalVisibility = (!isManagerOrHR && newVisibility === 'geral') ? 'pessoal' : newVisibility;
    const insertData = {
      titulo: newTitle.trim(),
      descricao: newDesc.trim() || 'Sem pauta informada.',
      data: currentDateStr, // Grava na data que está selecionada no momento
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
      
      if (shareToChat && finalVisibility !== 'pessoal') {
         const isGeral = finalVisibility === 'geral';
         
         let channelQuery = supabase.from('doodoo_canais').select('id').eq('is_group', true);
         if (isGeral) channelQuery = channelQuery.eq('nome', 'Geral');
         else channelQuery = channelQuery.eq('setor', currentUser.setor);

         const { data: channelData } = await channelQuery.maybeSingle();

         if (channelData) {
            await supabase.from('doodoo_mensagens').insert([{
               canal_id: channelData.id,
               sender_id: currentUser.user_id,
               sender_nome: currentUser.nome,
               texto: `Reunião Agendada: ${newEv.title}`,
               tipo: 'event',
               metadata: {
                  eventDetails: { title: newEv.title, date: newEv.date.split('-').reverse().join('/'), time: newEv.startTime, location: newEv.location },
                  acceptedBy: [currentUser.nome],
                  lidoPor: [currentUser.nome]
               }
            }]);
            notifyBell('🎯 Convite Enviado', `Convite postado no canal ${isGeral ? 'Geral' : currentUser.setor}.`);
         } else {
            notifyBell('Aviso', 'Compromisso salvo, mas não conseguimos encontrar o canal de Chat para publicar.');
         }
      } else {
         notifyBell('Compromisso Adicionado', `"${newEv.title}" salvo com sucesso.`);
      }
    } else {
      notifyBell('Erro', 'Não foi possível salvar o compromisso.');
    }
    setIsSaving(false);
  };

  const handleAcceptEvent = async (ev: EventItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!currentUser || ev.acceptedBy.includes(currentUser.nome)) return;
    const novaLista = [...ev.acceptedBy, currentUser.nome];
    setEvents(prev => prev.map(item => item.id === ev.id ? { ...item, acceptedBy: novaLista } : item));
    if (selectedEvent?.id === ev.id) setSelectedEvent(prev => prev ? { ...prev, acceptedBy: novaLista } : null);
    
    const { error } = await supabase.from('doodoo_agenda').update({ aceitos_por: novaLista }).eq('id', ev.id);
    
    if (error) {
      const listaAntiga = ev.acceptedBy;
      setEvents(prev => prev.map(item => item.id === ev.id ? { ...item, acceptedBy: listaAntiga } : item));
      notifyBell('Erro', 'Não foi possível confirmar presença.');
    } else {
      notifyBell('Presença Confirmada', `Você confirmou presença em "${ev.title}".`);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (window.confirm("Deseja cancelar e excluir este compromisso?")) {
      await supabase.from('doodoo_agenda').delete().eq('id', eventId);
      setEvents(prev => prev.filter(e => e.id !== eventId));
      setSelectedEvent(null);
      notifyBell('Cancelado', 'O compromisso foi removido da agenda.');
    }
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
      
      <div className="flex-1 flex flex-col lg:flex-row rounded-t-[2rem] rounded-bl-none rounded-br-none md:rounded-[2.5rem] border-t border-l-0 border-r-0 border-b-0 md:border overflow-hidden relative z-10" style={glassContainerStyle}>
        
        {/* ==========================================================
            COLUNA 1: MENU LATERAL (Apenas Desktop - App Like)
            ========================================================== */}
        <div className="hidden lg:flex flex-col w-[320px] flex-shrink-0" style={glassSidebarStyle}>
          <div className="p-6 md:p-8 space-y-8 flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
            
            <div className="pb-5 border-b" style={{ borderColor: 'color-mix(in srgb, var(--border-input) 40%, transparent)' }}>
              <h3 className="font-extrabold text-base tracking-tight">Agenda Corporativa</h3>
              <p className="text-[10px] font-bold uppercase tracking-widest text-brand-panel mt-1">Setor {currentUser?.setor}</p>
            </div>

            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-2xl bg-brand-panel flex items-center justify-center text-white shadow-md flex-shrink-0">
                <Shield className="w-6 h-6" />
              </div>
              <div className="overflow-hidden">
                <h3 className="font-extrabold text-[15px] tracking-tight truncate">{currentUser?.nome}</h3>
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 truncate mt-0.5">{currentUser?.cargo}</p>
              </div>
            </div>

            <div className="space-y-4 p-5 rounded-3xl" style={glassItemStyle}>
              <div className="flex items-center space-x-2.5 text-xs font-extrabold">
                <CalendarIcon className="w-5 h-5 text-brand-panel" />
                <span>Planejamento Ativo</span>
              </div>
              <p className="text-[11px] opacity-70 leading-relaxed font-medium">
                A sua agenda mostra compromissos privados, compartilhados pelo gestor de {currentUser?.setor}, e os eventos gerais da empresa.
              </p>
            </div>
            
            <div className="space-y-4 p-5 rounded-3xl" style={glassItemStyle}>
              <div className="flex items-center space-x-2.5 text-xs font-extrabold">
                <Clock className="w-5 h-5 text-amber-500" />
                <span>Horário Comercial</span>
              </div>
              <p className="text-[11px] opacity-70 leading-relaxed font-medium">
                O seu expediente decorre das <strong>08:00 às 18:00</strong>. Certifique-se de manter os compromissos neste intervalo.
              </p>
            </div>
          </div>
        </div>

        {/* ==========================================================
            COLUNA 2: ÁREA DO CALENDÁRIO E EVENTOS
            ========================================================== */}
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          
          <div className="p-5 md:p-8 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4 md:gap-0 flex-shrink-0" style={{ borderColor: 'color-mix(in srgb, var(--border-input) 40%, transparent)' }}>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-panel mb-1">Doo Doo Workspace</p>
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">A sua Agenda</h2>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <input 
                type="date"
                value={currentDateStr}
                onChange={(e) => {
                  if (e.target.value) {
                    const [year, month, day] = e.target.value.split('-').map(Number);
                    setCurrentDate(new Date(year, month - 1, day));
                    setViewMode('dia'); // Se escolher a data fixa, salta para o modo Dia
                  }
                }}
                className="flex-1 sm:flex-none px-4 py-3.5 rounded-2xl border text-[13px] font-bold outline-none cursor-pointer focus:border-brand-panel transition-colors"
                style={solidInputStyle}
              />
              <div className="flex p-1.5 rounded-2xl border" style={solidInputStyle}>
                <button 
                  onClick={() => setViewMode('dia')}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${viewMode === 'dia' ? 'bg-brand-panel text-white shadow-sm' : 'opacity-60 hover:opacity-100'}`}
                >
                  Dia
                </button>
                <button 
                  onClick={() => setViewMode('semana')}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${viewMode === 'semana' ? 'bg-brand-panel text-white shadow-sm' : 'opacity-60 hover:opacity-100'}`}
                >
                  Semana
                </button>
              </div>
              <button 
                onClick={openCreateModal}
                className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-brand-panel text-white text-[13px] font-extrabold shadow-lg hover:opacity-90 active:scale-95 transition-all flex items-center justify-center space-x-2 cursor-pointer"
              >
                <Plus className="w-5 h-5" />
                <span>Novo Evento</span>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 md:p-8 space-y-6 md:space-y-8 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
            
            {/* 🚀 BARRA DE DIAS DA SEMANA (Navegável e Clickável) */}
            <div className="flex items-center space-x-3 mb-6">
               <button onClick={() => changeWeek('prev')} className="p-3 rounded-2xl border transition-colors cursor-pointer hover:bg-black/5 dark:hover:bg-white/5" style={solidInputStyle}>
                  <ChevronLeft className="w-5 h-5" />
               </button>
               
               <div className="flex-1 grid grid-cols-7 gap-1.5 md:gap-3">
                  {weekDays.map((wd) => {
                     const isSelected = wd.dateStr === currentDateStr && viewMode === 'dia';
                     const isToday = wd.dateStr === formatDateString(new Date());

                     return (
                     <button 
                        key={wd.dateStr}
                        onClick={() => { setCurrentDate(wd.dateObj); setViewMode('dia'); }}
                        className={`py-3 md:py-4 rounded-xl md:rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                           isSelected ? 'bg-brand-panel text-white shadow-lg border-transparent scale-105' : 'hover:scale-[1.02]'
                        }`}
                        style={!isSelected ? glassItemStyle : undefined}
                     >
                        <span className={`text-[9px] md:text-[11px] font-extrabold uppercase tracking-widest ${isToday && !isSelected ? 'text-brand-panel' : ''}`}>{wd.dayName}</span>
                        <span className={`text-base md:text-xl font-extrabold mt-0.5 ${isToday && !isSelected ? 'text-brand-panel' : ''}`}>{wd.dayNum}</span>
                        {/* Pontinho Azul se houver eventos neste dia */}
                        {events.some(e => e.date === wd.dateStr) && (
                           <span className={`w-1.5 h-1.5 rounded-full mt-1.5 ${isSelected ? 'bg-white' : 'bg-brand-panel'}`}></span>
                        )}
                     </button>
                     );
                  })}
               </div>

               <button onClick={() => changeWeek('next')} className="p-3 rounded-2xl border transition-colors cursor-pointer hover:bg-black/5 dark:hover:bg-white/5" style={solidInputStyle}>
                  <ChevronRight className="w-5 h-5" />
               </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'color-mix(in srgb, var(--border-input) 40%, transparent)' }}>
                <div>
                  <h3 className="font-extrabold text-sm md:text-base">{viewMode === 'dia' ? `Agenda de ${currentDateStr.split('-').reverse().join('/')}` : 'Eventos da Semana'}</h3>
                  <p className="text-[11px] font-semibold opacity-50 mt-1">
                    {viewMode === 'dia' ? 'Exibindo 1 dia' : `De ${weekDays[0].dateStr.split('-').reverse().join('/')} a ${weekDays[6].dateStr.split('-').reverse().join('/')}`}
                  </p>
                </div>
                <span className="text-[11px] font-extrabold px-3.5 py-1.5 rounded-xl border shadow-sm" style={glassItemStyle}>
                  {visibleEvents.length} eventos
                </span>
              </div>

              <div className="space-y-3">
                {visibleEvents.map(ev => {
                  const hasAccepted = ev.acceptedBy.includes(currentUser?.nome || '');
                  return (
                    <div 
                      key={ev.id}
                      onClick={() => setSelectedEvent(ev)}
                      className="p-5 md:p-6 rounded-3xl border transition-all hover:shadow-lg cursor-pointer group"
                      style={glassItemStyle}
                    >
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2.5">
                            <span className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-lg shadow-sm ${ev.visibility === 'geral' ? 'bg-blue-500/10 text-blue-500' : ev.visibility === 'setor' ? 'bg-amber-500/10 text-amber-500' : 'bg-purple-500/10 text-purple-500'}`}>
                              {ev.visibility === 'geral' ? '🚀 Geral' : ev.visibility === 'setor' ? `👥 ${ev.sector}` : '👤 Pessoal'}
                            </span>
                            <span className="text-[11px] md:text-xs font-bold opacity-60 flex items-center">
                              <CalendarIcon className="w-3.5 h-3.5 mr-1.5" /> {ev.date.split('-').reverse().join('/')}
                            </span>
                            <span className="text-[11px] md:text-xs font-bold opacity-60 flex items-center">
                              <Clock className="w-3.5 h-3.5 mr-1.5" /> {ev.startTime} - {ev.endTime}
                            </span>
                          </div>
                          
                          <h4 className="text-[15px] md:text-lg font-extrabold leading-snug group-hover:text-brand-panel transition-colors break-words whitespace-normal">{ev.title}</h4>
                          <p className="text-[13px] opacity-70 leading-relaxed mt-2 line-clamp-2 font-medium">{ev.description}</p>
                        </div>
                        
                        {ev.visibility !== 'pessoal' && (
                          <button 
                            onClick={(e) => handleAcceptEvent(ev, e)}
                            disabled={hasAccepted}
                            className={`px-4 py-2.5 rounded-xl text-[11px] font-extrabold border transition-all flex items-center justify-center space-x-1.5 cursor-pointer flex-shrink-0 ${hasAccepted ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 shadow-sm cursor-default' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
                            style={!hasAccepted ? { backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' } : undefined}
                          >
                            <Check className="w-4 h-4" />
                            <span>{hasAccepted ? 'Presença Confirmada' : 'Aceitar Convite'}</span>
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-between pt-4 mt-4 border-t text-[11px] opacity-60 font-bold" style={{ borderColor: 'color-mix(in srgb, var(--border-input) 40%, transparent)' }}>
                        <span className="flex items-center"><Shield className="w-3.5 h-3.5 mr-1.5" /> Org: {ev.organizer}</span>
                        <span className="flex items-center mt-2 sm:mt-0"><Users className="w-3.5 h-3.5 mr-1.5" /> {ev.acceptedBy.length} Confirmado(s)</span>
                      </div>
                    </div>
                  );
                })}

                {visibleEvents.length === 0 && (
                  <div className="py-20 text-center opacity-40 space-y-4">
                    <CalendarIcon className="w-12 h-12 mx-auto stroke-1" />
                    <p className="text-sm font-bold">Nenhum compromisso agendado.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* MODAL DETALHES Z-[999] */}
      {selectedEvent && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-[2.5rem] border shadow-2xl overflow-hidden flex flex-col" style={solidCardStyle}>
            
            <div className="px-6 md:px-8 py-6 border-b flex items-start justify-between gap-3" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-input)' }}>
              <div className="flex-1 min-w-0">
                <span className={`text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-lg ${selectedEvent.visibility === 'geral' ? 'bg-blue-500/10 text-blue-500' : selectedEvent.visibility === 'setor' ? 'bg-amber-500/10 text-amber-500' : 'bg-purple-500/10 text-purple-500'}`}>
                  {selectedEvent.visibility === 'geral' ? '🚀 Empresa' : selectedEvent.visibility === 'setor' ? `👥 Setor ${selectedEvent.sector}` : '👤 Pessoal'}
                </span>
                <h3 className="text-lg md:text-xl font-extrabold mt-3 leading-tight break-words whitespace-normal">{selectedEvent.title}</h3>
              </div>
              <button onClick={() => setSelectedEvent(null)} className="p-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors flex-shrink-0">
                <X className="w-5 h-5 md:w-6 md:h-6" />
              </button>
            </div>

            <div className="p-6 md:p-8 space-y-6 overflow-y-auto max-h-[60vh] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
              <div className="grid grid-cols-2 gap-4 p-5 rounded-3xl border text-xs" style={solidInputStyle}>
                <div>
                  <span className="opacity-50 font-extrabold uppercase tracking-widest block mb-2 text-[10px]">Horário</span>
                  <strong className="font-extrabold text-[13px] block mb-1">{selectedEvent.date.split('-').reverse().join('/')}</strong>
                  <p className="opacity-75 font-semibold text-[11px]">{selectedEvent.startTime} - {selectedEvent.endTime}</p>
                </div>
                <div>
                  <span className="opacity-50 font-extrabold uppercase tracking-widest block mb-2 text-[10px]">Local</span>
                  <strong className="font-extrabold text-[13px]">{selectedEvent.location || 'Não definido'}</strong>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest opacity-50 block">Descrição da Pauta</span>
                <p className="text-[13px] opacity-80 leading-relaxed p-5 rounded-3xl border whitespace-pre-wrap font-medium" style={solidInputStyle}>
                  {selectedEvent.description}
                </p>
              </div>

              <div className="space-y-3 pt-4 border-t" style={{ borderColor: 'var(--border-input)' }}>
                <span className="text-[10px] font-extrabold uppercase tracking-widest opacity-50 block">Presenças ({selectedEvent.acceptedBy.length})</span>
                <div className="flex flex-wrap gap-2">
                  {selectedEvent.acceptedBy.map((name, idx) => (
                    <span key={idx} className="text-[11px] font-bold px-3 py-1.5 rounded-xl border flex items-center space-x-1.5" style={solidInputStyle}>
                      <Users className="w-3.5 h-3.5 opacity-60" />
                      <span>{name}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 md:px-8 py-5 border-t flex flex-col sm:flex-row items-center justify-between text-xs gap-4 sm:gap-0" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-input)' }}>
              <span className="opacity-60 font-bold w-full sm:w-auto text-center sm:text-left text-[11px]">Agendado por <strong className="opacity-100">{selectedEvent.organizer}</strong></span>
              
              <div className="flex items-center space-x-3 w-full sm:w-auto">
                {selectedEvent.organizer_id === currentUser?.user_id && (
                  <button 
                    onClick={() => handleDeleteEvent(selectedEvent.id)}
                    className="flex-1 sm:flex-none justify-center px-5 py-3.5 rounded-xl text-red-500 hover:bg-red-500/10 font-bold flex items-center space-x-1.5 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Excluir</span>
                  </button>
                )}
                <button 
                  onClick={() => setSelectedEvent(null)}
                  className="flex-1 sm:flex-none justify-center px-6 py-3.5 rounded-xl bg-brand-panel text-white font-extrabold shadow-md cursor-pointer hover:opacity-90 active:scale-95 transition-transform"
                >
                  Fechar Menu
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* MODAL CRIAR NOVO COMPROMISSO Z-[999] */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-[2.5rem] border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" style={solidCardStyle}>
            
            <div className="px-6 md:px-8 py-6 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-input)' }}>
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-panel">Formulário</span>
                <h3 className="font-extrabold text-lg md:text-xl leading-tight mt-1">Novo Compromisso</h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateEvent} className="p-6 md:p-8 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] space-y-5">
              
              <div>
                <label className="text-[11px] font-extrabold uppercase tracking-widest opacity-60 block mb-2">Título do Evento *</label>
                <input 
                  type="text" 
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ex: Alinhamento Semanal..."
                  className="w-full px-4 py-3.5 rounded-2xl border text-[13px] font-bold outline-none focus:border-brand-panel transition-colors"
                  style={solidInputStyle}
                />
              </div>

              <div>
                <label className="text-[11px] font-extrabold uppercase tracking-widest opacity-60 block mb-2">Pauta (Opcional)</label>
                <textarea 
                  rows={2}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Escreva sobre o que será tratado..."
                  className="w-full px-4 py-3.5 rounded-2xl border text-[13px] outline-none resize-none focus:border-brand-panel transition-colors font-medium"
                  style={solidInputStyle}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-extrabold uppercase tracking-widest opacity-60 block mb-2">Data</label>
                  <input 
                    type="date" 
                    value={currentDateStr}
                    onChange={(e) => {
                      if (e.target.value) {
                        const [year, month, day] = e.target.value.split('-').map(Number);
                        setCurrentDate(new Date(year, month - 1, day));
                      }
                    }}
                    className="w-full px-4 py-3.5 rounded-2xl border text-[13px] font-bold outline-none cursor-pointer focus:border-brand-panel transition-colors"
                    style={solidInputStyle}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-extrabold uppercase tracking-widest opacity-60 block mb-2">Início</label>
                  <input 
                    type="time" 
                    value={newStartTime}
                    onChange={(e) => setNewStartTime(e.target.value)}
                    className="w-full px-4 py-3.5 rounded-2xl border text-[13px] font-bold outline-none focus:border-brand-panel transition-colors"
                    style={solidInputStyle}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-extrabold uppercase tracking-widest opacity-60 block mb-2">Fim</label>
                  <input 
                    type="time" 
                    value={newEndTime}
                    onChange={(e) => setNewEndTime(e.target.value)}
                    className="w-full px-4 py-3.5 rounded-2xl border text-[13px] font-bold outline-none focus:border-brand-panel transition-colors"
                    style={solidInputStyle}
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-extrabold uppercase tracking-widest opacity-60 block mb-2">Local / Sala</label>
                <input 
                  type="text" 
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  placeholder="Ex: Auditório ou Google Meet"
                  className="w-full px-4 py-3.5 rounded-2xl border text-[13px] font-bold outline-none focus:border-brand-panel transition-colors"
                  style={solidInputStyle}
                />
              </div>

              <div className="space-y-3 pt-3 border-t" style={{ borderColor: 'var(--border-input)' }}>
                <label className="text-[11px] font-extrabold uppercase tracking-widest opacity-60 block">Visibilidade</label>
                <select 
                  value={newVisibility}
                  onChange={(e: any) => setNewVisibility(e.target.value)}
                  className="w-full px-4 py-3.5 rounded-2xl border text-[13px] font-bold outline-none cursor-pointer focus:border-brand-panel transition-colors"
                  style={solidInputStyle}
                >
                  <option value="pessoal">👤 Pessoal – eu e confirmados</option>
                  <option value="setor">👥 Setor – Visível para {currentUser?.setor}</option>
                  {isManagerOrHR && <option value="geral">🚀 Empresa – Todos podem ver</option>}
                </select>
                
                {!isManagerOrHR && (
                  <p className="text-[10px] text-amber-500 font-bold flex items-center">
                    <AlertCircle className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" />
                    Permissões gerais limitadas a Coordenação e RH.
                  </p>
                )}
              </div>

              <div className="p-4 rounded-2xl border flex items-center justify-between" style={solidInputStyle}>
                <div className="flex items-center space-x-3">
                  <Send className="w-5 h-5 text-brand-panel" />
                  <div>
                    <p className="text-[13px] font-bold">Notificar Equipe no Chat</p>
                    <p className="text-[10px] opacity-60 font-semibold mt-0.5">Envia convite automático ao criar o evento.</p>
                  </div>
                </div>
                <input 
                  type="checkbox"
                  checked={shareToChat}
                  onChange={(e) => setShareToChat(e.target.checked)}
                  disabled={newVisibility === 'pessoal'}
                  className="w-5 h-5 rounded border-gray-300 accent-blue-600 cursor-pointer disabled:opacity-30"
                />
              </div>

              <div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3 pt-5 border-t" style={{ borderColor: 'var(--border-input)' }}>
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="w-full sm:w-auto px-6 py-3.5 rounded-xl border text-[13px] font-extrabold cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  style={{ borderColor: 'var(--border-input)' }}
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={isSaving}
                  className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-brand-panel text-white text-[13px] font-extrabold shadow-lg cursor-pointer hover:opacity-90 active:scale-95 transition-transform disabled:opacity-70 flex justify-center items-center space-x-2"
                >
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{isSaving ? 'Agendando...' : 'Agendar Reunião'}</span>
                </button>
              </div>
            </form>

          </div>
        </div>
      )}
    </div>
  );
}