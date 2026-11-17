// Базові компоненти інтерфейсу та локальні SVG-іконки дизайн-системи.
import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { CLUB_BY_ID } from '../data/clubs';
import { RARITY, type Rarity } from '../data/rarity';
import { assetUrl } from '../game/assets';
import { fatigueColor } from '../simulation/fatigue';
import { audio } from '../game/audio';
import { go, useApp, type Screen } from '../game/store';

const ICONS: Record<string, ReactNode> = {
  crown: <path d="M3 18h18v2.2H3zM3 16l-1.2-9 5.4 4L12 4l4.8 7 5.4-4L21 16z" />,
  flame: <path d="M12.6 1.5c.6 3-1 4.9-2.6 6.8C8.2 10.4 6.5 12.4 6.5 15.4A5.6 5.6 0 0 0 12 21a5.6 5.6 0 0 0 5.5-5.6c0-2.1-.8-3.7-1.8-5.2-.2 1.5-.9 2.5-2 3.1.5-2.6.4-5-.2-7.3-.3-1.3-.6-2.7-.9-4.500zM12 19.200a2.6 2.6 0 0 1-2.6-2.600c0-1.3.8-2.1 1.5-3 .3.9.9 1.4 1.6 1.6.2-.7.2-1.3.1-1.9 1 .9 2 2 2 3.300a2.6 2.6 0 0 1-2.6 2.600z" />,
  star: <path d="M12 2l3 6.6 7.2.8-5.4 4.9 1.5 7.100L12 17.8 5.7 21.400l1.5-7.100L1.8 9.4 9 8.600z" />,
  shield: <path d="M12 2l8 3v6.200c0 5-3.3 9-8 10.8-4.7-1.8-8-5.8-8-10.800V5zm0 3.100L7 6.900v4.300c0 3.3 2 6.1 5 7.600z" />,
  diamond: <path d="M6.5 3h11L22 9l-10 12L2 9zm1 2L5 8.500h4.200L10.5 5zm6 0l1.3 3.500H19L16.5 5zM9.5 10.500l2.5 7 2.5-7z" />,
  coin: <><circle cx="12" cy="12" r="9.5" /><path d="M8 16V8l4 5 4-5v8" fill="none" stroke="#7a5600" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></>,
  back: <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />,
  cog: <path d="M12 8.500a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm9 5V10.500l-2.4-.5a7 7 0 0 0-.8-1.900l1.4-2-2.1-2.1-2 1.400a7 7 0 0 0-1.9-.8L12.7 2H10.300l-.5 2.600a7 7 0 0 0-1.9.800l-2-1.4-2.1 2.1 1.4 2a7 7 0 0 0-.8 1.900L2 10.500v3l2.4.5c.2.7.5 1.3.8 1.900l-1.4 2 2.1 2.1 2-1.400c.6.3 1.2.6 1.9.800l.5 2.600h2.400l.5-2.600a7 7 0 0 0 1.9-.8l2 1.4 2.1-2.1-1.4-2c.3-.6.6-1.2.8-1.900z" fillRule="evenodd" />,
  plus: <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />,
  cross: <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />,
  full: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />,
  pause: <path d="M7 5h3.500v14H7zM13.5 5H17v14h-3.500z" />,
  play: <path d="M7 4.500v15l12-7.500z" />,
  sound: <path d="M4 9.500v5h3.500L12 19V5L7.5 9.500zM15 8.500a5 5 0 0 1 0 7M17.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  mute: <path d="M4 9.500v5h3.500L12 19V5L7.5 9.500zM16 9.500l5 5M21 9.500l-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
};

export function Icon({ name, size = 20, color = 'currentColor', style }: { name: string; size?: number; color?: string; style?: CSSProperties }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill={color} style={style} aria-hidden="true">{ICONS[name]}</svg>;
}

export function RarityIcon({ rarity, size = 20 }: { rarity: Rarity; size?: number }) {
  return <img className="rar-icon" src={assetUrl(RARITY[rarity].iconSrc)} width={size} height={size} alt="" style={{ width: size, height: size }} />;
}

export function Logo({ club, size = 40, src }: { club?: string; size?: number; src?: string }) {
  const path = src ?? (club ? CLUB_BY_ID[club]?.logo : 'assets/ui/branding/imi-round-original.svg') ?? 'assets/ui/branding/imi-round-original.svg';
  return <img className="logo" src={assetUrl(path)} width={size} height={size} alt="" loading="lazy" style={{ width: size, height: size }} />;
}

export function Coins({ n, sign }: { n: number; sign?: boolean }) {
  return <span className="coin"><Icon name="coin" size={16} color="#f5c542" />{sign && n > 0 ? '+' : ''}{n.toLocaleString('uk-UA')} MC</span>;
}

export function Btn({ children, onClick, kind = '', disabled, title, sound = 'click' }: { children: ReactNode; onClick?: () => void; kind?: string; disabled?: boolean; title?: string; sound?: string | null }) {
  return <button type="button" className={`btn ${kind}`} disabled={disabled} title={title} onClick={() => { audio.unlock(); if (sound) audio.sfx(sound); onClick?.(); }}>{children}</button>;
}

export function TopBar({ title, back, right }: { title: string; back?: Screen | (() => void); right?: ReactNode }) {
  const app = useApp();
  const onBack = typeof back === 'function' ? back : () => go(back ?? (app.save ? 'hub' : 'title'));
  return (
    <div className="topbar">
      <button type="button" className="iconbtn" aria-label="Назад" onClick={() => { audio.sfx('click'); onBack(); }}><Icon name="back" /></button>
      <h2 className="grow ell">{title}</h2>
      {right}
      {app.save && <Coins n={app.save.coins} />}
    </div>
  );
}

export function Modal({ children, onClose, wide }: { children: ReactNode; onClose?: () => void; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="overlay" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="modal" style={wide ? { width: 'min(760px, 100%)' } : undefined}>{children}</div>
    </div>
  );
}

export function StaminaBar({ v }: { v: number }) {
  return <div className="sbar" title={`Витривалість ${Math.round(v)}%`}><i className={`c-${fatigueColor(v)}`} style={{ width: `${Math.max(3, v)}%` }} /></div>;
}

export function Toast() {
  const { toast } = useApp();
  return toast ? <div className={`toast ${toast.kind === 'err' ? 'err' : ''}`} role="status">{toast.text}</div> : null;
}
