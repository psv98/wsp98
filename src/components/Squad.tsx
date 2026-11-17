// «Мій склад»: стартові 11 на схемі, запасні, тактика, лікування та відновлення витривалості.
import { useState, type CSSProperties } from 'react';
import { BALANCE as B } from '../data/balance';
import { FORMATIONS, FORMATION_IDS, ROLE_SHORT } from '../data/formations';
import { RARITY } from '../data/rarity';
import { SPECIAL_BY_ID } from '../data/specials';
import { assetUrl } from '../game/assets';
import { matchesWord, playerImg, playerName } from '../game/selectors';
import { act, useApp } from '../game/store';
import { autoPickLineup, restoreStamina, setFormation, setLineupSlot, treatPlayer } from '../systems/actions';
import { isAvailable, playerQ, staminaCost, treatCost } from '../systems/squad';
import type { PlayerState } from '../systems/types';
import { GameCard, commonCard, specialCard } from './cards';
import { Btn, Coins, Modal, StaminaBar, TopBar } from './ui';
import { FATIGUE_LABEL, RISK_LABEL, fatigueColor, fatigueState, injuryRiskLevel } from '../simulation/fatigue';

export function PlayerRow({ p, clubId, sel, onClick, right, slotLabel }: { p: PlayerState; clubId: string; sel?: boolean; onClick?: () => void; right?: React.ReactNode; slotLabel?: string }) {
  const sp = p.special ? SPECIAL_BY_ID[p.special] : null;
  const inner = (
    <>
      <div className="ava" style={{ '--rc': sp ? RARITY[sp.rarity].color : '#fff' } as CSSProperties}><img src={assetUrl(playerImg(p, clubId))} alt="" /></div>
      <div style={{ minWidth: 0 }}>
        <div className="nm ell" style={sp ? { color: RARITY[sp.rarity].color } : undefined}>{playerName(p)}</div>
        <div className="meta">
          <span className="pos">{slotLabel ?? ROLE_SHORT[p.role]}</span>
          <span className="stam"><StaminaBar v={p.stamina} /></span><span className="num">{Math.round(p.stamina)}%</span>
          {p.injured > 0 && <span className="chip red">Травма: {matchesWord(p.injured)}</span>}
          {p.suspended > 0 && <span className="chip red">Дискв.: {matchesWord(p.suspended)}</span>}
          {p.yellows > 0 && <span title="Жовті картки (дискваліфікація після 4)">🟨{p.yellows}</span>}
        </div>
      </div>
      <div className="row" style={{ gap: 6 }}>{right}<span className="q">{Math.round(playerQ(p, true))}</span></div>
    </>
  );
  const cls = `prow ${sel ? 'sel' : ''} ${isAvailable(p) ? '' : 'out'}`;
  return onClick ? <button type="button" className={cls} onClick={onClick}>{inner}</button> : <div className={cls}>{inner}</div>;
}

