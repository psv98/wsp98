// Компонентна система карток на рамках UI kit: одна рамка на рідкісність, увесь текст і логотипи — у DOM поверх неї.
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { CLUB_BY_ID } from '../data/clubs';
import { ROLE_NAMES } from '../data/formations';
import { RARITY, type Rarity } from '../data/rarity';
import { BUNDLES, SPECIAL_BY_ID, type SpecialDef } from '../data/specials';
import { assetUrl } from '../game/assets';
import { audio } from '../game/audio';
import { useApp } from '../game/store';
import type { PlayerState } from '../systems/types';
import { Btn, Coins } from './ui';

/** Дані будь-якої картки гравця. Нічого з цього не вшито в зображення. */
export interface CardData {
  rarity: Rarity;
  shortName: string;
  fullName: string;
  title?: string;
  role?: string;
  abilityName?: string;
  abilities: string[];
  club?: string; // id клубу, за який грає
  logo: string; // зображення в круглій зоні
  status?: string;
  rating?: number;
  kindLabel?: string;
}

export function specialCard(sp: SpecialDef, isUser = true, extra: Partial<CardData> = {}): CardData {
  return {
    rarity: sp.rarity, shortName: sp.short, fullName: sp.name, title: sp.title, role: sp.roleName, abilityName: sp.ability, abilities: sp.perks,
    logo: sp.img, rating: (isUser ? sp.user : sp.opp).q, kindLabel: sp.kind === 'star' ? 'Світова зірка' : RARITY[sp.rarity].name, ...extra,
  };
}

export function commonCard(p: PlayerState, clubId: string): CardData {
  return {
    rarity: 'common', shortName: `№${p.num}`, fullName: `Гравець №${p.num}`, title: CLUB_BY_ID[clubId].name, role: ROLE_NAMES[p.role], abilities: [],
    club: clubId, logo: CLUB_BY_ID[clubId].logo, rating: Math.round(p.q), kindLabel: RARITY.common.name,
  };
}

export function GameCard({ data, compact, dim, footer, className = '' }: { data: CardData; compact?: boolean; dim?: 'locked' | 'elsewhere'; footer?: ReactNode; className?: string }) {
  const r = RARITY[data.rarity];
  return (
    <div className={`gcard ${compact ? 'compact' : ''} ${dim ?? ''} ${className}`} style={{ '--rc': r.color } as CSSProperties} role="group" aria-label={`${data.kindLabel ?? r.name}: ${data.fullName}`}>
      <div className="gc-frame" style={{ backgroundImage: `url(${assetUrl(r.frame)})` }}>
        {data.rating != null && <span className="gc-q">{data.rating}</span>}
        <div className="gc-port"><img src={assetUrl(data.logo)} alt="" loading="lazy" /></div>
        {data.club && CLUB_BY_ID[data.club].logo !== data.logo && <img className="gc-club" src={assetUrl(CLUB_BY_ID[data.club].logo)} alt="" loading="lazy" />}
        <div className="gc-plate"><span>{data.shortName}</span></div>
        <div className="gc-text">
          <b>{data.fullName}</b>
          {data.title && <i>«{data.title}»</i>}
          {data.role && <small>{data.role}</small>}
          {data.abilityName && <em>{data.abilityName}</em>}
        </div>
        {data.status && <span className="gc-status">{data.status}</span>}
      </div>
      {!compact && data.abilities.length > 0 && <ul className="gc-perks">{data.abilities.map((p) => <li key={p}>{p}</li>)}</ul>}
      {footer}
    </div>
  );
}

/** Картка особливого персонажа (ІМІ або світової зірки). */
export function PlayerCard({ sp, isUser = true, compact, className = '', note, footer, dim }: { sp: SpecialDef; isUser?: boolean; compact?: boolean; className?: string; note?: string; footer?: ReactNode; dim?: 'locked' | 'elsewhere' }) {
  return <GameCard data={specialCard(sp, isUser, { status: note })} compact={compact} className={className} footer={footer} dim={dim} />;
}

export function JackpotCard({ amount, sponsor }: { amount: number; sponsor?: boolean }) {
  const data: CardData = {
    rarity: sponsor ? 'rare' : 'divine', kindLabel: sponsor ? 'Трансферна подія' : 'Секретний трансфер',
    shortName: `+${amount.toLocaleString('uk-UA')} MC`, fullName: sponsor ? 'Спонсорський бонус' : 'Фінансовий джекпот ІМІ',
    title: sponsor ? 'Партнери підтримали клуб' : 'Трансферний бюджет погоджено!', logo: 'assets/ui/branding/imi-round-original.svg',
    abilities: sponsor ? [] : ['Відкрито трансферний ринок світових зірок', 'Мессі, Роналду, Неймар, Буффон', 'Вікно діє обмежену кількість турів'],
  };
  return <GameCard data={data} className="jackpot" />;
}

export interface ShowItem { special?: string; jackpot?: number; sponsor?: number }

