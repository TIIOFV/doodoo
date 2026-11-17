'use client';
import './agenda-workspace.css';
import { inputStyle } from '../../components/ui';

import { useHydrated } from '@/app/lib/useHydrated';
import ModalShell from '../ModalShell';
import { useDialogAction } from '../useDialogAction';

import { Button } from '@/app/components/ui';
import { notify,requireResult,localISO,searchKey } from '@/app/lib/domain';
import { atomicWrites } from '@/app/lib/environment';
import { MapPin,Search,X,CheckCircle2,ArrowUpRight,AlertCircle,Calendar as CalendarIcon,Check,ChevronLeft,ChevronRight,Clock,Loader2,Plus,Send,Trash2,Users } from 'lucide-react';
import { useEffect,useMemo,useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRecordActions } from '../useRecordActions';

type RoleType = 'administrador' | 'gestor' | 'coordenador' | 'supervisor' | 'analista' | 'colaborador';
interface DBProfile { id: string; user_id: string; nome: string; email: string; cargo: RoleType; setor: string; avatar_url?: string; status?: string; }
interface EventItem { id: string; title: string; description: string; date: string; startTime: string; endTime: string; location?: string; visibility: 'pessoal' | 'setor' | 'geral'; organizer: string; organizer_id: string; sector: string; acceptedBy: string[]; }

interface DbEvent { id:string; titulo:string; descricao?:string; data:string; hora_inicio:string; hora_fim:string; local?:string; visibilidade:EventItem['visibility']; organizador_nome:string; organizador_id:string; setor:string; aceitos_por?:string[]; updated_at?:string; }
const mapDbToEvent = (dbEvent: DbEvent): EventItem => ({
  id: dbEvent.id, title: dbEvent.titulo, description: dbEvent.descricao || '', date: dbEvent.data, startTime: dbEvent.hora_inicio.slice(0,5), endTime: dbEvent.hora_fim.slice(0,5),
  location: dbEvent.local || '', visibility: dbEvent.visibilidade, organizer: dbEvent.organizador_nome, organizer_id: dbEvent.organizador_id, sector: dbEvent.setor, acceptedBy: dbEvent.aceitos_por || []
});

