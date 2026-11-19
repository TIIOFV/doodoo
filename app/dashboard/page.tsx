'use client';
import './overview-workspace.css';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Calendar,
  Check,
  CheckCircle2,
  CheckSquare,
  Clock,
  Flame,
  Loader2,
  MapPin,
  MessageSquare,
  RefreshCw,
  Sparkles,
  StickyNote,
  TriangleAlert,
} from 'lucide-react';
import { HeroOrbitalArt, heroSurfaceStyle } from '../components/BrandMark';
import { isTaskOverdue, localISO, taskDeadline } from '../lib/domain';
import { useOverviewData, type OverviewTask } from './useOverviewData';

export default function DashboardOverviewPage() {
  const { data, loading, refreshing, refresh } = useOverviewData();
  const [scope, setScope] = useState<'mine' | 'delegated'>('mine');
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const { profile, allowed, tasks, notes, events } = data;
  const today = localISO(now);
  const has = (key: string) => allowed.includes(key);

  const mine = tasks.filter((t) => t.responsavel === profile?.nome);
  const delegated = tasks.filter(
    (t) =>
      t.responsavel !== profile?.nome &&
      (t.usuario_id ? t.usuario_id === profile?.user_id : t.atribuido_por === profile?.nome)
  );
  const overdue = (t: OverviewTask) => isTaskOverdue(t.data_limite || '', t.hora_limite, t.status, now);
  const active = mine.filter((t) => t.status !== 'concluida');
  const late = active.filter(overdue);
  const completed = mine.filter((t) => t.status === 'concluida');
  const focus = (scope === 'mine' ? mine : delegated)
    .filter((t) => t.status !== 'concluida')
    .sort(
      (a, b) =>
        Number(overdue(b)) - Number(overdue(a)) ||
        Number(b.status === 'bloqueado') - Number(a.status === 'bloqueado') ||
        (taskDeadline(a.data_limite || '', a.hora_limite)?.getTime() ?? Infinity) -
          (taskDeadline(b.data_limite || '', b.hora_limite)?.getTime() ?? Infinity) ||
        a.titulo.localeCompare(b.titulo)
    );
  const upcoming = events
    .filter((e) => new Date(e.data + 'T' + (e.hora_fim || e.hora_inicio || '23:59')).getTime() > now.getTime())
    .sort((a, b) => (a.data + a.hora_inicio).localeCompare(b.data + b.hora_inicio));
  const todayEvents = events.filter((e) => e.data === today);

  const taskHref = (t: OverviewTask) =>
    '/dashboard/tarefas?taskId=' + encodeURIComponent(t.id) + (scope === 'delegated' ? '&queue=delegadas' : '');
  const dateLabel = (date: string) =>
    new Date(date + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');

  const shortcuts = [
    {
      key: 'chat',
      href: '/dashboard/conversas',
      title: 'Conversas',
      desc: 'Comunicação direta e canais da equipe.',
      cta: 'Abrir conversas',
      tone: 'blue',
      icon: MessageSquare,
    },
    {
      key: 'tarefas',
      href: '/dashboard/tarefas',
      title: 'Tarefas',
      desc: 'Gestão de demandas, prazos e entregas.',
      cta: 'Acessar tarefas',
      tone: 'emerald',
      icon: CheckSquare,
    },
    {
      key: 'agenda',
      href: '/dashboard/agenda',
      title: 'Agenda',
      desc: 'Reuniões, compromissos e convites do setor.',
      cta: 'Ver agenda',
      tone: 'amber',
      icon: Calendar,
    },
    {
      key: 'anotacoes',
      href: '/dashboard/notas',
      title: 'Anotações',
      desc: 'Documentos rápidos, rascunhos e ideias.',
      cta: 'Abrir notas',
      tone: 'violet',
      icon: StickyNote,
    },
  ].filter((s) => has(s.key));

  if (loading) {
    return (
      <div className="overview-loading" role="status">
        <Loader2 className="animate-spin" size={24} />
        <span>Preparando seu resumo…</span>
      </div>
    );
  }

  return (
    <div className="overview-workspace">
      {/* HERO BANNER EXECUTIVO — ESTILO IRIS GESTÃO V2 */}
      <header className="overview-welcome" style={heroSurfaceStyle}>
        <div className="overview-welcome-art" aria-hidden="true">
          <HeroOrbitalArt className="w-full h-full" />
        </div>
        <div className="overview-welcome-copy">
          <span className="overview-eyebrow">
            <Sparkles size={13} />
            SEU DIA NO DOO DOO · {profile?.setor || 'WORKSPACE'}
          </span>
          <h1>
            <span>Olá, {profile?.nome.split(' ')[0] || 'você'}</span>
            <span className="overview-greeting-dot">.</span>
          </h1>
          <p>Suas prioridades, seus encontros e suas ideias em um só lugar.</p>
        </div>

        <div className="overview-date">
          <div className="overview-date-meta">
            <span>{now.toLocaleDateString('pt-BR', { weekday: 'long' })}</span>
            <strong>{now.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}</strong>
          </div>
          <button type="button" onClick={refresh} disabled={refreshing} aria-label="Atualizar resumo">
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            <span>
              {refreshing
                ? 'Atualizando…'
                : data.loadedAt
                  ? 'Atualizado às ' + new Date(data.loadedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                  : 'Tentar novamente'}
            </span>
          </button>
        </div>
      </header>

      {data.errors.length > 0 && (
        <div className="overview-error" role="status">
          <TriangleAlert size={16} />
          <span>Não foi possível carregar: {data.errors.join(', ')}.</span>
          <button type="button" onClick={refresh} disabled={refreshing}>
            Tentar novamente
          </button>
        </div>
      )}

      {/* AMBIENTES DE TRABALHO — CARDS COM WATERMARK E DESTAQUE IRIS V2 */}
      {shortcuts.length > 0 && (
        <section className="overview-block" aria-label="Ambientes do portal">
          <div className="overview-block-label">
            <span className="overview-accent-bar" aria-hidden="true" />
            <span>AMBIENTES DO PORTAL</span>
          </div>
          <nav className="overview-shortcuts" aria-label="Acessos rápidos">
            {shortcuts.map((s) => (
              <Link href={s.href} key={s.key} className="overview-env-card" data-tone={s.tone}>
                <div className="overview-env-top">
                  <span className="overview-env-icon">
                    <s.icon size={20} />
                  </span>
                  <span className="overview-env-arrow" aria-hidden="true">
                    <ArrowRight size={14} />
                  </span>
                </div>
                <div className="overview-env-body">
                  <strong>{s.title}</strong>
                  <span>{s.desc}</span>
                </div>
                <span className="overview-env-cta">
                  {s.cta}
                  <ArrowRight size={13} />
                </span>
                <s.icon className="overview-env-watermark" size={96} strokeWidth={1.35} aria-hidden="true" />
              </Link>
            ))}
          </nav>
        </section>
      )}

      {/* INDICADORES DO DIA */}
      {(has('tarefas') || has('agenda')) && (
        <section className="overview-block" aria-label="Indicadores do dia">
          <div className="overview-block-label">
            <span className="overview-accent-bar" aria-hidden="true" />
            <span>RESUMO DO DIA</span>
          </div>
          <div className="overview-metrics">
            {has('tarefas') && (
              <>
                <Link href="/dashboard/tarefas?list=todas" className="overview-metric" data-tone="blue">
                  <span>
                    <span className="overview-metric-icon">
                      <CheckSquare size={15} />
                    </span>
                    Na minha fila
                  </span>
                  <strong>{data.errors.includes('tarefas') ? '—' : active.length}</strong>
                  <small>
                    tarefas em aberto <ArrowUpRight size={14} />
                  </small>
                </Link>
                <Link
                  href="/dashboard/tarefas?list=todas"
                  className="overview-metric"
                  data-tone={late.length ? 'danger' : 'slate'}
                >
                  <span>
                    <span className="overview-metric-icon">
                      <Clock size={15} />
                    </span>
                    Prazos vencidos
                  </span>
                  <strong>{data.errors.includes('tarefas') ? '—' : late.length}</strong>
                  <small>
                    {data.errors.includes('tarefas')
                      ? 'indicador indisponível'
                      : late.length
                        ? 'precisam de atenção'
                        : 'entregas sob controle'}{' '}
                    <ArrowUpRight size={14} />
                  </small>
                </Link>
                <Link href="/dashboard/tarefas?list=concluidas" className="overview-metric" data-tone="emerald">
                  <span>
                    <span className="overview-metric-icon">
                      <CheckCircle2 size={15} />
                    </span>
                    Concluídas
                  </span>
                  <strong>{data.errors.includes('tarefas') ? '—' : completed.length}</strong>
                  <small>
                    na minha responsabilidade <ArrowUpRight size={14} />
                  </small>
                </Link>
              </>
            )}
            {has('agenda') && (
              <Link href="/dashboard/agenda" className="overview-metric" data-tone="amber">
                <span>
                  <span className="overview-metric-icon">
                    <Calendar size={15} />
                  </span>
                  Na agenda hoje
                </span>
                <strong>{data.errors.includes('agenda') ? '—' : todayEvents.length}</strong>
                <small>
                  {todayEvents.length ? 'compromissos no seu dia' : 'espaço para se organizar'}{' '}
                  <ArrowUpRight size={14} />
                </small>
              </Link>
            )}
          </div>
        </section>
      )}

      {/* PAINÉIS OPERACIONAIS: PRIORIDADES & AGENDA */}
      <div className="overview-columns">
        {has('tarefas') && (
          <section className="overview-panel overview-priorities" aria-label="Prioridades de tarefas">
            <div className="overview-section-heading">
              <div>
                <span className="overview-eyebrow">FOCO E ACOMPANHAMENTO</span>
                <h2>Uma entrega de cada vez</h2>
              </div>
              <Link href="/dashboard/tarefas" aria-label="Ver todas as tarefas">
                <span>Ver todas</span>
                <ArrowUpRight size={15} />
              </Link>
            </div>
            <div className="overview-switch" aria-label="Origem das tarefas">
              <button type="button" aria-pressed={scope === 'mine'} onClick={() => setScope('mine')}>
                Minha fila <span>{active.length}</span>
              </button>
              <button type="button" aria-pressed={scope === 'delegated'} onClick={() => setScope('delegated')}>
                Delegadas <span>{delegated.filter((t) => t.status !== 'concluida').length}</span>
              </button>
            </div>
            {data.errors.includes('tarefas') ? (
              <p className="overview-empty">Suas tarefas estão indisponíveis. Tente atualizar o resumo.</p>
            ) : focus.length === 0 ? (
              <div className="overview-empty">
                <CheckCircle2 size={26} />
                <strong>Tudo em dia por aqui</strong>
                <span>{scope === 'mine' ? 'Nenhuma tarefa em aberto na sua fila.' : 'Nenhuma delegação em aberto.'}</span>
              </div>
            ) : (
              <div className="overview-task-list">
                {focus.slice(0, 5).map((t, i) => (
                  <Link href={taskHref(t)} key={t.id} className="overview-task" data-overdue={overdue(t)}>
                    <span className="overview-task-mark">
                      {overdue(t) ? (
                        <Clock size={16} />
                      ) : t.status === 'bloqueado' ? (
                        <TriangleAlert size={16} />
                      ) : (
                        <span>{String(i + 1).padStart(2, '0')}</span>
                      )}
                    </span>
                    <div>
                      <div className="overview-task-tags">
                        {overdue(t) && <span data-chip="danger">Prazo vencido</span>}
                        {t.status === 'bloqueado' && <span data-chip="warn">Com dificuldade</span>}
                        {t.prioridade === 'Urgente' && (
                          <span data-chip="urgent">
                            <Flame size={11} />
                            Urgente
                          </span>
                        )}
                        {!overdue(t) && t.status !== 'bloqueado' && (
                          <span>{t.status === 'andamento' ? 'Em andamento' : 'A iniciar'}</span>
                        )}
                      </div>
                      <h3>{t.titulo}</h3>
                      <p>
                        {scope === 'delegated' ? 'Para ' + t.responsavel + ' · ' : ''}
                        {t.data_limite
                          ? `${t.data_limite}${t.hora_limite ? ' às ' + t.hora_limite.slice(0, 5) : ''}`
                          : 'Sem prazo definido'}
                      </p>
                    </div>
                    <ArrowRight size={16} />
                  </Link>
                ))}
              </div>
            )}
            {focus.length > 5 && (
              <Link className="overview-more" href="/dashboard/tarefas">
                Ver mais {focus.length - 5} tarefas <ArrowRight size={14} />
              </Link>
            )}
          </section>
        )}

        {has('agenda') && (
          <section className="overview-panel overview-agenda" aria-label="Próximos compromissos">
            <div className="overview-section-heading">
              <div>
                <span className="overview-eyebrow">RESERVE UM TEMPO</span>
                <h2>O que vem a seguir</h2>
              </div>
              <Link href="/dashboard/agenda" aria-label="Abrir agenda">
                <span>Agenda</span>
                <Calendar size={15} />
              </Link>
            </div>
            {data.errors.includes('agenda') ? (
              <p className="overview-empty">Sua agenda está indisponível.</p>
            ) : upcoming.length === 0 ? (
              <div className="overview-empty">
                <Calendar size={26} />
                <strong>Agenda livre pela frente</strong>
                <span>Seus próximos compromissos aparecerão aqui.</span>
              </div>
            ) : (
              <div className="overview-event-list">
                {upcoming.slice(0, 4).map((e) => {
                  const ongoing = e.data === today && e.hora_inicio.slice(0, 5) <= now.toTimeString().slice(0, 5);
                  return (
                    <Link href="/dashboard/agenda" className="overview-event" key={e.id}>
                      <div className="overview-event-date" data-today={e.data === today}>
                        <strong>{new Date(e.data + 'T12:00').getDate()}</strong>
                        <span>{e.data === today ? 'HOJE' : dateLabel(e.data).split(' ').slice(1).join(' ')}</span>
                      </div>
                      <div>
                        <span className="overview-event-time" data-ongoing={ongoing}>
                          {ongoing ? 'Acontecendo agora' : e.hora_inicio.slice(0, 5) + ' – ' + e.hora_fim.slice(0, 5)}
                        </span>
                        <h3>{e.titulo}</h3>
                        {e.local && (
                          <p>
                            <MapPin size={11} />
                            {e.local}
                          </p>
                        )}
                        {e.visibilidade !== 'pessoal' &&
                          e.organizador_id !== profile?.user_id &&
                          !e.aceitos_por?.includes(profile?.nome || '') && <small>Confirmação pendente</small>}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
            <Link href="/dashboard/agenda" className="overview-more">
              Ver minha agenda <ArrowRight size={14} />
            </Link>
          </section>
        )}
      </div>

      {/* ANOTAÇÕES RECENTES */}
      {has('anotacoes') && (
        <section className="overview-panel overview-notes">
          <div className="overview-section-heading">
            <div>
              <span className="overview-eyebrow">PARA CONTINUAR DE ONDE PAROU</span>
              <h2>Suas anotações recentes</h2>
            </div>
            <Link href="/dashboard/notas">
              Abrir anotações <ArrowUpRight size={15} />
            </Link>
          </div>
          {data.errors.includes('anotações') ? (
            <p className="overview-empty">Suas anotações estão indisponíveis.</p>
          ) : notes.length === 0 ? (
            <p className="overview-empty">Uma ideia nova? Seu espaço de anotações está pronto para você.</p>
          ) : (
            <div className="overview-note-grid">
              {notes.map((n) => (
                <Link href="/dashboard/notas" className="overview-note" key={n.id}>
                  <span className="overview-note-icon">
                    <StickyNote size={16} />
                  </span>
                  <h3>{n.titulo || 'Sem título'}</h3>
                  <p>{n.conteudo || 'Continue escrevendo sua anotação…'}</p>
                  <span>{n.updated_at ? 'Editada em ' + new Date(n.updated_at).toLocaleDateString('pt-BR') : 'Anotação pessoal'}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {!shortcuts.length && !data.errors.length && (
        <div className="overview-panel overview-empty">
          <Check size={24} />
          <strong>Bem-vindo ao seu workspace</strong>
          <span>Os módulos liberados para seu perfil aparecerão aqui.</span>
        </div>
      )}
    </div>
  );
}
