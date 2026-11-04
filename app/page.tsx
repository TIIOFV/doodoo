'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Info, ArrowRight, Eye, EyeOff, CheckCheck, Headset } from 'lucide-react';
import { supabase } from './lib/supabase'; // Ajuste o caminho se necessário (ex: '../lib/supabase')

const LogoDooDoo = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
    <rect x="4" y="4" width="56" height="56" rx="18" fill="currentColor" fillOpacity="0.15" />
    <path d="M22 18H36C45.9411 18 54 26.0589 54 36C54 45.9411 45.9411 54 36 54H22V18Z" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="36" cy="36" r="5" fill="currentColor" />
  </svg>
);

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState('light');
  const [activeTab, setActiveTab] = useState<'login' | 'suporte'>('login');
  
  const [isInitializing, setIsInitializing] = useState(true);

  const glassPanel = { 
    backgroundColor: 'color-mix(in srgb, var(--bg-card) 75%, transparent)', 
    backdropFilter: 'blur(40px)', 
    WebkitBackdropFilter: 'blur(40px)', 
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.08)'
  };

  // 1. CARREGAR TEMA GUARDADO E E-MAIL NO MOUNT
  useEffect(() => {
    const savedTheme = localStorage.getItem('doodoo_theme');
    if (savedTheme) setTheme(savedTheme);

    const savedEmail = localStorage.getItem('doodoo_remember_email');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  // 2. ATUALIZAR TEMA NO DOM
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('doodoo_theme', theme);
  }, [theme]);

  // 3. VERIFICAR SESSÃO ATIVA OU SSO NO ARRANQUE
  useEffect(() => {
    const checkExistingSession = async () => {
      // A. Verificar Magic Link / SSO Hash
      const hash = window.location.hash;
      if (hash && hash.includes('access_token=') && hash.includes('refresh_token=')) {
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

      // B. Verificar Sessão Normal
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push('/dashboard');
        return;
      }

      setIsInitializing(false);
    };

    checkExistingSession();
  }, [router]);

  if (isInitializing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center transition-colors duration-500" style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-main)' }}>
        <div className="w-16 h-16 rounded-[1.25rem] bg-brand-panel flex items-center justify-center text-white shadow-xl mb-6 animate-pulse">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
        <h2 className="text-xl font-extrabold tracking-tight">Preparando Ambiente...</h2>
        <p className="text-xs mt-2 opacity-60 font-medium">Conectando ao Doo-Doo OS Corporativo</p>
      </div>
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // Bloqueio duplo clique
    
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
    } catch (err: any) {
      console.error(err);
      setError('As credenciais inseridas estão incorretas. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

const themes = [
    { id: 'light', name: 'Claro', color: '#f5f5f7', border: '#d2d2d7' },
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8 transition-colors duration-500 relative z-0" style={{ backgroundColor: 'var(--bg-page)' }}>
      
      {/* 🚀 CSS INJETADO PARA CORRIGIR O BUG DOS DOIS OLHOS NO MICROSOFT EDGE */}
      <style dangerouslySetInnerHTML={{__html: `
        input[type="password"]::-ms-reveal,
        input[type="password"]::-ms-clear {
          display: none;
        }
      `}} />

      {/* LUZES DE FUNDO AMBIENTE */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[10%] -left-[10%] w-[50vw] h-[50vw] rounded-full bg-brand-panel opacity-20 blur-[140px]"></div>
        <div className="absolute top-[50%] -right-[10%] w-[45vw] h-[45vw] rounded-full bg-brand-panel opacity-20 blur-[140px]"></div>
      </div>

      <main className="w-full max-w-5xl min-h-[600px] flex flex-col md:flex-row rounded-[2.5rem] md:rounded-[3rem] overflow-hidden transition-all duration-500 relative z-10 border shadow-2xl" style={{ ...glassPanel, borderColor: 'color-mix(in srgb, var(--border-input) 60%, transparent)' }}>
        
        {/* PAINEL ESQUERDO INSTITUCIONAL (Desktop) */}
        <div className="hidden md:flex w-1/2 p-12 flex-col justify-between relative overflow-hidden transition-all duration-500 bg-brand-panel">
          <div className="absolute -top-[20%] -left-[10%] w-96 h-96 bg-white/20 blur-3xl rounded-full pointer-events-none"></div>
          <div className="absolute -bottom-[20%] -right-[10%] w-96 h-96 bg-black/10 blur-3xl rounded-full pointer-events-none"></div>

          <div className="relative z-10">
            <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-[1.25rem] flex items-center justify-center mb-8 border border-white/30 shadow-lg">
              <LogoDooDoo className="text-white w-10 h-10" />
            </div>
            <h1 className="text-white text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight">
              Bem-vindo ao<br />Doo Doo.
            </h1>
            <p className="text-white/90 mt-5 text-lg font-medium max-w-sm">
              O ecossistema corporativo centralizado para a sua equipe.
            </p>
          </div>

          <div className="relative z-10">
            <div className="flex items-center space-x-3 text-white/70 text-sm font-semibold tracking-wide uppercase">
              <span className="w-8 h-[2px] bg-white/30"></span>
              <p>Governança & Inovação TI</p>
            </div>
          </div>
        </div>

        {/* PAINEL DIREITO - FORMULÁRIO */}
        <div className="w-full md:w-1/2 flex flex-col p-8 md:p-12 relative transition-all duration-500" style={{ color: 'var(--text-main)' }}>
          
          <div className="absolute left-0 top-0 bottom-0 w-8 pointer-events-none hidden md:block" style={{ background: 'linear-gradient(to right, rgba(0,0,0,0.02), transparent)' }}></div>

          {/* Cabeçalho Mobile */}
          <div className="md:hidden flex flex-col items-center mb-8 mt-2">
            <div className="w-16 h-16 bg-brand-panel rounded-2xl flex items-center justify-center text-white shadow-lg mb-4">
              <LogoDooDoo className="w-9 h-9" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight">Doo Doo</h1>
          </div>

          {/* MENU DE NAVEGAÇÃO DE ABAS (Estilo Limpo) */}
          <div className="flex space-x-6 sm:space-x-8 mb-8 sm:mb-10 border-b relative z-10" style={{ borderColor: 'color-mix(in srgb, var(--border-input) 50%, transparent)' }}>
            <button onClick={() => setActiveTab('login')} className={`pb-3 text-sm font-bold transition-all cursor-pointer relative flex flex-col items-center ${activeTab === 'login' ? 'opacity-100' : 'opacity-40 hover:opacity-80'}`}>
              <span>Acesso Restrito</span>
              {activeTab === 'login' && <div className="absolute bottom-[-1px] w-full h-[3px] rounded-t-full transition-all duration-300 shadow-[0_0_8px_var(--tab-active)]" style={{ backgroundColor: 'var(--tab-active)' }}></div>}
            </button>
            <button onClick={() => setActiveTab('suporte')} className={`pb-3 text-sm font-bold transition-all cursor-pointer relative flex flex-col items-center ${activeTab === 'suporte' ? 'opacity-100' : 'opacity-40 hover:opacity-80'}`}>
              <span>Suporte TI</span>
              {activeTab === 'suporte' && <div className="absolute bottom-[-1px] w-full h-[3px] rounded-t-full transition-all duration-300 shadow-[0_0_8px_var(--tab-active)]" style={{ backgroundColor: 'var(--tab-active)' }}></div>}
            </button>
          </div>

          <div className="flex-1 flex flex-col justify-center relative z-10">
            {activeTab === 'login' ? (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-2">Iniciar Sessão</h2>
                <p className="text-sm mb-6 sm:mb-8 font-medium" style={{ color: 'var(--text-muted)' }}>Insira as suas credenciais corporativas.</p>

                {error && (
                  <div className="w-full text-[13px] font-bold px-4 py-3.5 rounded-2xl border mb-6 flex items-center animate-in fade-in" style={{ backgroundColor: 'var(--error-bg)', color: 'var(--error-text)', borderColor: 'var(--error-border)' }}>
                    <Info className="w-4 h-4 mr-2 flex-shrink-0" />
                    {error}
                  </div>
                )}

                <form onSubmit={handleLogin} className="space-y-6">
                  <div className="space-y-5">
                    <div>
                      <label htmlFor="email" className="text-[11px] font-bold uppercase tracking-widest mb-1.5 block opacity-70">E-mail corporativo</label>
                      <input
                        id="email"
                        type="email"
                        autoComplete="email" 
                        inputMode="email"
                        disabled={loading}
                        className="w-full px-4 py-3.5 text-[16px] md:text-sm font-medium rounded-xl border focus:outline-none focus:ring-2 focus:ring-offset-1 transition-all disabled:opacity-50"
                        style={{ backgroundColor: 'color-mix(in srgb, var(--bg-input) 60%, transparent)', borderColor: 'var(--border-input)', color: 'var(--text-main)', '--tw-ring-color': 'var(--tab-active)' } as React.CSSProperties}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="password" className="text-[11px] font-bold uppercase tracking-widest mb-1.5 block opacity-70">Senha</label>
                      <div className="relative">
                        <input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          disabled={loading}
                          className="w-full pl-4 pr-12 py-3.5 text-[16px] md:text-sm font-medium rounded-xl border focus:outline-none focus:ring-2 focus:ring-offset-1 transition-all disabled:opacity-50"
                          style={{ backgroundColor: 'color-mix(in srgb, var(--bg-input) 60%, transparent)', borderColor: 'var(--border-input)', color: 'var(--text-main)', '--tw-ring-color': 'var(--tab-active)' } as React.CSSProperties}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          disabled={loading}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-50"
                          style={{ color: 'var(--text-muted)' }}
                          aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                        >
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center space-x-2.5 cursor-pointer group select-none relative">
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${rememberMe ? 'border-transparent shadow-md' : 'border-gray-400 group-hover:border-gray-500'}`} style={rememberMe ? { backgroundColor: 'var(--tab-active)' } : {}}>
                        {rememberMe && <CheckCheck className="w-3.5 h-3.5 text-white stroke-[3]" />}
                      </div>
                      <span className="text-[13px] font-bold opacity-70 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-main)' }}>Lembrar e-mail</span>
                      
                      {/* sr-only permite navegação por teclado e acessibilidade real */}
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={rememberMe} 
                        onChange={(e) => setRememberMe(e.target.checked)} 
                        disabled={loading}
                      />
                      <div className="absolute inset-0 -left-1 -top-1 -bottom-1 -right-1 rounded-lg border-2 border-transparent peer-focus:border-blue-500 pointer-events-none transition-colors"></div>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 rounded-xl text-[15px] font-extrabold transition-all hover:scale-[1.01] active:scale-[0.98] flex justify-center items-center shadow-lg mt-4 group border-0 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
                    style={{ backgroundColor: 'var(--btn-primary)', color: 'var(--btn-text)' }}
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                      <>
                        Entrar no Dashboard
                        <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>
                </form>
              </div>
            ) : (
              <div className="animate-in fade-in slide-in-from-left-4 duration-500 flex flex-col items-center text-center py-6">
                <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{ backgroundColor: 'color-mix(in srgb, var(--border-input) 50%, transparent)' }}>
                  <Headset className="w-10 h-10 opacity-70" style={{ color: 'var(--text-main)' }} />
                </div>
                <h2 className="text-2xl font-extrabold tracking-tight mb-3">Precisa de Ajuda?</h2>
                <p className="text-[13px] mb-8 leading-relaxed max-w-sm font-medium" style={{ color: 'var(--text-muted)' }}>
                  A criação de contas corporativas e recuperação de credenciais é gerida exclusivamente pela equipe de <strong>Infraestrutura e Governança de TI</strong>.
                </p>
                <a 
                  href="https://gestao.iofv.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-4 rounded-xl text-[13px] font-extrabold transition-all hover:bg-black/5 dark:hover:bg-white/5 active:scale-[0.98] shadow-sm border block w-full max-w-xs text-center cursor-pointer flex items-center justify-center space-x-2" 
                  style={{ borderColor: 'var(--border-input)', color: 'var(--text-main)', backgroundColor: 'transparent' }}
                >
                  <span>Abrir Chamado no HelpDesk</span>
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            )}
          </div>

          <div className="mt-10 pt-6 border-t flex items-center justify-between relative z-10" style={{ borderColor: 'color-mix(in srgb, var(--border-input) 50%, transparent)' }}>
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-50" style={{ color: 'var(--text-main)' }}>Tema Visual</span>
            
            {/* 🚀 AQUI ESTÁ A CORREÇÃO: flex-wrap e gap garantem que se adapta no mobile */}
            <div className="flex flex-wrap justify-end gap-2 sm:gap-2.5 max-w-[200px] sm:max-w-none">
              {themes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full transition-transform duration-300 cursor-pointer ${
                    theme === t.id ? 'scale-125 ring-2 ring-offset-2' : 'hover:scale-110 opacity-80 hover:opacity-100'
                  }`}
                  style={{ 
                    backgroundColor: t.color, 
                    border: `1px solid ${t.border}`,
                    boxShadow: theme !== t.id ? '0 2px 4px rgba(0,0,0,0.15)' : 'none',
                    '--tw-ring-color': t.color, 
                    '--tw-ring-offset-color': 'var(--bg-card)' 
                  } as React.CSSProperties}
                  title={t.name}
                  aria-label={`Mudar para o tema ${t.name}`}
                />
              ))}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}