// Айдентика «Білого суперкубка». Єдине джерело графіки — public/assets/icons/supercup.svg:
// усі компоненти нижче використовують саме його, графіка ніде не дублюється.
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { CLUB_BY_ID } from '../data/clubs';
import { assetUrl } from '../game/assets';
import { audio } from '../game/audio';
import { useApp } from '../game/store';
import { Btn, Logo } from './ui';

export const SUPERCUP_SRC = 'assets/icons/supercup.svg';

export function SupercupIcon({ size = 24, className = '', title }: { size?: number; className?: string; title?: string }) {
  return <img className={`sc-icon ${className}`} src={assetUrl(SUPERCUP_SRC)} width={size} height={size} alt={title ?? ''} title={title} style={{ width: size, height: size }} />;
}

/** Горизонтальна емблема гри: темно-зелена плашка, кубок і напис. */
export function SupercupLogo({ compact }: { compact?: boolean }) {
  return (
    <div className={`sc-logo ${compact ? 'compact' : ''}`} role="img" aria-label="Білий суперкубок">
      <SupercupIcon size={compact ? 40 : 132} />
      <div className="sc-word"><span>БІЛИЙ</span><b>СУПЕРКУБОК</b></div>
    </div>
  );
}

/** Позначка чемпіона (таблиця, історія, досягнення). */
export function ChampionshipBadge({ label = 'Чемпіон', small }: { label?: string; small?: boolean }) {
  return <span className={`sc-badge ${small ? 'small' : ''}`}><SupercupIcon size={small ? 16 : 20} />{label}</span>;
}

function goldConfetti(n: number) {
  return Array.from({ length: n }, (_, i) => ({ left: `${(i * 53) % 100}%`, bg: ['#DDBB64', '#F2D98A', '#F7F7F2', '#B8923A'][i % 4], dur: `${3.6 + ((i * 17) % 50) / 10}s`, delay: `${-((i * 11) % 60) / 10}s`, w: 6 + (i % 4) * 2 }));
}

export function GoldConfetti({ count = 80 }: { count?: number }) {
  const { settings } = useApp();
  const items = useMemo(() => goldConfetti(settings.lowGfx ? 0 : count), [settings.lowGfx, count]);
  return <div className="confetti">{items.map((c, i) => <i key={i} style={{ left: c.left, background: c.bg, width: c.w, animationDuration: c.dur, animationDelay: c.delay } as CSSProperties} />)}</div>;
}

/**
 * Кінематографічне вручення кубка (≈6 с): затемнення → силует → промінь → підйом → відблиски → конфеті → напис.
 * Уся анімація — CSS; після завершення викликає onDone.
 */
export function TrophyRevealAnimation({ onDone }: { onDone: () => void }) {
  const [confetti, setConfetti] = useState(false);
  useEffect(() => {
    audio.music(null);
    audio.sfx('drum');
    const t = [
      window.setTimeout(() => audio.sfx('reveal-divine'), 2300),
      window.setTimeout(() => { setConfetti(true); audio.sfx('goal'); }, 3700),
      window.setTimeout(onDone, 6400),
    ];
    return () => t.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="trophy-reveal">
      <div className="tr-beam" />
      <div className="tr-cup"><SupercupIcon size={260} /><i className="glint g1" /><i className="glint g2" /><i className="glint g3" /></div>
      <div className="tr-title">ВИ — ЧЕМПІОНИ!</div>
      {confetti && <GoldConfetti />}
      <div className="skip"><Btn kind="small ghost" onClick={onDone}>Пропустити ⏭</Btn></div>
    </div>
  );
}

/**
 * Універсальний екран чемпіона: будь-який із 18 клубів, жодних вшитих назв чи зображень.
 * Назва, логотип, сезон та очки беруться з даних поточного чемпіонату.
 */
export function WinnerScreen({ winnerClub, season, points, isUser, actions }: { winnerClub: string; season: number; points: number; isUser: boolean; actions: ReactNode }) {
  const def = CLUB_BY_ID[winnerClub];
  useEffect(() => { audio.music('ceremony'); return () => audio.music(null); }, []);
  return (
    <div className="victory">
      <GoldConfetti count={isUser ? 80 : 30} />
      <div className="victory-in">
        <h1 className="v-title">{isUser ? 'ВИ — ЧЕМПІОНИ!' : 'ЧЕМПІОН СЕЗОНУ'}</h1>
        <div className="v-cup"><SupercupIcon size={230} /></div>
        <div className="v-plate">
          <Logo club={winnerClub} size={72} />
          <div><b>{def?.name ?? winnerClub}</b><span>Білий суперкубок · сезон {season} · {points} очок</span></div>
        </div>
        <div className="v-actions">{actions}</div>
      </div>
    </div>
  );
}