export default function AgendaPage() {
  const dialogAction = useDialogAction();
  const recordActions = useRecordActions();
  const isMounted = useHydrated();
  const [isSaving, setIsSaving] = useState(false);

  const [currentUser, setCurrentUser] = useState<DBProfile | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [viewMode, setViewMode] = useState<'dia' | 'semana' | 'mes'>('semana');
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());

  const solidInputStyle = inputStyle;



  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEventId,setEditingEventId]=useState<string|null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);

  // States do Formulário
  const [formDate,setFormDate]=useState('');
  const [search,setSearch]=useState('');
  const [scope,setScope]=useState<'todos'|'pessoal'|'setor'|'geral'|'pendentes'>('todos');
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newStartTime, setNewStartTime] = useState('09:00');
  const [newEndTime, setNewEndTime] = useState('10:00');
  const [newLocation, setNewLocation] = useState('');
  const [newVisibility, setNewVisibility] = useState<'pessoal' | 'setor' | 'geral'>('pessoal');
  const [shareToChat, setShareToChat] = useState(false);
  const [shareChannelId,setShareChannelId]=useState('');
  const [chatChannels,setChatChannels]=useState<{id:string;nome:string;setor:string;membros:{user_id:string}[]}[]>([]);
  const invitationChannels=useMemo(()=>chatChannels.filter(c=>newVisibility==='geral'?c.nome==='Geral':newVisibility==='setor'&&c.setor===currentUser?.setor&&c.nome!=='Geral'),[chatChannels,newVisibility,currentUser]);
  const effectiveChannelId=shareChannelId||(invitationChannels.length===1?invitationChannels[0].id:'');

  useEffect(() => {
    const fetchAgendaData = async () => {
      try {
        setIsLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) { setIsLoading(false); return; }

        const { data: perfilAtual } = await supabase.from('doodoo_perfis').select('*').eq('user_id', session.user.id).single();
        if (perfilAtual) {
          setCurrentUser(perfilAtual as DBProfile);
          const { data: agendaDb, error: agendaError } = await supabase.from('doodoo_agenda').select('*').order('data', { ascending: true });
          if (agendaError) throw agendaError;
          if (agendaDb) setEvents(agendaDb.map(mapDbToEvent));
          const {data:channels}=await supabase.from('doodoo_canais').select('id,nome,setor,membros').eq('is_group',true);
          setChatChannels((channels||[]).filter(c=>c.membros?.some((m:{user_id:string})=>m.user_id===perfilAtual.user_id)));
        }
      } catch { notify('Erro na agenda','Não foi possível carregar os compromissos. Atualize para tentar novamente.'); } finally { setIsLoading(false); }
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

  const changeWeek = (direction:'next'|'prev') => {
    const delta=direction==='next'?1:-1;
    if(viewMode==='mes'){setCurrentDate(new Date(currentDate.getFullYear(),currentDate.getMonth()+delta,1,12));return;}
    const date=new Date(currentDate);date.setDate(date.getDate()+delta*(viewMode==='dia'?1:7));setCurrentDate(date);
  };
  const monthDays=useMemo(()=>{
    const first=new Date(currentDate.getFullYear(),currentDate.getMonth(),1,12);
    first.setDate(first.getDate()-(first.getDay()+6)%7);
    return Array.from({length:42},(_,i)=>{const date=new Date(first);date.setDate(first.getDate()+i);return {date,dateStr:localISO(date)};});
  },[currentDate]);

  const notifyBell = (title: string, desc: string) => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('doodoo:notify', { detail: { title, desc } })); };

  const isManagerOrHR = currentUser ? ['administrador', 'gestor', 'coordenador'].includes(currentUser.cargo) || currentUser.setor === 'RH' : false;

  const accessibleEvents=useMemo(()=>events.filter(ev=>currentUser&&(ev.organizer_id===currentUser.user_id||ev.visibility==='geral'||ev.visibility==='setor'&&ev.sector===currentUser.setor||ev.acceptedBy.includes(currentUser.nome))).sort((a,b)=>(a.date+a.startTime).localeCompare(b.date+b.startTime)||a.title.localeCompare(b.title)),[events,currentUser]);
  const filteredEvents=useMemo(()=>accessibleEvents.filter(ev=>{
    const matches=scope==='todos'||scope==='pendentes'&&ev.visibility!=='pessoal'&&!ev.acceptedBy.includes(currentUser?.nome||'')||ev.visibility===scope;
    return matches&&(!search.trim()||searchKey([ev.title,ev.description,ev.location,ev.organizer].join(' ')).includes(searchKey(search)));
  }),[accessibleEvents,scope,search,currentUser]);
  const visibleEvents=useMemo(()=>filteredEvents.filter(ev=>viewMode==='dia'?ev.date===currentDateStr:viewMode==='mes'?monthDays.some(day=>day.dateStr===ev.date):weekDays.some(day=>day.dateStr===ev.date)),[filteredEvents,viewMode,currentDateStr,monthDays,weekDays]);
  const eventGroups=useMemo(()=>Array.from(new Set(visibleEvents.map(ev=>ev.date))).map(date=>({date,events:visibleEvents.filter(ev=>ev.date===date)})),[visibleEvents]);
  const pendingEvents=visibleEvents.filter(ev=>ev.visibility!=='pessoal'&&!ev.acceptedBy.includes(currentUser?.nome||''));
  const nextEvent=accessibleEvents.find(ev=>new Date(ev.date+'T'+ev.endTime).getTime()>=Date.now());
  const conflictingEvents=accessibleEvents.filter(ev=>ev.id!==editingEventId&&ev.date===formDate&&ev.startTime<newEndTime&&ev.endTime>newStartTime);
  const friendlyDate=(date:string)=>new Date(date+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'});
  const visibilityLabel=(ev:EventItem)=>ev.visibility==='pessoal'?'Pessoal':ev.visibility==='geral'?'Empresa':ev.sector;
  useEffect(()=>{setSelectedEvent(previous=>previous?events.find(ev=>ev.id===previous.id)||null:null);},[events]);

  const openCreateModal = () => { setEditingEventId(null);setFormDate(currentDateStr); setNewTitle(''); setNewDesc(''); setNewStartTime('09:00'); setNewEndTime('10:00'); setNewLocation(''); setNewVisibility('pessoal'); setShareToChat(false);setShareChannelId(''); setIsModalOpen(true); };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !currentUser || isSaving) return;
    if(!formDate||!newStartTime||!newEndTime)return notifyBell('Preencha os horários','Informe a data, o início e o fim do compromisso.');
    if (newEndTime <= newStartTime) return notifyBell('Horário inválido', 'O fim deve ser posterior ao início.');
    if(shareToChat&&newVisibility!=='pessoal'&&!invitationChannels.some(c=>c.id===effectiveChannelId))return notifyBell('Escolha um canal','Selecione onde o convite deve ser publicado.');
    setIsSaving(true);
    try {

    const finalVisibility = (!isManagerOrHR && newVisibility === 'geral') ? 'pessoal' : newVisibility;
    const insertData = {
      titulo: newTitle.trim(),
      descricao: newDesc.trim() || 'Sem pauta informada.',
      data: formDate,
      hora_inicio: newStartTime,
      hora_fim: newEndTime,
      local: newLocation.trim(),
      visibilidade: finalVisibility,
      organizador_id: currentUser.user_id,
      organizador_nome: currentUser.nome,
      setor: currentUser.setor,
      aceitos_por: [currentUser.nome]
    };

    const eventFields={...insertData,aceitos_por:undefined};
    const operation=editingEventId?supabase.from('doodoo_agenda').update(eventFields).eq('id',editingEventId).eq('organizador_id',currentUser.user_id):supabase.from('doodoo_agenda').insert([insertData]);
    const {data,error}=await operation.select('*').single();

    if (data && !error) {
      const newEv = mapDbToEvent(data);
      setEvents(prev => [...prev.filter(e=>e.id!==newEv.id), newEv]);
      setIsModalOpen(false);
      const [savedYear,savedMonth,savedDay]=newEv.date.split('-').map(Number);setCurrentDate(new Date(savedYear,savedMonth-1,savedDay,12));

      if (shareToChat && finalVisibility !== 'pessoal') {

         const channelData=invitationChannels.find(c=>c.id===effectiveChannelId);

         if (channelData) {
            const invitation = await supabase.from('doodoo_mensagens').insert([{
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
            if (invitation.error) { notifyBell('Convite não enviado', 'O evento foi salvo, mas o convite falhou.'); return; }
            notifyBell('🎯 Convite Enviado', `Convite postado no canal ${channelData.nome}.`);
         } else {
            notifyBell('Aviso', 'Compromisso salvo, mas não conseguimos encontrar o canal de Chat para publicar.');
         }
      } else {
         notifyBell(editingEventId?'Compromisso Atualizado':'Compromisso Adicionado', `"${newEv.title}" salvo com sucesso.`);
      }
    } else {
      notifyBell('Erro', 'Não foi possível salvar o compromisso.');
    }
    } finally { setIsSaving(false); }
  };

  useEffect(() => {
    if (!currentUser) return;
    const sync = async () => {
      const result = await supabase.from('doodoo_agenda').select('*').order('data');
      if (result.error) { notify('Sincronização indisponível','Não foi possível atualizar a agenda.'); return; }
      setEvents((result.data || []).map(mapDbToEvent));
    };
    const channel = supabase.channel('agenda:' + currentUser.user_id).on('postgres_changes',{event:'*',schema:'public',table:'doodoo_agenda'},()=>{void sync();}).subscribe(status=>{if(status==='SUBSCRIBED')void sync();});
    return () => { void supabase.removeChannel(channel); };
  },[currentUser]);
  const handleAcceptEvent = async (event: EventItem, click?: React.MouseEvent) => {
    click?.stopPropagation(); if (!currentUser) return;
    await recordActions.run(event.id,async()=>{
      if(atomicWrites){
        const row=requireResult(await supabase.rpc('doodoo_accept_event',{p_event_id:event.id})) as DbEvent;
        const saved=mapDbToEvent(row);setEvents(prev=>prev.map(e=>e.id===saved.id?saved:e));setSelectedEvent(prev=>prev?.id===saved.id?saved:prev);notifyBell('Presença Confirmada','Sua presença foi salva.');return;
      }
      for(let attempt=0;attempt<3;attempt++) {
        const latest=requireResult<DbEvent>(await supabase.from('doodoo_agenda').select('*').eq('id',event.id).single());
        const names=Array.from(new Set([...(latest.aceitos_por || []),currentUser.nome]));
        let query=supabase.from('doodoo_agenda').update({aceitos_por:names,...(latest.updated_at?{updated_at:new Date().toISOString()}:{})}).eq('id',event.id);
        if(latest.updated_at)query=query.eq('updated_at',latest.updated_at);
        else query=latest.aceitos_por==null?query.is('aceitos_por',null):query.filter('aceitos_por','eq',JSON.stringify(latest.aceitos_por));
        const result=await query.select('*').maybeSingle();if(result.error)throw result.error;if(!result.data)continue;
        const saved=mapDbToEvent(result.data);setEvents(prev=>prev.map(e=>e.id===saved.id?saved:e));
        setSelectedEvent(prev=>prev?.id===saved.id?saved:prev);notifyBell('Presença Confirmada','Sua presença foi salva.');return;
      }
      throw new Error('O evento mudou em outra sessão. Tente novamente.');
    });
  };
  const handleDeleteEvent = async (id: string) => {
    if (!currentUser || selectedEvent?.organizer_id !== currentUser.user_id || !window.confirm('Deseja cancelar e excluir este compromisso?')) return;
    await recordActions.run(id,async()=>{
      requireResult(await supabase.from('doodoo_agenda').delete().eq('id',id).eq('organizador_id',currentUser.user_id).select('*').single());
      setEvents(prev=>prev.filter(e=>e.id!==id));setSelectedEvent(null);notifyBell('Cancelado','O compromisso foi removido da agenda.');
    });
  };

  if (isLoading || !isMounted) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin opacity-70 text-brand-panel" />
      </div>
    );
  }

  return (
    <div className="agenda-workspace">
      <div className="agenda-shell">
        <aside className="agenda-sidebar">
          <div className="agenda-brand"><span className="agenda-icon"><CalendarIcon size={21}/></span><div><h2>Minha agenda</h2><p>Seu tempo, bem organizado</p></div></div>
          <Button onClick={openCreateModal}><Plus size={16}/>Novo Evento</Button>
          <div className="agenda-sidebar-section"><span className="agenda-eyebrow">Neste período</span><div className="agenda-stat"><strong>{visibleEvents.length}</strong><span>compromissos</span></div><div className="agenda-stat"><strong>{pendingEvents.length}</strong><span>aguardando sua confirmação</span></div></div>
          <div className="agenda-sidebar-section"><span className="agenda-eyebrow">Próximo compromisso</span>{nextEvent?<button className="agenda-next" onClick={()=>setSelectedEvent(nextEvent)}><span>{nextEvent.date.split('-').reverse().join('/')} · {nextEvent.startTime}</span><strong>{nextEvent.title}</strong><span>{nextEvent.location||'Local não informado'}<ArrowUpRight size={14}/></span></button>:<p className="agenda-muted">Você está em dia. Nenhum compromisso futuro.</p>}</div>
          <div className="agenda-legend"><span><i data-kind="pessoal"/>Pessoal</span><span><i data-kind="setor"/>Setor {currentUser?.setor}</span><span><i data-kind="geral"/>Empresa</span></div>
        </aside>
        <main className="agenda-main">
          <header className="agenda-header">
            <div><span className="agenda-eyebrow">Planeje com clareza</span><h2>{currentDate.toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</h2><p>{viewMode==='dia'?friendlyDate(currentDateStr):viewMode==='mes'?'Uma visão dos compromissos do mês':`${weekDays[0].dateStr.split('-').reverse().join('/')} a ${weekDays[6].dateStr.split('-').reverse().join('/')}`}</p></div>
            <div className="agenda-header-actions"><div className="agenda-mode" aria-label="Visualização da agenda">{([{id:'dia',label:'Dia'},{id:'semana',label:'Semana'},{id:'mes',label:'Mês'}] as const).map(mode=><button key={mode.id} aria-pressed={viewMode===mode.id} onClick={()=>setViewMode(mode.id)}>{mode.label}</button>)}</div><button className="agenda-mobile-create" aria-label="Novo Evento" onClick={openCreateModal}><Plus size={18}/></button></div>
          </header>
          <div className="agenda-controls">
            <div className="agenda-navigation"><button aria-label="Anterior" onClick={()=>changeWeek('prev')}><ChevronLeft size={18}/></button><button onClick={()=>setCurrentDate(new Date())}>Hoje</button><button aria-label="Próximo" onClick={()=>changeWeek('next')}><ChevronRight size={18}/></button><input aria-label="Data da agenda" type="date" value={currentDateStr} onChange={e=>{if(e.target.value){const [y,m,d]=e.target.value.split('-').map(Number);setCurrentDate(new Date(y,m-1,d,12));setViewMode('dia');}}}/></div>
            <label className="agenda-search"><Search size={16}/><input aria-label="Pesquisar compromissos" placeholder="Pesquisar compromissos…" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button aria-label="Limpar pesquisa" onClick={()=>setSearch('')}><X size={14}/></button>}</label>
          </div>
          <div className="agenda-filters" aria-label="Filtrar compromissos">{([{id:'todos',label:'Todos'},{id:'pessoal',label:'Pessoais'},{id:'setor',label:'Do setor'},{id:'geral',label:'Da empresa'},{id:'pendentes',label:'A confirmar'}] as const).map(filter=><button key={filter.id} aria-pressed={scope===filter.id} onClick={()=>setScope(filter.id)}>{filter.label}</button>)}</div>
          <div className="agenda-scroll custom-scrollbar">
            {viewMode!=='mes'&&<div className="agenda-week" aria-label="Dias da semana">{weekDays.map(day=><button key={day.dateStr} aria-label={friendlyDate(day.dateStr)} aria-pressed={day.dateStr===currentDateStr} aria-current={day.dateStr===localISO()?'date':undefined} onClick={()=>{setCurrentDate(day.dateObj);setViewMode('dia');}}><span>{day.dayName}</span><strong>{day.dayNum}</strong><span className="agenda-day-count">{filteredEvents.filter(ev=>ev.date===day.dateStr).length||'—'}</span></button>)}</div>}
            {viewMode==='mes'?<div className="agenda-month" role="group" aria-label="Calendário mensal">
              {['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(day=><div className="agenda-month-label" key={day}>{day}</div>)}
              {monthDays.map(day=>{const items=visibleEvents.filter(ev=>ev.date===day.dateStr);return <div key={day.dateStr} className="agenda-month-day" data-outside={day.date.getMonth()!==currentDate.getMonth()} data-today={day.dateStr===localISO()}>
                <button id={'agenda-day-'+day.dateStr} className="agenda-month-date" aria-label={friendlyDate(day.dateStr)+(items.length?' · '+items.length+' compromissos':'')} aria-current={day.dateStr===localISO()?'date':undefined} tabIndex={day.dateStr===currentDateStr?0:-1} onKeyDown={e=>{const offset=({ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7} as Record<string,number>)[e.key];if(offset){e.preventDefault();const next=new Date(day.date);next.setDate(next.getDate()+offset);setCurrentDate(next);requestAnimationFrame(()=>document.getElementById('agenda-day-'+localISO(next))?.focus());}}} onClick={()=>{setCurrentDate(day.date);setViewMode('dia');}}>{day.date.getDate()}<span>{items.length>0?items.length:''}</span></button>
                <div className="agenda-month-items">{items.slice(0,2).map(ev=><button key={ev.id} data-kind={ev.visibility} data-event-id={ev.id} onClick={()=>setSelectedEvent(ev)} aria-label={ev.title+' às '+ev.startTime} title={ev.startTime+' · '+ev.title}><time>{ev.startTime}</time><span>{ev.title}</span></button>)}{items.length>2&&<button className="agenda-month-more" onClick={()=>{setCurrentDate(day.date);setViewMode('dia');}}>+{items.length-2} eventos</button>}</div>
              </div>;})}
            </div>:<div key={viewMode+currentDateStr+scope+search} className="agenda-event-list">
              {eventGroups.map(group=><section key={group.date} className="agenda-day-group"><div className="agenda-group-heading"><h3>{friendlyDate(group.date)}</h3><span>{group.events.length} {group.events.length===1?'compromisso':'compromissos'}</span></div>
                {group.events.map(ev=>{const accepted=ev.acceptedBy.includes(currentUser?.nome||'');return <article key={ev.id} data-event-id={ev.id} data-kind={ev.visibility} className="agenda-event" role="button" tabIndex={0} onClick={()=>setSelectedEvent(ev)} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();setSelectedEvent(ev);}}}>
                  <div className="agenda-event-time"><strong>{ev.startTime}</strong><span>{ev.endTime}</span></div>
                  <div className="agenda-event-content"><div className="agenda-event-tags"><span className="agenda-kind" data-kind={ev.visibility}>{visibilityLabel(ev)}</span>{accepted&&ev.visibility!=='pessoal'&&<span className="agenda-confirmed"><CheckCircle2 size={12}/>Você confirmou</span>}</div><h4>{ev.title}</h4>{ev.description&&<p>{ev.description}</p>}<div className="agenda-event-meta">{ev.location&&<span><MapPin size={13}/>{ev.location}</span>}<span><Users size={13}/>{ev.acceptedBy.length} {ev.acceptedBy.length===1?'pessoa confirmada':'pessoas confirmadas'}</span><span>Por {ev.organizer}</span></div></div>
                  {ev.visibility!=='pessoal'&&!accepted?<button className="agenda-accept" disabled={recordActions.pending>0} onClick={e=>handleAcceptEvent(ev,e)}><Check size={14}/>Aceitar Convite</button>:<ChevronRight className="agenda-event-arrow" size={17}/>}
                </article>;})}
              </section>)}
              {visibleEvents.length===0&&<div className="agenda-empty"><span><CalendarIcon size={30}/></span><h3>{search||scope!=='todos'?'Nenhum compromisso neste filtro':'Seu tempo está livre por aqui'}</h3><p>{search||scope!=='todos'?'Experimente outra pesquisa ou altere os filtros.':'Organize uma reunião, reserve um horário ou planeje seu próximo encontro.'}</p><Button variant="secondary" onClick={openCreateModal}><Plus size={15}/>Novo Evento</Button></div>}
            </div>}
          </div>
        </main>
      </div>

      {/* MODAL DETALHES Z-[999] */}
      {selectedEvent && (
        <ModalShell open description={<><span className={`text-xs font-semibold uppercase tracking-widest px-2.5 py-1 rounded-lg ${selectedEvent.visibility === 'geral' ? 'bg-blue-500/10 text-brand-panel' : selectedEvent.visibility === 'setor' ? 'bg-amber-500/10 text-[var(--warning)]' : 'bg-purple-500/10 text-purple-500'}`}>
                  {selectedEvent.visibility === 'geral' ? '🚀 Empresa' : selectedEvent.visibility === 'setor' ? `👥 Setor ${selectedEvent.sector}` : '👤 Pessoal'}
                </span></>} title={<>{selectedEvent.title}</>} onClose={() => setSelectedEvent(null)} busy={isSaving || dialogAction.pending}  footer={<div className="px-6 md:px-8 py-5 border-t flex flex-col sm:flex-row items-center justify-between text-xs gap-4 sm:gap-0" style={{ borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-input)' }}>
              <span className="opacity-75 font-medium w-full sm:w-auto text-center sm:text-left text-xs">Agendado por <strong className="opacity-100">{selectedEvent.organizer}</strong></span>

              <div className="flex items-center space-x-3 w-full sm:w-auto">
                {selectedEvent.organizer_id === currentUser?.user_id && (
                  <><Button variant="secondary" onClick={()=>{
                    setEditingEventId(selectedEvent.id);setFormDate(selectedEvent.date);setNewTitle(selectedEvent.title);setNewDesc(selectedEvent.description);setNewStartTime(selectedEvent.startTime);setNewEndTime(selectedEvent.endTime);setNewLocation(selectedEvent.location || '');setNewVisibility(selectedEvent.visibility);setShareToChat(false);
                    setSelectedEvent(null);setIsModalOpen(true);
                  }}>Editar evento</Button><button
                    onClick={() => handleDeleteEvent(selectedEvent.id)}
                    className="flex-1 sm:flex-none justify-center px-5 py-3.5 rounded-xl text-[var(--error-text)] hover:bg-red-500/10 font-medium flex items-center space-x-1.5 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Excluir</span>
                  </button></>
                )}
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="flex-1 sm:flex-none justify-center px-6 py-3.5 rounded-xl bg-brand-panel text-white font-semibold shadow-sm cursor-pointer hover:opacity-90 active:scale-95 transition-transform"
                >
                  Fechar detalhes
                </button>
              </div>
            </div>}>
<div className="agenda-event-details p-6 md:p-8 space-y-6 overflow-y-auto max-h-[60vh] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
              <div className="grid grid-cols-2 gap-4 p-5 rounded-3xl border text-xs" style={solidInputStyle}>
                <div>
                  <span className="opacity-70 font-semibold uppercase tracking-widest block mb-2 text-xs">Horário</span>
                  <strong className="font-semibold text-sm block mb-1">{selectedEvent.date.split('-').reverse().join('/')}</strong>
                  <p className="opacity-75 font-semibold text-xs">{selectedEvent.startTime} - {selectedEvent.endTime}</p>
                </div>
                <div>
                  <span className="opacity-70 font-semibold uppercase tracking-widest block mb-2 text-xs">Local</span>
                  <strong className="font-semibold text-sm">{selectedEvent.location || 'Não definido'}</strong>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-widest opacity-70 block">Descrição da Pauta</span>
                <p className="agenda-detail-description text-sm leading-relaxed p-5 rounded-2xl border whitespace-pre-wrap" style={solidInputStyle}>
                  {selectedEvent.description || 'Nenhuma pauta adicional.'}
                </p>
              </div>

              {selectedEvent.visibility!=='pessoal' && !selectedEvent.acceptedBy.includes(currentUser?.nome||'') && <Button disabled={recordActions.pending>0} onClick={()=>handleAcceptEvent(selectedEvent)}>Aceitar Convite</Button>}
              <div className="space-y-3 pt-4 border-t" style={{ borderColor: 'var(--border-input)' }}>
                <span className="text-xs font-semibold uppercase tracking-widest opacity-70 block">Presenças ({selectedEvent.acceptedBy.length})</span>
                <div className="flex flex-wrap gap-2">
                  {selectedEvent.acceptedBy.map((name, idx) => (
                    <span key={idx} className="text-xs font-medium px-3 py-1.5 rounded-xl border flex items-center space-x-1.5" style={solidInputStyle}>
                      <Users className="w-3.5 h-3.5 opacity-75" />
                      <span>{name}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
</ModalShell>
      )}

      {/* MODAL CRIAR NOVO COMPROMISSO Z-[999] */}
      {isModalOpen && (
        <ModalShell open description={<><span className="text-xs font-semibold uppercase tracking-widest text-brand-panel">Formulário</span></>} title={editingEventId?'Editar compromisso':'Novo Compromisso'} onClose={() => setIsModalOpen(false)} busy={isSaving || dialogAction.pending}  footer={<div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3 pt-5 border-t" style={{ borderColor: 'var(--border-input)' }}>
                <button form="modal-form-1"
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-full sm:w-auto px-6 py-3.5 rounded-xl border text-sm font-semibold cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  style={{ borderColor: 'var(--border-input)' }}
                >
                  Cancelar
                </button>
                <button form="modal-form-1"
                  type="submit"
                  disabled={isSaving}
                  className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-brand-panel text-white text-sm font-semibold shadow-sm cursor-pointer hover:opacity-90 active:scale-95 transition-transform disabled:opacity-70 flex justify-center items-center space-x-2"
                >
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{isSaving ? 'Salvando...' : editingEventId ? 'Salvar alterações' : 'Agendar Reunião'}</span>
                </button>
              </div>}>
<form id="modal-form-1" onSubmit={event => { event.preventDefault(); void dialogAction.run(() => handleCreateEvent(event)); }} className="agenda-event-form p-6 md:p-8 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] space-y-5">

              <div>
                <label htmlFor="field-1" className="text-xs font-semibold uppercase tracking-widest opacity-75 block mb-2">Título do Evento *</label>
                <input id="field-1"
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ex: Alinhamento Semanal..."
                  className="w-full px-4 py-3.5 rounded-2xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors"
                  style={solidInputStyle}
                />
              </div>

              <div>
                <label htmlFor="field-2" className="text-xs font-semibold uppercase tracking-widest opacity-75 block mb-2">Pauta (Opcional)</label>
                <textarea id="field-2"
                  rows={2}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Escreva sobre o que será tratado..."
                  className="w-full px-4 py-3.5 rounded-2xl border text-sm outline-none resize-none focus:border-brand-panel transition-colors font-medium"
                  style={solidInputStyle}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="field-3" className="text-xs font-semibold uppercase tracking-widest opacity-75 block mb-2">Data</label>
                  <input id="field-3"
                    type="date" required
                    value={formDate}
                    onChange={e=>setFormDate(e.target.value)}
                    className="w-full px-4 py-3.5 rounded-2xl border text-sm font-medium outline-none cursor-pointer focus:border-brand-panel transition-colors"
                    style={solidInputStyle}
                  />
                </div>
                <div>
                  <label htmlFor="field-4" className="text-xs font-semibold uppercase tracking-widest opacity-75 block mb-2">Início</label>
                  <input id="field-4"
                    type="time" required
                    value={newStartTime}
                    onChange={(e) => setNewStartTime(e.target.value)}
                    className="w-full px-4 py-3.5 rounded-2xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors"
                    style={solidInputStyle}
                  />
                </div>
                <div>
                  <label htmlFor="field-5" className="text-xs font-semibold uppercase tracking-widest opacity-75 block mb-2">Fim</label>
                  <input id="field-5"
                    type="time"
                    value={newEndTime}
                    onChange={(e) => setNewEndTime(e.target.value)}
                    className="w-full px-4 py-3.5 rounded-2xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors"
                    style={solidInputStyle}
                  />
                </div>
              </div>

              {conflictingEvents.length>0 && <div className="agenda-overlap" role="status"><AlertCircle size={17}/><div><strong>Há um compromisso visível neste horário</strong><p>{conflictingEvents.map(ev=>ev.title).join(', ')}. Você pode manter a sobreposição se for intencional.</p></div></div>}
              <div>
                <label htmlFor="field-6" className="text-xs font-semibold uppercase tracking-widest opacity-75 block mb-2">Local / Sala</label>
                <input id="field-6"
                  type="text"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  placeholder="Ex: Auditório ou Google Meet"
                  className="w-full px-4 py-3.5 rounded-2xl border text-sm font-medium outline-none focus:border-brand-panel transition-colors"
                  style={solidInputStyle}
                />
              </div>

              <div className="space-y-3 pt-3 border-t" style={{ borderColor: 'var(--border-input)' }}>
                <label htmlFor="field-7" className="text-xs font-semibold uppercase tracking-widest opacity-75 block">Visibilidade</label>
                <select id="field-7"
                  value={newVisibility}
                  onChange={e => {setNewVisibility(e.target.value as EventItem['visibility']);setShareChannelId('');setShareToChat(false);}}
                  className="w-full px-4 py-3.5 rounded-2xl border text-sm font-medium outline-none cursor-pointer focus:border-brand-panel transition-colors"
                  style={solidInputStyle}
                >
                  <option value="pessoal">👤 Pessoal – eu e confirmados</option>
                  <option value="setor">👥 Setor – Visível para {currentUser?.setor}</option>
                  {isManagerOrHR && <option value="geral">🚀 Empresa – Todos podem ver</option>}
                </select>

                {!isManagerOrHR && (
                  <p className="text-xs text-[var(--warning)] font-medium flex items-center">
                    <AlertCircle className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" />
                    Permissões gerais limitadas a Coordenação e RH.
                  </p>
                )}
              </div>

              <div className="p-4 rounded-2xl border flex items-center justify-between" style={solidInputStyle}>
                <div className="flex items-center space-x-3">
                  <Send className="w-5 h-5 text-brand-panel" />
                  <div>
                    <p className="text-sm font-medium">Notificar Equipe no Chat</p>
                    <p className="text-xs opacity-75 font-semibold mt-0.5">Envia convite automático ao criar o evento.</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  aria-label="Notificar equipe no chat"
                  checked={shareToChat}
                  onChange={(e) => setShareToChat(e.target.checked)}
                  disabled={newVisibility === 'pessoal'||invitationChannels.length===0}
                  className="w-5 h-5 rounded border-gray-300 accent-blue-600 cursor-pointer disabled:opacity-30"
                />
              </div>
              {shareToChat&&newVisibility!=='pessoal'&&<div><label htmlFor="agenda-chat-channel" className="block mb-2 text-sm">Canal do convite</label><select id="agenda-chat-channel" required value={effectiveChannelId} onChange={e=>setShareChannelId(e.target.value)} className="w-full border rounded-xl p-3" style={solidInputStyle}><option value="">Selecione o canal…</option>{invitationChannels.map(channel=><option key={channel.id} value={channel.id}>{channel.nome}</option>)}</select></div>}
              {newVisibility!=='pessoal'&&invitationChannels.length===0&&<p className="text-xs text-[var(--text-muted)]">Nenhum canal compatível está disponível para compartilhar este convite.</p>}

            </form>
</ModalShell>
      )}
    </div>
  );
}
