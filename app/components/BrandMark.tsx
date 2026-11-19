'use client';

import type { CSSProperties } from 'react';

export const HERO_BG_FALLBACK = 'linear-gradient(135deg, #0b1736 0%, #14285b 52%, #253f8f 100%)';
export const NAV_ACTIVE_BG_FALLBACK = 'linear-gradient(135deg, #2563eb 0%, #3730a3 100%)';
export const NAV_ACTIVE_SHADOW_FALLBACK = '0 8px 18px -6px rgb(37 99 235 / 0.42)';

export const heroSurfaceStyle: CSSProperties = {
  backgroundColor: '#0f1f4b',
  backgroundImage: `var(--hero-bg, ${HERO_BG_FALLBACK})`,
};

export const primaryActionStyle: CSSProperties = {
  backgroundColor: 'var(--btn-primary, #2563eb)',
  backgroundImage: `var(--nav-active-bg, ${NAV_ACTIVE_BG_FALLBACK})`,
  boxShadow: `var(--nav-active-shadow, ${NAV_ACTIVE_SHADOW_FALLBACK})`,
};

export const heroGridStyle: CSSProperties = {
  backgroundImage:
    'linear-gradient(to right, rgba(255, 255, 255, 0.055) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.055) 1px, transparent 1px)',
  backgroundSize: '48px 48px',
};

export function LogoDooDoo({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-hidden="true">
      <rect x="4" y="4" width="56" height="56" rx="18" fill="currentColor" fillOpacity="0.18" />
      <path
        d="M22 18H36C45.9411 18 54 26.0589 54 36C54 45.9411 45.9411 54 36 54H22V18Z"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="36" cy="36" r="5" fill="currentColor" />
    </svg>
  );
}

export function BrandBadge({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizes = {
    sm: { box: 'w-9 h-9 rounded-xl', icon: 'w-5 h-5' },
    md: { box: 'w-11 h-11 rounded-[14px]', icon: 'w-6 h-6' },
    lg: { box: 'w-12 h-12 rounded-2xl', icon: 'w-7 h-7' },
  }[size];

  return (
    <div
      className={`${sizes.box} flex items-center justify-center text-white flex-shrink-0 relative overflow-hidden ${className}`}
      style={primaryActionStyle}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(circle at 25% 20%, rgba(255,255,255,0.28), transparent 60%)' }}
      />
      <LogoDooDoo className={`${sizes.icon} relative z-10`} />
    </div>
  );
}

export function HeroOrbitalArt({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 420 420"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`pointer-events-none select-none ${className}`}
      aria-hidden="true"
    >
      <circle cx="210" cy="210" r="196" stroke="currentColor" strokeOpacity="0.16" strokeWidth="1.25" />
      <circle cx="210" cy="210" r="154" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1.5" />
      <circle cx="210" cy="210" r="110" stroke="currentColor" strokeOpacity="0.28" strokeWidth="9" />
      <circle cx="210" cy="210" r="64" stroke="currentColor" strokeOpacity="0.34" strokeWidth="2.5" />
      <circle cx="210" cy="14" r="6" fill="currentColor" fillOpacity="0.45" />
      <path d="M210 48V64M210 356V372M48 210H64M356 210H372" stroke="currentColor" strokeOpacity="0.32" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