export function Squad() {
  const { save } = useApp();
  const s = save!;
  const club = s.clubs[s.userClub];
  const slots = FORMATIONS[club.formation];
  const byId = new Map(club.players.map((p) => [p.id, p]));
  const [sel, setSel] = useState<number | null>(null);
  const [info, setInfo] = useState<PlayerState | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const bench = club.players.filter((p) => !club.lineup.includes(p.id));
  const tired = club.players.filter((p) => p.stamina < 100);
  const fitness = club.players.filter((p) => p.stamina < 100 || p.injured > 0 || p.suspended > 0).sort((a, b) => Number(club.lineup.includes(b.id)) - Number(club.lineup.includes(a.id)) || a.stamina - b.stamina);
  const allCost = tired.reduce((a, p) => a + staminaCost(p), 0);
  const problems = club.lineup.map((id) => byId.get(id)).filter((p) => !p || !isAvailable(p)).length;

  const pickSlot = (i: number) => {
    if (sel == null) { setSel(i); return; }
    if (sel === i) { setSel(null); return; }
    const a = club.lineup[sel];
    if (a) act((st) => setLineupSlot(st, i, a));
    setSel(null);
  };
  const pickBench = (p: PlayerState) => {
    if (sel == null) { setInfo(p); return; }
    act((st) => setLineupSlot(st, sel, p.id));
    setSel(null);
  };

  return (
    <>
      <TopBar title="Мій склад" />
      <div className="page grid">
        <div className="panel">
          <h3>Тактична схема</h3>
          <div className="row wrap">
            {FORMATION_IDS.map((f) => <Btn key={f} kind={`small ${club.formation === f ? 'primary' : ''}`} onClick={() => { act((st) => setFormation(st, f)); setSel(null); }}>{f}</Btn>)}
            <span className="grow" />
            <Btn kind="small" onClick={() => act(autoPickLineup, 'Обрано найкращий склад')}>Автосклад</Btn>
            <Btn kind="small green" disabled={!tired.length || s.coins < allCost} onClick={() => setConfirmAll(true)}>Відновити всіх{tired.length ? ` · ${allCost.toLocaleString('uk-UA')} MC` : ''}</Btn>
          </div>
          {problems > 0 && <p className="bad" style={{ marginTop: 8 }}>У стартовому складі є недоступні гравці ({problems}). Перед матчем їх буде замінено автоматично — або зробіть це самі.</p>}
          <p className="muted" style={{ marginTop: 8, fontSize: 12.5 }}>{sel == null ? 'Натисніть на позицію, а потім — на гравця, якого хочете поставити (або на іншу позицію для обміну).' : `Обрано позицію «${slots[sel].label}». Тепер оберіть гравця з резерву або іншу позицію.`}</p>
        </div>
        <div className="squad">
          <div className="panel">
            <h3>Стартові 11 · {club.formation}</h3>
            <div className="minipitch">
              {slots.map((sl, i) => {
                const p = byId.get(club.lineup[i] ?? '');
                const sp = p?.special ? SPECIAL_BY_ID[p.special] : null;
                return (
                  <button type="button" key={i} className={`slot ${sel === i ? 'sel' : ''}`} style={{ left: `${8 + sl.y * 84}%`, top: `${89 - sl.x * 106}%` }} onClick={() => pickSlot(i)}>
                    <span className="ava" style={{ borderColor: sp ? RARITY[sp.rarity].color : p && !isAvailable(p) ? 'var(--red)' : '#fff' }}>{p && <img src={assetUrl(playerImg(p, club.id))} alt="" />}</span>
                    <span className="lbl" style={sp ? { color: RARITY[sp.rarity].color } : undefined}>{p ? (sp ? sp.short : `№${p.num}`) : 'порожньо'} · {sl.label}</span>
                    {p && <span className="sbar"><i className={p.stamina < 45 ? 'low' : p.stamina < 70 ? 'mid' : ''} style={{ width: `${Math.max(4, p.stamina)}%` }} /></span>}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid" style={{ alignContent: 'start' }}>
            <div className="panel">
              <h3>Основа</h3>
              <div className="plist">{slots.map((sl, i) => { const p = byId.get(club.lineup[i] ?? ''); return p ? <PlayerRow key={p.id} p={p} clubId={club.id} sel={sel === i} slotLabel={sl.label} onClick={() => pickSlot(i)} /> : null; })}</div>
            </div>
            <div className="panel">
              <h3>Резерв ({bench.length})</h3>
              <div className="plist">{bench.map((p) => <PlayerRow key={p.id} p={p} clubId={club.id} onClick={() => pickBench(p)} />)}</div>
            </div>
          </div>
        </div>
        <div className="panel">
          <h3>Фізичний стан і медичний штаб</h3>
          <div className="fit-legend"><span className="c-green">80–100 відмінно · 60–79 норма</span><span className="c-yellow">40–59 втома</span><span className="c-orange">20–39 сильна втома</span><span className="c-red">0–19 критично</span></div>
          {fitness.length === 0 && <p className="muted">Усі гравці свіжі та здорові.</p>}
          <div className="fit-list">
            {fitness.map((p) => {
              const st = Math.round(p.stamina), cost = staminaCost(p), c = fatigueColor(p.stamina), risk = injuryRiskLevel(p.stamina);
              const sp = p.special ? SPECIAL_BY_ID[p.special] : null;
              return (
                <div className={`fit-row c-${c}`} key={p.id}>
                  <div className="ava" style={{ '--rc': sp ? RARITY[sp.rarity].color : '#fff' } as CSSProperties}><img src={assetUrl(playerImg(p, club.id))} alt="" /></div>
                  <div className="fit-main">
                    <div className="row" style={{ gap: 8 }}><b className="ell" style={sp ? { color: RARITY[sp.rarity].color } : undefined}>{playerName(p)}</b>{club.lineup.includes(p.id) && <span className="chip">Основа</span>}</div>
                    <div className="fit-bar"><i style={{ width: `${Math.max(3, st)}%` }} /><span>{st}%</span></div>
                    <div className="fit-meta">
                      <span>{p.injured > 0 ? `Травма · ${matchesWord(p.injured)}` : p.suspended > 0 ? `Дискваліфікація · ${matchesWord(p.suspended)}` : FATIGUE_LABEL[fatigueState(p.stamina)]}</span>
                      <span className={`risk r-${risk}`}>Ризик травми: {RISK_LABEL[risk]}</span>
                    </div>
                  </div>
                  <div className="fit-acts">
                    {p.injured > 0 && <Btn kind="small green" disabled={s.coins < treatCost(p)} onClick={() => act((st2) => treatPlayer(st2, p.id), `${playerName(p)}: лікування завершено!`)} sound="coin">Лікувати · {treatCost(p).toLocaleString('uk-UA')}</Btn>}
                    {cost > 0 && <Btn kind="small blue" disabled={s.coins < cost} onClick={() => act((st2) => restoreStamina(st2, p.id))} sound="coin">Відновити · {cost.toLocaleString('uk-UA')}</Btn>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {confirmAll && (
        <Modal onClose={() => setConfirmAll(false)}>
          <h2>Відновити всіх утомлених?</h2>
          <p>Гравців: <b>{tired.length}</b>. Усі повернуться до 100% витривалості.</p>
          <p style={{ marginTop: 8 }}>Загальна вартість: <Coins n={allCost} /> · ваш баланс: <Coins n={s.coins} /></p>
          <div className="actions"><Btn kind="silver" onClick={() => setConfirmAll(false)}>Скасувати</Btn><Btn kind="green" sound="coin" disabled={s.coins < allCost} onClick={() => { if (act((st2) => restoreStamina(st2, 'all'), 'Команда відновила сили!')) setConfirmAll(false); }}>Відновити · {allCost.toLocaleString('uk-UA')} MC</Btn></div>
        </Modal>
      )}
      {info && (
        <Modal onClose={() => setInfo(null)}>
          <div style={{ display: 'grid', placeItems: 'center' }}><GameCard data={info.special ? specialCard(SPECIAL_BY_ID[info.special], true, { club: club.id }) : { ...commonCard(info, club.id), status: info.injured > 0 ? `Травма: ${matchesWord(info.injured)}` : info.suspended > 0 ? `Дискваліфікація: ${matchesWord(info.suspended)}` : undefined }} /></div>
          <div className="hub-stats" style={{ marginTop: 12 }}>
            <div className="stat"><span>Матчі</span><b>{info.s.apps}</b></div><div className="stat"><span>Голи</span><b>{info.s.goals}</b></div><div className="stat"><span>Асисти</span><b>{info.s.assists}</b></div><div className="stat"><span>Витривалість</span><b>{Math.round(info.stamina)}%</b></div>
          </div>
          <p className="muted" style={{ marginTop: 10, fontSize: 12.5 }}>Щоб поставити гравця в основу, спершу натисніть позицію на схемі. Баланс: <Coins n={s.coins} /></p>
          <div className="actions"><Btn onClick={() => setInfo(null)}>Закрити</Btn></div>
        </Modal>
      )}
    </>
  );
}
