import { Inbox,Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes,CSSProperties,ReactNode } from 'react';


export const panelStyle: CSSProperties = { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-input)' };
export const sidebarStyle: CSSProperties = { backgroundColor: 'var(--bg-input)', borderRight: '1px solid var(--border-input)' };
export const inputStyle: CSSProperties = { backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-main)' };
export function Button({ children, busy, variant = 'primary', className = '', disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; variant?: 'primary' | 'secondary' | 'danger' }) {
  return <button type="button" {...props} disabled={disabled || busy} aria-busy={busy || undefined} className={`ui-button ui-button-${variant} ${className}`}>{busy && <Loader2 size={16} className="animate-spin" />}{children}</button>;
}
export function LoadingState({ label = 'Carregando...' }: { label?: string }) {
  return <div role="status" className="ui-state"><Loader2 className="animate-spin" size={24} /><span>{label}</span></div>;
}
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="ui-state"><Inbox size={28} aria-hidden="true" /><strong>{title}</strong>{children && <p>{children}</p>}{action}</div>;
}
export function Notice({ children }: { children: ReactNode }) { return <div role="alert" className="ui-notice">{children}</div>; }

export const themeOptions = [
 ['light','Claro'],['dark','Escuro'],['ocean','Oceano'],['nature','Natureza'],['sunset','Pôr do Sol'],['amethyst','Ametista'],['aurora','Aurora'],['solar','Solar'],['coral','Coral'],['graphite','Grafite'],
] as const;
export function ThemeSelect({value,onChange}:{value:string;onChange:(value:string)=>void}) {
 return <label className="flex items-center gap-2 text-xs font-medium text-[var(--text-muted)]"><span>Tema</span><select aria-label="Tema visual" value={value} onChange={event=>onChange(event.target.value)} className="min-h-9 rounded-xl border px-3 text-xs font-medium cursor-pointer" style={inputStyle}>{themeOptions.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>;
}
