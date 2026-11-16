// Компонентна система карток: один шаблон для всіх персонажів, комплектів, зірок і секретних подій.
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { RARITY, type Rarity } from '../data/rarity';
import { BUNDLES, SPECIAL_BY_ID, type SpecialDef } from '../data/specials';
import { assetUrl } from '../game/assets';
import { audio } from '../game/audio';
import { useApp } from '../game/store';
import { Btn, Coins, Icon, RarityIcon } from './ui';

export function PlayerCard({ sp, isUser = true, compact, className = '', note, footer, showQ = true }: { sp: SpecialDef; isUser?: boolean; compact?: boolean; className?: string; note?: string; footer?: ReactNode; showQ?: boolean }) {
  const r = RARITY[sp.rarity];
  const fx = isUser ? sp.user : sp.opp;
  return (
    <div className={`pcard ${compact ? 'compact' : ''} ${className}`} style={{ '--rc': r.color } as CSSProperties} data-note={note}>
      <div className="in" data-note={note}>
        {showQ && <span className="q">{fx.q}</span>}
        <div className="rar"><RarityIcon rarity={sp.rarity} size={22} />{sp.kind === 'star' ? 'Світова зірка' : r.name}</div>
        <div className="port"><img src={assetUrl(sp.img)} alt="" /></div>
        <div className="pname">{sp.name}</div>
        <div className="ptitle">«{sp.title}»</div>
        <div className="prole">{sp.roleName}</div>
        <div className="pab">{sp.ability}</div>
        {!compact && <ul>{sp.perks.map((p) => <li key={p}>{p}</li>)}</ul>}
        {footer}
      </div>
    </div>
  );
}

export function JackpotCard({ amount, sponsor }: { amount: number; sponsor?: boolean }) {
  return (
    <div className="pcard jackpot">
      <div className="in">
        <div className="rar"><Icon name="coin" size={22} color="#ffd95e" />{sponsor ? 'Трансферна подія' : 'Секретний трансфер'}</div>
        <div className="port" style={{ display: 'grid', placeItems: 'center', background: 'radial-gradient(circle,#fff3c4,#e9ae1c)' }}><Icon name="coin" size={70} color="#b88212" /></div>
        <div className="pname">{sponsor ? 'СПОНСОРСЬКИЙ БОНУС' : 'ФІНАНСОВИЙ ДЖЕКПОТ ІМІ'}</div>
        <div className="ptitle">{sponsor ? 'Партнери підтримали клуб' : '«Трансферний бюджет погоджено!»'}</div>
        <div className="amount">+{amount.toLocaleString('uk-UA')} MC</div>
        {!sponsor && <ul><li>Відкрито трансферний ринок світових зірок</li><li>Мессі, Роналду, Неймар, Буффон</li><li>Вікно діє обмежену кількість турів</li></ul>}
      </div>
    </div>
  );
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
  return (
    <div className={`reveal ${rarity}`} style={{ '--rc': r.color } as CSSProperties}>
      <div className="spot s1" /><div className="spot s2" />
      <div className="parts">{parts.map((p, i) => <i key={i} style={{ left: p.left, animationDuration: p.dur, animationDelay: p.delay, '--dx': p.dx } as CSSProperties} />)}</div>
      {onSkip && !done && <div className="skip"><Btn kind="small ghost" onClick={() => setShown(items.length)}>Пропустити ⏭</Btn></div>}
      <div className="head">{head}</div>
      {sub && <div className="sub">{sub}</div>}
      <div className="stage">
        {shown < 0 && <div className="back">?</div>}
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
    <PlayerCard sp={sp} footer={
      <div className="price" style={{ display: 'grid', gap: 6, width: '100%' }}>
        <div className="center"><Coins n={sp.price ?? 0} /></div>
        {owned ? <span className="chip green" style={{ justifyContent: 'center' }}>У вашому клубі</span>
          : soldTo ? <span className="chip red" style={{ justifyContent: 'center' }}>Грає за: {soldTo}</span>
            : <Btn kind="primary small block" disabled={!canBuy} onClick={onBuy} sound="coin">Придбати</Btn>}
      </div>} />
  );
}