function particles(n: number) {
  return Array.from({ length: n }, (_, i) => ({ left: `${(i * 37) % 100}%`, dur: `${3 + ((i * 13) % 40) / 10}s`, delay: `${((i * 7) % 30) / 10}s`, dx: `${((i * 29) % 80) - 40}px` }));
}

/**
 * Кінематографічна сцена показу карток: затемнення → прожектори → барабанний дріб → картка → деталі → дії.
 * Використовується і для мегатрансферів користувача, і для попередження про зірок суперника.
 */
export function Showcase({ rarity, head, sub, items, isUser, actions, onSkip, drum = true, footerNote }: {
  rarity: Rarity; head: string; sub?: string; items: ShowItem[]; isUser: boolean; actions: ReactNode; onSkip?: () => void; drum?: boolean; footerNote?: string;
}) {
  const { settings } = useApp();
  const [shown, setShown] = useState(drum ? -1 : 0); // -1 — картка ще закрита
  const r = RARITY[rarity];
  const parts = useMemo(() => particles(settings.lowGfx ? 0 : rarity === 'divine' ? 46 : rarity === 'mythic' ? 34 : 20), [rarity, settings.lowGfx]);
  const partsN = shown < 0 ? Math.min(parts.length, 16) : parts.length; // кількість частинок теж не видає рідкісність

  useEffect(() => {
    if (drum) audio.sfx('drum'); else audio.sfx('alert');
    const timers: number[] = [];
    const t0 = drum ? 1750 : 500;
    items.forEach((_, i) => timers.push(window.setTimeout(() => { setShown(i + 1); audio.sfx(`reveal-${rarity === 'common' ? 'rare' : rarity}`); }, t0 + i * 1300)));
    if (rarity === 'divine') timers.push(window.setTimeout(() => audio.music('divine'), t0));
    return () => { timers.forEach(clearTimeout); if (rarity === 'divine') audio.music(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const done = shown >= items.length;
  // поки картку не відкрито — жодних підказок: нейтральні колір, рамка й заголовок
  const hidden = shown < 0;
  return (
    <div className={`reveal ${hidden ? 'hidden-card' : rarity}`} style={{ '--rc': hidden ? '#ffffff' : r.color } as CSSProperties}>
      <div className="spot s1" /><div className="spot s2" />
      <div className="parts">{parts.slice(0, partsN).map((p, i) => <i key={i} style={{ left: p.left, animationDuration: p.dur, animationDelay: p.delay, '--dx': p.dx } as CSSProperties} />)}</div>
      {onSkip && !done && <div className="skip"><Btn kind="small silver" onClick={() => setShown(items.length)}>Пропустити ⏭</Btn></div>}
      {hidden ? <div className="head">МЕГАТРАНСФЕР</div> : <div className="head" key="h">{head}</div>}
      {!hidden && sub && <div className="sub">{sub}</div>}
      <div className={`stage n${items.length}`}>
        {shown < 0 && <div className="flip-wait"><div className="gcard"><div className="gc-frame gc-back" style={{ backgroundImage: `url(${assetUrl('assets/art/cardback.webp')})` }} aria-label="Закрита картка" /></div></div>}
        {items.map((it, i) => i < Math.max(shown, 0) && (
          <div className="flip" key={i}>
            {it.special ? <PlayerCard sp={SPECIAL_BY_ID[it.special]} isUser={isUser} /> : <JackpotCard amount={it.jackpot ?? it.sponsor ?? 0} sponsor={it.sponsor != null} />}
          </div>
        ))}
      </div>
      {done && footerNote && <div className="sub">{footerNote}</div>}
      {done && <div className="acts">{actions}</div>}
    </div>
  );
}

export function unitItems(unitId: string): { items: ShowItem[]; rarity: Rarity; head: string; sub?: string } {
  if (unitId === 'trio' || unitId === 'duo') {
    const b = BUNDLES[unitId];
    return { items: b.members.map((m) => ({ special: m })), rarity: 'legendary', head: b.name.toUpperCase(), sub: b.bonus };
  }
  const sp = SPECIAL_BY_ID[unitId];
  return { items: [{ special: unitId }], rarity: sp.rarity, head: sp.kind === 'star' ? 'СВІТОВА ЗІРКА' : `${RARITY[sp.rarity].name.toUpperCase()} МЕГАТРАНСФЕР` };
}

export function MarketCard({ sp, owned, soldTo, canBuy, onBuy }: { sp: SpecialDef; owned: boolean; soldTo?: string; canBuy: boolean; onBuy: () => void }) {
  return (
    <PlayerCard sp={sp} compact note={owned ? 'У вашому клубі' : soldTo ? `Грає за: ${soldTo}` : undefined} footer={
      <div className="gc-foot">
        <Coins n={sp.price ?? 0} />
        {!owned && !soldTo && <Btn kind="primary small block" disabled={!canBuy} onClick={onBuy} sound="coin">Придбати</Btn>}
      </div>} />
  );
}
