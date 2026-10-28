'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Info, ArrowRight } from 'lucide-react';
import { supabase } from './lib/supabase';

// Logotipo Exclusivo Doo Doo (SVG Customizado)
const LogoDooDoo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect x="4" y="4" width="56" height="56" rx="18" fill="currentColor" fillOpacity="0.15" />
    <path d="M22 18H36C45.9411 18 54 26.0589 54 36C54 45.9411 45.9411 54 36 54H22V18Z" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="36" cy="36" r="5" fill="currentColor" />
  </svg>
);

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState('light');
  const [activeTab, setActiveTab] = useState<'login' | 'suporte'>('login');
  
  // 🚀 NOVO: Estado para exibir a tela de carregamento do SSO
  const [isSsoLoading, setIsSsoLoading] = useState(true);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // 🚀 NOVO: Captura o Token SSO e bloqueia a exibição do login enquanto processa
  useEffect(() => {
    const handleSSO = async () => {
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
            return; // Mantém o loading ativo até redirecionar
          }
        }
      }
      // Se não houver hash de SSO, libera a tela de login normalmente
      setIsSsoLoading(false);
    };
    handleSSO();
  }, [router]);

  // 🚀 NOVO: Tela de transição limpa enquanto o SSO é injetado
  if (isSsoLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center transition-colors duration-500" style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-main)' }}>
        <div className="w-16 h-16 rounded-2xl bg-brand-panel flex items-center justify-center text-white shadow-xl mb-6 animate-pulse">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
        <h2 className="text-xl font-extrabold tracking-tight">Sincronizando Sessão...</h2>
        <p className="text-xs mt-2 opacity-60 font-medium">Entrando automaticamente no Doo-Doo Corporativo</p>
      </div>
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;
      if (data.session) router.push('/dashboard');
    } catch (err: any) {
      console.error(err);
      setError('E-mail ou senha incorretos.');
    } finally {
      setLoading(false);
    }
  };

  // Cores atualizadas com bordas específicas para não sumirem no fundo
  const themes = [
    { id: 'light', name: 'Claro', color: '#f5f5f7', border: '#d2d2d7' },
    { id: 'dark', name: 'Escuro', color: '#0f172a', border: '#475569' },
    { id: 'ocean', name: 'Oceano', color: '#005bb5', border: '#005bb5' },
    { id: 'nature', name: 'Natureza', color: '#2e8b57', border: '#2e8b57' },
    { id: 'sunset', name: 'Pôr do Sol', color: '#d9534f', border: '#d9534f' },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8 transition-colors duration-500" style={{ backgroundColor: 'var(--bg-page)' }}>
      
      <main className="w-full max-w-5xl min-h-[600px] flex flex-col md:flex-row rounded-[2rem] overflow-hidden shadow-2xl transition-all duration-500" style={{ backgroundColor: 'var(--bg-card)' }}>
        
        {/* Painel Esquerdo com Degradê */}
        <div className="hidden md:flex w-1/2 p-12 flex-col justify-between relative overflow-hidden transition-all duration-500 bg-brand-panel">
          <div className="absolute -top-[20%] -left-[10%] w-96 h-96 bg-white/20 blur-3xl rounded-full pointer-events-none"></div>
          <div className="absolute -bottom-[20%] -right-[10%] w-96 h-96 bg-black/10 blur-3xl rounded-full pointer-events-none"></div>

          <div className="relative z-10">
            {/* Novo Logotipo Aplicado */}
            <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-6 border border-white/30 shadow-lg">
              <LogoDooDoo className="text-white w-10 h-10" />
            </div>
            <h1 className="text-white text-4xl font-bold tracking-tight leading-tight">
              Bem-vindo ao<br />Doo Doo.
            </h1>
            <p className="text-white/80 mt-4 text-lg font-medium max-w-sm">
              O ecossistema corporativo centralizado para a sua equipe.
            </p>
          </div>

          <div className="relative z-10">
            <div className="flex items-center space-x-3 text-white/70 text-sm font-medium">
              <span className="w-8 h-[2px] bg-white/30"></span>
              <p>Governança & Inovação TI</p>
            </div>
          </div>
        </div>

        {/* Painel Direito - Formulário */}
        <div className="w-full md:w-1/2 flex flex-col p-8 md:p-12 relative transition-all duration-500" style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}>
          
          <div className="absolute left-0 top-0 bottom-0 w-8 pointer-events-none hidden md:block" style={{ background: 'linear-gradient(to right, rgba(0,0,0,0.04), transparent)' }}></div>

          <div className="flex space-x-8 mb-10 border-b relative z-10" style={{ borderColor: 'var(--border-input)' }}>
            <button 
              onClick={() => setActiveTab('login')}
              className={`pb-3 text-sm font-semibold transition-colors relative ${activeTab === 'login' ? 'opacity-100' : 'opacity-50 hover:opacity-80'}`}
            >
              Acesso Restrito
              {activeTab === 'login' && <div className="absolute bottom-[-1px] left-0 right-0 h-[2px] rounded-t-full transition-all duration-300" style={{ backgroundColor: 'var(--tab-active)' }}></div>}
            </button>
            <button 
              onClick={() => setActiveTab('suporte')}
              className={`pb-3 text-sm font-semibold transition-colors relative ${activeTab === 'suporte' ? 'opacity-100' : 'opacity-50 hover:opacity-80'}`}
            >
              Suporte TI
              {activeTab === 'suporte' && <div className="absolute bottom-[-1px] left-0 right-0 h-[2px] rounded-t-full transition-all duration-300" style={{ backgroundColor: 'var(--tab-active)' }}></div>}
            </button>
          </div>

          <div className="flex-1 flex flex-col justify-center relative z-10">
            {activeTab === 'login' ? (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                <h2 className="text-2xl font-bold tracking-tight mb-2">Iniciar Sessão</h2>
                <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>Insira suas credenciais corporativas para continuar.</p>

                {error && (
                  <div className="w-full text-sm font-medium px-4 py-3 rounded-xl border mb-6 transition-colors duration-500" style={{ backgroundColor: 'var(--error-bg)', color: 'var(--error-text)', borderColor: 'var(--error-border)' }}>
                    {error}
                  </div>
                )}

                <form onSubmit={handleLogin} className="space-y-5">
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)' }}>E-mail corporativo</label>
                      <input
                        type="email"
                        className="w-full px-4 py-3 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-offset-1 transition-all"
                        style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)', '--tw-ring-color': 'var(--tab-active)' } as React.CSSProperties}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)' }}>Senha</label>
                      <input
                        type="password"
                        className="w-full px-4 py-3 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-offset-1 transition-all"
                        style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)', '--tw-ring-color': 'var(--tab-active)' } as React.CSSProperties}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 rounded-xl text-sm font-bold transition-all hover:opacity-90 flex justify-center items-center shadow-lg active:scale-[0.98] mt-2 group border-0"
                    style={{ backgroundColor: 'var(--btn-primary)', color: 'var(--btn-text)' }}
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                      <>
                        Entrar na Dashboard
                        <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>
                </form>
              </div>
            ) : (
              <div className="animate-in fade-in slide-in-from-left-4 duration-500 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mb-6" style={{ backgroundColor: 'var(--border-input)' }}>
                  <Info className="w-8 h-8 opacity-70" style={{ color: 'var(--text-main)' }} />
                </div>
                <h2 className="text-2xl font-bold tracking-tight mb-2">Precisa de Ajuda?</h2>
                <p className="text-sm mb-8 leading-relaxed max-w-sm" style={{ color: 'var(--text-muted)' }}>
                  A criação de contas e recuperação de senhas são gerenciadas pela equipe de Infraestrutura e Governança de TI do Doo Doo.
                </p>
                <a 
                  href="https://gestao.iofv.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90 shadow-sm border block w-full max-w-xs text-center" 
                  style={{ borderColor: 'var(--border-input)', color: 'var(--text-main)', backgroundColor: 'transparent' }}
                >
                  Abrir Chamado no HelpDesk
                </a>
              </div>
            )}
          </div>

          <div className="mt-8 pt-6 border-t flex items-center justify-between relative z-10" style={{ borderColor: 'var(--border-input)' }}>
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Tema da Interface</span>
            <div className="flex space-x-3">
              {themes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`w-5 h-5 rounded-full transition-all duration-300 border-2 ${
                    theme === t.id ? 'scale-125 ring-2 ring-offset-2' : 'hover:scale-110 opacity-70 hover:opacity-100'
                  }`}
                  style={{ 
                    backgroundColor: t.color, 
                    borderColor: t.border, // Aplica a borda definida no array
                    '--tw-ring-color': t.color, 
                    '--tw-ring-offset-color': 'var(--bg-card)' 
                  } as React.CSSProperties}
                  title={t.name}
                />
              ))}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}