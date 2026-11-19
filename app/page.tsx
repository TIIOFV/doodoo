'use client';

import { ArrowLeft, ArrowRight, CheckCheck, Eye, EyeOff, Headset, Info, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BrandBadge, heroGridStyle, HeroOrbitalArt, heroSurfaceStyle, primaryActionStyle } from './components/BrandMark';
import { useTheme } from './contexts/ThemeContext';
import { environment } from './lib/environment';
import { supabase } from './lib/supabase';

const themes = [
  { id: 'light', name: 'Claro', color: '#2563eb', border: '#1d4ed8' },
  { id: 'dark', name: 'Escuro', color: '#0f172a', border: '#475569' },
  { id: 'ocean', name: 'Oceano', color: '#0284c7', border: '#0369a1' },
  { id: 'nature', name: 'Natureza', color: '#16a34a', border: '#15803d' },
  { id: 'sunset', name: 'Pôr do Sol', color: '#dc2626', border: '#b91c1c' },
  { id: 'amethyst', name: 'Ametista', color: '#9333ea', border: '#7e22ce' },
  { id: 'aurora', name: 'Aurora', color: '#0d9488', border: '#0f766e' },
  { id: 'solar', name: 'Solar', color: '#f59e0b', border: '#d97706' },
  { id: 'coral', name: 'Coral', color: '#e11d48', border: '#be123c' },
  { id: 'graphite', name: 'Grafite', color: '#52525b', border: '#3f3f46' },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { theme, changeTheme: setTheme } = useTheme();
  const [activeView, setActiveView] = useState<'login' | 'suporte'>('login');

  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const checkExistingSession = async () => {
      const hash = window.location.hash;
      if (environment !== 'shared' && hash) window.history.replaceState(null, '', window.location.pathname);
      if (environment === 'shared' && hash && hash.includes('access_token=') && hash.includes('refresh_token=')) {
        const params = new URLSearchParams(hash.substring(1));
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');

        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (!error) {
            window.history.replaceState(null, '', window.location.pathname);
            router.push('/dashboard');
            return;
          }
        }
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push('/dashboard');
        return;
      }

      try {
        const saved = localStorage.getItem('doodoo_remember_email');
        if (saved) {
          setEmail(saved);
          setRememberMe(true);
        }
      } catch {
        /* Optional preference. */
      }
      setIsInitializing(false);
    };

    checkExistingSession().catch(() => {
      setError('Não foi possível verificar sua sessão. Tente entrar novamente.');
      setIsInitializing(false);
    });
  }, [router]);

  if (isInitializing) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-6 transition-colors duration-300"
        style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-main)' }}
      >
        <BrandBadge size="lg" className="mb-5 animate-pulse" />
        <div className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--tab-active)' }} />
          <span>Preparando Ambiente...</span>
        </div>
        <p className="text-xs mt-2 font-medium" style={{ color: 'var(--text-muted)' }}>
          Conectando ao Doo Doo · Portal Corporativo
        </p>
      </div>
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setError('');
    const cleanEmail = email.trim();

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (signInError) throw signInError;

      if (rememberMe) {
        localStorage.setItem('doodoo_remember_email', cleanEmail);
      } else {
        localStorage.removeItem('doodoo_remember_email');
      }

      if (data.session) router.push('/dashboard');
    } catch {
      setError('As credenciais inseridas estão incorretas. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col lg:flex-row transition-colors duration-300"
      style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-main)' }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
            input[type="password"]::-ms-reveal,
            input[type="password"]::-ms-clear {
              display: none;
            }
          `,
        }}
      />

      {/* PAINEL ESQUERDO INSTITUCIONAL (Desktop - Iris v2 Split Layout) */}
      <aside
        className="hidden lg:flex lg:w-[46%] xl:w-[45%] flex-col justify-between p-11 xl:p-14 relative overflow-hidden text-white select-none"
        style={heroSurfaceStyle}
      >
        <div className="absolute inset-0 pointer-events-none" style={heroGridStyle} />
        <div
          className="absolute -bottom-24 -right-24 w-[440px] h-[440px] pointer-events-none"
          style={{ color: 'var(--hero-orbital, #93c5fd)' }}
        >
          <HeroOrbitalArt className="w-full h-full" />
        </div>

        {/* Brand Header */}
        <div className="relative z-10 flex items-center gap-3.5">
          <BrandBadge size="md" />
          <div>
            <p className="text-lg font-bold tracking-tight leading-none text-white">Doo Doo</p>
            <p className="text-[11px] font-medium tracking-wide text-white/65 mt-1">Portal Corporativo</p>
          </div>
        </div>

        {/* Hero Copy */}
        <div className="relative z-10 my-auto max-w-md py-12">
          <h1 className="text-4xl xl:text-[44px] font-bold tracking-[-0.03em] leading-[1.12] text-white">
            Produtividade corporativa
            <br />
            em um só lugar.
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-white/75 max-w-sm">
            Conecte conversas, tarefas, agenda e anotações à rotina das equipes em um ambiente integrado.
          </p>
        </div>

        {/* Version & Governance Footer */}
        <div className="relative z-10 flex items-center gap-3 text-xs font-medium text-white/55">
          <span>Versão 2.0.0</span>
          <span className="w-1 h-1 rounded-full bg-white/35" />
          <span>Governança &amp; Inovação TI</span>
        </div>
      </aside>

      {/* CABEÇALHO MOBILE COMPACTO (Estilo Hero v2) */}
      <div
        className="lg:hidden px-6 pt-8 pb-10 text-white relative overflow-hidden"
        style={heroSurfaceStyle}
      >
        <div className="absolute inset-0 pointer-events-none opacity-80" style={heroGridStyle} />
        <div
          className="absolute -bottom-20 -right-16 w-60 h-60 pointer-events-none"
          style={{ color: 'var(--hero-orbital, #93c5fd)' }}
        >
          <HeroOrbitalArt className="w-full h-full" />
        </div>
        <div className="relative z-10 flex items-center gap-3">
          <BrandBadge size="sm" />
          <div>
            <p className="text-base font-bold tracking-tight leading-none text-white">Doo Doo</p>
            <p className="text-[11px] font-medium text-white/70 mt-0.5">Portal Corporativo · v2.0</p>
          </div>
        </div>
        <h1 className="relative z-10 mt-5 text-2xl font-bold tracking-tight leading-tight text-white">
          Produtividade corporativa em um só lugar.
        </h1>
      </div>

      {/* PAINEL DIREITO - CARD DE ACESSO */}
      <main className="flex-1 flex flex-col justify-between px-4 sm:px-8 py-8 lg:py-10 relative">
        <div className="flex-1 flex items-center justify-center -mt-6 lg:mt-0">
          <div
            className="w-full max-w-[424px] rounded-2xl border p-7 sm:p-9 transition-all duration-300"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border-input)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            {activeView === 'login' ? (
              <div>
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-5"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--tab-active) 11%, transparent)',
                    color: 'var(--tab-active)',
                  }}
                >
                  <ShieldCheck className="w-5 h-5" />
                </div>

                <h2 className="text-2xl font-bold tracking-tight">Acesse sua conta</h2>
                <p className="text-sm mt-1.5" style={{ color: 'var(--text-muted)' }}>
                  Entre com suas credenciais corporativas.
                </p>

                {error && (
                  <div
                    role="alert"
                    className="w-full text-xs sm:text-sm font-medium px-3.5 py-3 rounded-xl border mt-5 flex items-start gap-2.5"
                    style={{
                      backgroundColor: 'var(--error-bg)',
                      color: 'var(--error-text)',
                      borderColor: 'var(--error-border)',
                    }}
                  >
                    <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleLogin} className="mt-6 space-y-4">
                  <div>
                    <label
                      htmlFor="email"
                      className="text-xs font-semibold mb-1.5 block"
                      style={{ color: 'var(--text-main)' }}
                    >
                      E-mail corporativo
                    </label>
                    <div className="relative">
                      <Mail
                        className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ color: 'var(--text-muted)' }}
                      />
                      <input
                        id="email"
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        placeholder="nome@empresa.com"
                        disabled={loading}
                        className="w-full pl-10 pr-4 py-3 text-[16px] md:text-sm font-medium rounded-xl border focus:outline-none focus:ring-2 transition-all disabled:opacity-50"
                        style={{
                          backgroundColor: 'var(--bg-input)',
                          borderColor: 'var(--border-input)',
                          color: 'var(--text-main)',
                          '--tw-ring-color': 'var(--tab-active)',
                        } as React.CSSProperties}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="password"
                      className="text-xs font-semibold mb-1.5 block"
                      style={{ color: 'var(--text-main)' }}
                    >
                      Senha
                    </label>
                    <div className="relative">
                      <Lock
                        className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ color: 'var(--text-muted)' }}
                      />
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        placeholder="••••••••"
                        disabled={loading}
                        className="w-full pl-10 pr-11 py-3 text-[16px] md:text-sm font-medium rounded-xl border focus:outline-none focus:ring-2 transition-all disabled:opacity-50"
                        style={{
                          backgroundColor: 'var(--bg-input)',
                          borderColor: 'var(--border-input)',
                          color: 'var(--text-main)',
                          '--tw-ring-color': 'var(--tab-active)',
                        } as React.CSSProperties}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        disabled={loading}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-50"
                        style={{ color: 'var(--text-muted)' }}
                        aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-0.5">
                    <label className="flex items-center gap-2.5 cursor-pointer group select-none relative">
                      <div
                        className={`w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center transition-all ${
                          rememberMe ? 'border-transparent' : 'group-hover:border-slate-400'
                        }`}
                        style={
                          rememberMe
                            ? { backgroundColor: 'var(--tab-active)' }
                            : { borderColor: 'var(--border-input)', backgroundColor: 'var(--bg-input)' }
                        }
                      >
                        {rememberMe && <CheckCheck className="w-3 h-3 text-white stroke-[3]" />}
                      </div>
                      <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                        Lembrar e-mail
                      </span>
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        disabled={loading}
                      />
                      <div className="absolute -inset-1 rounded-lg border-2 border-transparent peer-focus-visible:border-blue-500 pointer-events-none" />
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 px-4 rounded-xl text-sm font-semibold text-white transition-all hover:brightness-105 active:scale-[0.99] flex items-center justify-between group border-0 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer mt-2"
                    style={primaryActionStyle}
                  >
                    {loading ? (
                      <span className="w-full flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Entrando...</span>
                      </span>
                    ) : (
                      <>
                        <span>Entrar no Dashboard</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                      </>
                    )}
                  </button>
                </form>

                <div
                  className="mt-6 pt-5 border-t flex items-center justify-between gap-2"
                  style={{ borderColor: 'var(--border-input)' }}
                >
                  <button
                    type="button"
                    onClick={() => setActiveView('suporte')}
                    className="text-xs font-semibold hover:underline cursor-pointer"
                    style={{ color: 'var(--tab-active)' }}
                  >
                    Esqueceu a senha ou precisa de suporte?
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-5"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--tab-active) 11%, transparent)',
                    color: 'var(--tab-active)',
                  }}
                >
                  <Headset className="w-5 h-5" />
                </div>

                <h2 className="text-2xl font-bold tracking-tight">Suporte TI</h2>
                <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  A criação de contas corporativas e recuperação de credenciais é gerida exclusivamente pela equipe de{' '}
                  <strong style={{ color: 'var(--text-main)' }}>Infraestrutura e Governança de TI</strong>.
                </p>

                <a
                  href="https://gestao.iofv.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 w-full py-3.5 px-4 rounded-xl text-sm font-semibold text-white transition-all hover:brightness-105 active:scale-[0.99] flex items-center justify-between group"
                  style={primaryActionStyle}
                >
                  <span>Abrir Chamado no HelpDesk</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </a>

                <div
                  className="mt-6 pt-5 border-t"
                  style={{ borderColor: 'var(--border-input)' }}
                >
                  <button
                    type="button"
                    onClick={() => setActiveView('login')}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline cursor-pointer"
                    style={{ color: 'var(--tab-active)' }}
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Voltar para o login</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Barra discreta de Tema Visual */}
        <footer className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
          <span
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            Tema Visual
          </span>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {themes.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTheme(t.id)}
                className={`w-[18px] h-[18px] rounded-full transition-transform duration-200 cursor-pointer ${
                  theme === t.id ? 'scale-110 ring-2 ring-offset-2' : 'hover:scale-110 opacity-75 hover:opacity-100'
                }`}
                style={{
                  backgroundColor: t.color,
                  border: `1px solid ${t.border}`,
                  '--tw-ring-color': t.color,
                  '--tw-ring-offset-color': 'var(--bg-page)',
                } as React.CSSProperties}
                title={t.name}
                aria-label={`Mudar para o tema ${t.name}`}
              />
            ))}
          </div>
        </footer>
      </main>
    </div>
  );
}
