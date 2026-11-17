// «Трансфери»: колекція мегатрансферів ІМІ, трансферний ринок світових зірок, журнал переходів.
import { useState } from 'react';
import { BALANCE as B } from '../data/balance';
import { RARITY } from '../data/rarity';
import { BUNDLES, IMI_SPECIALS, STARS } from '../data/specials';
import { clubName } from '../game/selectors';
import { MSG, person } from '../data/i18n';
import { act, useApp } from '../game/store';
import { buyStar } from '../systems/actions';
import { marketOpen, unitName } from '../systems/transfers';
import { MarketCard, PlayerCard } from './cards';
import { Coins, Logo, RarityIcon, TopBar } from './ui';

export function Transfers() {
  const { save } = useApp();
  const s = save!;
  const open = marketOpen(s);
  const [tab, setTab] = useState(open ? 1 : 0);
  const owners = s.transfers.owners;
  const mineCount = IMI_SPECIALS.filter((x) => owners[x.id] === s.userClub).length;
  const sorted = IMI_SPECIALS.slice().sort((a, b) => RARITY[a.rarity].order - RARITY[b.rarity].order);
  const lock = s.transfers.legendaryLock;
  return (
    <>
      <TopBar title="Трансфери" />
      <div className="page grid">
        <div className="tabs">{[`Мегатрансфери ІМІ (${mineCount}/14)`, `Ринок зірок ${open ? '· ВІДКРИТО' : '· закрито'}`, 'Журнал трансферів'].map((t, i) => <button type="button" key={t} className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>{t}</button>)}</div>
        {tab === 0 && (<>
          <div className="panel">
            <h3>Як це працює</h3>
            <p style={{ fontSize: 13.5 }}>Після матчу може випасти картка мегатрансферу. Якщо двічі поспіль нічого не випало — після третього матчу картка <b>гарантована</b>. Матчів без випадіння: <b>{s.transfers.pity}</b> із {B.transfers.pityMatches - 1}.</p>
            <div className="row wrap" style={{ marginTop: 8 }}>{(['divine', 'mythic', 'legendary', 'epic', 'rare'] as const).map((r) => <span className="chip" key={r} style={{ color: RARITY[r].color }}><RarityIcon rarity={r} size={14} />{RARITY[r].name}</span>)}</div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>{lock ? `Цього сезону в лізі діє «${BUNDLES[lock].name}» — «${BUNDLES[lock === 'trio' ? 'duo' : 'trio'].name}» зʼявитися не може.` : '«Аналітичне супертріо» та «Юридичне мегадуо» взаємовиключні: за сезон у лізі зʼявляється лише один із комплектів.'}</p>
          </div>
          <div className="cardgrid">
            {sorted.map((sp) => {
              const o = owners[sp.id];
              const mine = o === s.userClub;
              return <PlayerCard key={sp.id} sp={sp} isUser compact dim={mine ? undefined : o ? 'elsewhere' : 'locked'} note={mine ? 'У вашому клубі' : o ? `Грає за: ${clubName(o)}` : 'Ще не отримано'} />;
            })}
          </div>
        </>)}
        {tab === 1 && (<>
          <div className="panel hero center">
            {open ? (<><h2 className="gold">Трансферне вікно відкрито!</h2><p>«Трансферний бюджет погоджено!» Вікно зачиниться після туру {s.transfers.marketOpenUntil + 1}. Ваш бюджет: <Coins n={s.coins} /></p></>)
              : (<><h2>Ринок закрито 🔒</h2><p className="muted">Трансферний ринок світових зірок відкриває лише секретна подія «Фінансовий джекпот ІМІ», яка може випасти після матчу.</p></>)}
          </div>
          <div className="cardgrid market">
            {STARS.map((sp) => { const o = owners[sp.id]; return <div key={sp.id} style={open ? undefined : { filter: 'grayscale(.7) brightness(.7)' }}><MarketCard sp={sp} owned={o === s.userClub} soldTo={o && o !== s.userClub ? clubName(o) : undefined} canBuy={open && s.coins >= (sp.price ?? 0)} onBuy={() => act((st) => buyStar(st, sp.id), MSG.joinedClub(person(sp.name, sp.id)))} /></div>; })}
          </div>
        </>)}
        {tab === 2 && (
          <div className="panel">
            {s.transfers.log.length === 0 && <p className="muted center">Трансферів ще не було. Суперники починають отримувати зірок із 5-го туру.</p>}
            <div className="evlist">{s.transfers.log.slice().reverse().map((t, i) => (
              <div key={i} style={{ alignItems: 'center' }}><span className="m">С{t.season}·Т{t.round + 1}</span><Logo club={t.club} size={22} /><span className="grow"><b>{unitName(t.unitId)}</b> → {clubName(t.club)}{t.from ? ` (сюжетний перехід із «${clubName(t.from)}»)` : ''}{t.kind === 'star' ? ' · трансферний ринок' : ''}</span></div>
            ))}</div>
          </div>
        )}
      </div>
    </>
  );
}
