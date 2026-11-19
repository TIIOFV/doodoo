'use client';

import { useId, type CSSProperties } from 'react';

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
  const uid = useId().replace(/:/g, '');
  const ribbonId = `doodoo-ribbon-${uid}`;
  const lobeId = `doodoo-lobe-${uid}`;
  const clipId = `doodoo-clip-${uid}`;
  const shadowId = `doodoo-shadow-${uid}`;

  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-hidden="true">
      <defs>
        <linearGradient id={ribbonId} x1="16" y1="8" x2="38" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
          <stop offset="52%" stopColor="currentColor" stopOpacity="0.93" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.80" />
        </linearGradient>
        <linearGradient id={lobeId} x1="10" y1="35" x2="39" y2="31" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.37" />
          <stop offset="58%" stopColor="currentColor" stopOpacity="0.26" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.16" />
        </linearGradient>
        <filter id={shadowId} x="4" y="4" width="56" height="58" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="1.8" stdDeviation="1.8" floodColor="#09041e" floodOpacity="0.28" />
        </filter>
        <clipPath id={clipId}>
          <path d="M15.72 13.6C16.55 9.5 19.15 8.1 22.55 8.1H34.3C47.0 8.1 54.8 18.1 54.8 30.7C54.8 44.5 44.0 55.9 29.6 55.9H15.5C10.5 55.9 8.35 53.1 9.2 49.5L15.72 13.6Z" />
        </clipPath>
      </defs>
      <g filter={`url(#${shadowId})`}>
        <g clipPath={`url(#${clipId})`}>
          {/* Inner folded counter lobe (adapts luminously to every theme background) */}
          <path
            d="M12.8 20.9H27.7C35.0 20.9 39.5 24.9 39.5 30.7C39.5 36.5 36.1 40.2 29.2 42.8L7.6 50.4L12.8 20.9Z"
            fill={`url(#${lobeId})`}
          />
          {/* Outer slanted geometric D ribbon */}
          <path
            d="M14.35 21.2L15.72 13.6C16.55 9.5 19.15 8.1 22.55 8.1H34.3C47.0 8.1 54.8 18.1 54.8 30.7C54.8 44.5 44.0 55.9 29.6 55.9H15.5C10.5 55.9 8.35 53.1 9.2 49.5L29.1 42.5C35.9 40.0 39.2 36.3 39.2 30.7C39.2 25.1 34.8 21.2 27.6 21.2H14.35Z"
            fill={`url(#${ribbonId})`}
          />
        </g>
      </g>
    </svg>
  );
}

export function BrandBadge({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizes = {
    sm: { box: 'w-9 h-9 rounded-xl', icon: 'w-[28px] h-[28px]' },
    md: { box: 'w-11 h-11 rounded-[14px]', icon: 'w-[34px] h-[34px]' },
    lg: { box: 'w-12 h-12 rounded-2xl', icon: 'w-[38px] h-[38px]' },
  }[size];

  return (
    <div
      className={`${sizes.box} flex items-center justify-center text-white flex-shrink-0 relative overflow-hidden ${className}`}
      style={primaryActionStyle}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 20% 18%, rgba(255,255,255,0.32), transparent 58%), radial-gradient(circle at 86% 86%, rgba(255,255,255,0.12), transparent 52%)',
        }}
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
