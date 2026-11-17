// Основні екрани: титульний, вибір клубу, панель менеджера, таблиця, календар, результати, фінанси, статистика, історія, налаштування.
import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { BALANCE as B } from '../data/balance';
import { CLUBS, CLUB_BY_ID } from '../data/clubs';
import { assetUrl } from '../game/assets';
import { audio } from '../game/audio';
import { clubName, fmtTime, lastResult, matchesWord, nextMatch, playerName, tableOf } from '../game/selectors';
import { act, downloadSave, go, importFromFile, resetProgress, restoreBackup, resumeScreen, startNewGame, updateSettings, useApp } from '../game/store';
import { ROUNDS } from '../systems/season';
import { fatigueWarning, isAvailable, restoreAllCost, teamCondition } from '../systems/squad';
import { restoreStamina } from '../systems/actions';
import { marketOpen } from '../systems/transfers';
import type { MatchSummary, SaveState, TableRow, UserMatchRecord } from '../systems/types';
import { MSG, person } from '../data/i18n';
import { fatigueColor } from '../simulation/fatigue';
import { ChampionshipBadge, SupercupIcon, SupercupLogo } from './supercup';
import { Achievements, Btn, Coins, Icon, Logo, Modal, TopBar } from './ui';

// ---------- подвійне підтвердження скидання ----------
export function ResetFlow({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1);
  return step === 1 ? (
    <Modal onClose={onClose}>
      <h2>Почати спочатку</h2>
      <p>Ви впевнені, що хочете почати нову гру?</p>
      <div className="actions"><Btn onClick={onClose}>Ні, залишитися</Btn><Btn kind="danger" onClick={() => setStep(2)}>Так, продовжити</Btn></div>
    </Modal>
  ) : (
    <Modal onClose={onClose}>
      <h2 className="bad">УВАГА!</h2>
      <p>Увесь прогрес, результати, трансфери, склади та медіакоїни буде видалено. Ви точно хочете почати спочатку?</p>
      <div className="actions"><Btn onClick={onClose}>Скасувати</Btn><Btn kind="danger" onClick={() => { void resetProgress(); onClose(); }}>Так, видалити прогрес</Btn></div>
    </Modal>
  );
}

// ---------- титульний екран ----------
export function Title() {
  const { save, loaded } = useApp();
  const [reset, setReset] = useState(false);
  return (
    <div className="title" onPointerDown={() => { audio.unlock(); audio.music('menu'); }}>
      <div className="beam b1" /><div className="beam b2" />
      <div className="title-inner">
        <SupercupIcon size={170} className="title-cup" />
        <h1 style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>БІЛИЙ СУПЕРКУБОК</h1>
        <SupercupLogo />
        <div className="scoreboard">18 медіаклубів. 34 тури. Один чемпіон.</div>
        <div className="title-menu">
          {save && <Btn kind="primary big" onClick={() => go(resumeScreen(save))}>Продовжити сезон</Btn>}
          <Btn kind={save ? 'green' : 'primary big'} disabled={!loaded} onClick={() => (save ? setReset(true) : go('select'))}>Почати гру</Btn>
          <Btn kind="blue" onClick={() => go('settings')}>Налаштування</Btn>
          <Btn kind="blue" onClick={() => go('about')}>Про гру</Btn>
        </div>
        {save && <p className="title-save">Збереження: {clubName(save.userClub)} · сезон {save.season}, тур {Math.min(save.round + 1, ROUNDS)} · збережено {fmtTime(save.savedAt)}</p>}
      </div>
      {reset && <ResetFlow onClose={() => setReset(false)} />}
    </div>
  );
}

// ---------- вибір клубу ----------
export function ClubSelect() {
  const [pick, setPick] = useState<string | null>(null);
  const def = pick ? CLUB_BY_ID[pick] : null;
  return (
    <>
      <TopBar title="Оберіть клуб" back="title" />
      <div className="page grid">
        <div className="row wrap" style={{ justifyContent: 'space-between' }}>
          <p className="muted grow">18 клубів на основі медіа з Білого списку ІМІ. Що вище клуб у посіві — то він сильніший на старті, але сенсації трапляються.</p>
          <Btn kind="primary" onClick={() => setPick(CLUBS[Math.floor(Math.random() * CLUBS.length)].id)}>🎲 Випадковий клуб</Btn>
        </div>
        <div className="clubgrid">
          {CLUBS.map((c) => (
            <div className="clubcard" key={c.id} style={{ '--c': c.color } as CSSProperties}>
              <span className="seed">№{c.seed}</span><span className="str" title="Початкова сила">{Math.round(c.strength)}</span>
              <Logo club={c.id} size={76} />
              <h3>{c.name}</h3>
              <p>{c.blurb}</p>
              <Btn kind="small block" onClick={() => setPick(c.id)}>Обрати клуб</Btn>
            </div>
          ))}
        </div>
      </div>
      {def && (
        <Modal onClose={() => setPick(null)}>
          <div className="row" style={{ marginBottom: 10 }}><Logo club={def.id} size={64} /><div><h2>{def.name}</h2><p className="muted">На основі медіа «{def.media}»</p></div></div>
          <p>{def.blurb}</p>
          <div className="hub-stats" style={{ marginTop: 12 }}>
            {[['Сила', def.strength], ['Атака', def.attack], ['Захист', def.defense], ['Передачі', def.passing], ['Воротар', def.keeper], ['Дисципліна', def.discipline]].map(([k, v]) => <div className="stat" key={k as string}><span>{k}</span><b>{Math.round(v as number)}</b></div>)}
          </div>
          <div className="actions"><Btn onClick={() => setPick(null)}>Назад</Btn><Btn kind="primary" onClick={() => startNewGame(def.id)}>Підтвердити вибір</Btn></div>
        </Modal>
      )}
    </>
  );
}

// ---------- панель менеджера ----------
const TILE_ICON: Partial<Record<string, string>> = { squad: 'squad', table: 'table', calendar: 'calendar', results: 'results', transfers: 'transfers', coins: 'coins', stats: 'stats', history: 'history', settings: 'settings' };
export function Hub() {
  const { save } = useApp();
  const s = save!;
  const def = CLUB_BY_ID[s.userClub];
  const table = useMemo(() => tableOf(s), [s]);
  const pos = table.findIndex((r) => r.id === s.userClub) + 1;
  const row = table[pos - 1];
  const nm = nextMatch(s);
  const last = lastResult(s);
  const club = s.clubs[s.userClub];
  const inj = club.players.filter((p) => p.injured > 0).length, ban = club.players.filter((p) => p.suspended > 0).length;
  const pityLeft = B.transfers.pityMatches - s.transfers.pity;
  const champ = s.history[s.history.length - 1]?.champion;
  const [warn, setWarn] = useState(false);
  const tiles: [string, string, Parameters<typeof go>[0], boolean?][] = [
    ['Мій склад', `${club.formation} · стан ${teamCondition(club)}%`, 'squad', inj + ban > 0],
    ['Турнірна таблиця', `${pos} місце · ${row.pts} очок`, 'table'],
    ['Календар', `Тур ${Math.min(s.round + 1, ROUNDS)} із ${ROUNDS}`, 'calendar'],
    ['Результати матчів', s.round ? `Зіграно турів: ${s.round}` : 'Ще немає матчів', 'results'],
    ['Трансфери', marketOpen(s) ? 'Ринок зірок ВІДКРИТО!' : `Мегатрансферів: ${club.megaTransfers.length}`, 'transfers', marketOpen(s)],
    ['Медіакоїни', `${s.coins.toLocaleString('uk-UA')} MC`, 'coins'],
    ['Статистика', 'Матчі, бомбардири й бомбардирки', 'stats'],
    ['Історія сезонів', s.history.length ? `Завершено сезонів: ${s.history.length}` : 'Перший сезон', 'history'],
    ['Налаштування', 'Звук, графіка, збереження', 'settings'],
  ];
  return (
    <div className="page grid">
      <div className="hub-head" style={{ '--c': def.color } as CSSProperties}>
        <Logo club={def.id} size={72} />
        <div className="grow">
          <h1>{def.name}</h1>
          <p className="muted row" style={{ gap: 6, marginTop: 4 }}><SupercupIcon size={20} />Білий суперкубок · сезон {s.season} · {s.round >= ROUNDS ? 'сезон завершено' : `тур ${s.round + 1} із ${ROUNDS}`}</p>
          {champ === s.userClub && <div style={{ marginTop: 6 }}><ChampionshipBadge label="Чинний чемпіон" /></div>}
        </div>
        <button type="button" className="iconbtn" aria-label="Головне меню" title="Головне меню" onClick={() => go('title')}><Icon name="back" /></button>
      </div>
      <div className="hub-stats">
        <div className="stat"><span>Місце</span><b>{pos} <small className="muted" style={{ fontSize: 12 }}>/ 18</small></b></div>
        <div className="stat"><span>Очки</span><b>{row.pts}</b></div>
        <div className="stat"><span>Медіакоїни</span><b className="gold">{s.coins.toLocaleString('uk-UA')}</b></div>
        <div className="stat"><span>Стан команди</span><b className={teamCondition(club) < 60 ? 'bad' : ''}>{teamCondition(club)}%</b></div>
        <div className="stat"><span>Травми / дискв.</span><b className={inj + ban ? 'bad' : ''}>{inj} / {ban}</b></div>
        <div className="stat"><span>Останній матч</span><b className={last ? (last.res === 'W' ? 'good' : last.res === 'L' ? 'bad' : '') : ''}>{last ? `${last.us}:${last.them}` : '—'}</b></div>
        <div className="stat wide"><span>Мегатрансфер</span><b style={{ fontSize: 13 }} className={pityLeft <= 1 ? 'gold' : ''}>{pityLeft <= 1 ? 'Гарантовано після матчу!' : `Можливий; гарантія за ${matchesWord(pityLeft)}`}</b></div>
      </div>
      {nm && (
        <div className="panel hero">
          <h3>Найближчий матч · тур {s.round + 1} · {nm.home ? 'вдома' : 'на виїзді'}</h3>
          <div className="next">
            <div className="side"><Logo club={nm.fx.home} size={58} /><b>{clubName(nm.fx.home)}</b><small className="muted">господарі</small></div>
            <div className="vs">VS</div>
            <div className="side"><Logo club={nm.fx.away} size={58} /><b>{clubName(nm.fx.away)}</b><small className="muted">гості</small></div>
          </div>
          {s.clubs[nm.opp].megaTransfers.length > 0 && <p className="center" style={{ marginTop: 8 }}><span className="chip gold">⚠ У суперника є мегатрансфери: {s.clubs[nm.opp].megaTransfers.length}</span></p>}
          <div className="center" style={{ marginTop: 14 }}><Btn kind="primary big" onClick={() => (fatigueWarning(s) ? setWarn(true) : go('prematch'))}>ГРАТИ МАТЧ</Btn></div>
        </div>
      )}
      {!nm && (
        <div className="panel hero center">
          <h3>Сезон {s.season} завершено</h3>
          <h2>Міжсезоння</h2>
          <p className="muted" style={{ margin: '6px auto 14px', maxWidth: 560 }}>Розвивайте футболістів, торгуйтеся на трансферному ринку й відповідайте на пропозиції клубів. Потім — новий сезон.</p>
          <div className="row wrap" style={{ justifyContent: 'center', gap: 6 }}><Btn kind="primary big" onClick={() => go('offseason')}>Відкрити міжсезоння</Btn><Btn kind="blue" onClick={() => go('ceremony')}>Церемонія</Btn></div>
        </div>
      )}
      <div className="menu-grid">
        {tiles.map(([t, sub, scr, dot]) => (
          <button type="button" key={t} className="tile" onClick={() => { audio.sfx('click'); go(scr); }}>
            {dot && <i className="dot" />}<img className="tile-ic" src={assetUrl(`assets/art/icons/${TILE_ICON[scr] ?? 'settings'}.webp`)} alt="" width={56} height={56} /><span className="tile-tx"><b>{t}</b><small>{sub}</small></span>
          </button>
        ))}
      </div>
      {warn && <FatigueWarning onClose={() => setWarn(false)} />}
    </div>
  );
}

/** Попередження перед матчем, якщо основний склад утомлений. Користувач може грати попри ризик. */
export function FatigueWarning({ onClose }: { onClose: () => void }) {
  const { save } = useApp();
  const s = save!;
  const w = fatigueWarning(s);
  const cost = restoreAllCost(s.clubs[s.userClub]);
  if (!w) { return <Modal onClose={onClose}><h2 className="good">Склад готовий до гри</h2><p>Усі основні гравці мають достатньо сил.</p><div className="actions"><Btn kind="primary" onClick={() => { onClose(); go('prematch'); }}>До матчу</Btn></div></Modal>; }
  const crit = w.level === 'critical';
  return (
    <Modal onClose={onClose}>
      <div className={`fat-warn ${crit ? 'crit' : ''}`}>
        <div className="fat-icon" aria-hidden="true">{crit ? '⚠' : '!'}</div>
        <h2>{crit ? 'Критична втома! Високий ризик травм' : 'Увага! Ваші футболісти втомилися'}</h2>
        <p>{crit ? 'У вашому складі є виснажені футболісти. Вони можуть отримати травми та пропустити наступні матчі.' : 'Деякі футболісти втратили значну частину витривалості. Це негативно вплине на швидкість, передачі, удари та захисні дії.'}</p>
        <div className="fat-list">{w.players.map((p) => <div key={p.id}><span className="grow ell">{p.name}</span><span className={`stam-chip c-${fatigueColor(p.stamina)}`}>{p.stamina}%</span></div>)}</div>
        <div className="actions">
          <Btn kind="blue" onClick={() => { onClose(); go('squad'); }}>Перейти до складу</Btn>
          <Btn kind="green" sound="coin" disabled={cost <= 0 || s.coins < cost} onClick={() => { if (act((st) => restoreStamina(st, 'all'), 'Команда відновила сили!')) { onClose(); } }}>Відновити витривалість · {cost.toLocaleString('uk-UA')} MC</Btn>
          <Btn kind={crit ? 'danger' : 'silver'} onClick={() => { onClose(); go('prematch'); }}>Грати попри ризик</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ---------- таблиця ----------
export function TableView({ table, me, champion }: { table: TableRow[]; me: string; champion?: string }) {
  return (
    <div className="tblwrap">
      <table className="tbl">
        <thead><tr><th>#</th><th className="name">Клуб</th><th title="Зіграно матчів">І</th><th className="hide-sm" title="Перемоги">В</th><th className="hide-sm" title="Нічиї">Н</th><th className="hide-sm" title="Поразки">П</th><th className="hide-sm" title="Забиті голи">ЗГ</th><th className="hide-sm" title="Пропущені голи">ПГ</th><th title="Різниця мʼячів">РМ</th><th title="Очки">О</th><th className="hide-sm">Форма</th></tr></thead>
        <tbody>
          {table.map((r, i) => (
            <tr key={r.id} className={r.id === me ? 'me' : ''}>
              <td>{i + 1}</td>
              <td className="name"><span className="row" style={{ gap: 8 }}><Logo club={r.id} size={24} /><span className="ell">{clubName(r.id)}</span>{r.id === champion && <SupercupIcon size={18} title="Чинний чемпіон" />}</span></td>
              <td>{r.p}</td><td className="hide-sm">{r.w}</td><td className="hide-sm">{r.d}</td><td className="hide-sm">{r.l}</td><td className="hide-sm">{r.gf}</td><td className="hide-sm">{r.ga}</td><td>{r.gd > 0 ? `+${r.gd}` : r.gd}</td><td className="pts">{r.pts}</td>
              <td className="hide-sm"><span className="form">{r.form.map((f, k) => <i key={k} className={f} />)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TableScreen() {
  const { save } = useApp();
  const s = save!;
  return (<><TopBar title="Турнірна таблиця" /><div className="page grid"><div className="panel"><h3 className="row" style={{ gap: 8 }}><SupercupIcon size={22} />Білий суперкубок · сезон {s.season}</h3><TableView table={tableOf(s)} me={s.userClub} champion={s.history[s.history.length - 1]?.champion} /></div><p className="muted" style={{ fontSize: 12 }}>{s.history.length > 0 && <><SupercupIcon size={14} /> — чинний чемпіон. </>}І — ігри, В — перемоги, Н — нічиї, П — поразки, ЗГ/ПГ — забиті/пропущені, РМ — різниця мʼячів, О — очки. Сортування: очки → різниця → забиті голи.</p></div></>);
}

// ---------- календар і результати ----------
export function FixtureRow({ home, away, score, me }: { home: string; away: string; score?: [number, number]; me: string }) {
  const hw = score && score[0] > score[1], aw = score && score[1] > score[0];
  return (
    <div className={`fixture ${home === me || away === me ? 'me' : ''}`}>
      <div className={`h ${hw ? 'win' : ''}`}><span className="ell">{clubName(home)}</span><Logo club={home} size={26} /></div>
      <div className="sc">{score ? `${score[0]} : ${score[1]}` : '— : —'}</div>
      <div className={`a ${aw ? 'win' : ''}`}><Logo club={away} size={26} /><span className="ell">{clubName(away)}</span></div>
    </div>
  );
}

function RoundTabs({ n, cur, set, max }: { n: number; cur: number; set: (r: number) => void; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  return <div className="rounds" ref={ref} role="tablist" aria-label="Тури">{Array.from({ length: n }, (_, i) => <button type="button" key={i} disabled={max != null && i >= max} className={i === cur ? 'on' : ''} aria-label={`Тур ${i + 1}`} onClick={() => set(i)}>{i + 1}</button>)}</div>;
}

export function Calendar() {
  const { save } = useApp();
  const s = save!;
  const [r, setR] = useState(Math.min(s.round, ROUNDS - 1));
  const [mine, setMine] = useState(false);
  const res = s.results[r];
  return (
    <>
      <TopBar title="Календар" />
      <div className="page grid">
        <div className="row"><Btn kind={`small ${mine ? '' : 'primary'}`} onClick={() => setMine(false)}>Усі тури</Btn><Btn kind={`small ${mine ? 'primary' : ''}`} onClick={() => setMine(true)}>Матчі мого клубу</Btn></div>
        {!mine ? (<>
          <RoundTabs n={ROUNDS} cur={r} set={setR} />
          <div className="panel"><h3>Тур {r + 1} {r < s.round ? '· зіграно' : r === s.round ? '· наступний' : ''}</h3>
            {s.schedule[r].map((f, i) => <FixtureRow key={i} home={f.home} away={f.away} me={s.userClub} score={res?.find((m) => m.home === f.home && m.away === f.away)?.score} />)}
          </div></>) : (
          <div className="panel">{s.schedule.map((round, i) => { const f = round.find((x) => x.home === s.userClub || x.away === s.userClub)!; return <div key={i}><div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Тур {i + 1} · {f.home === s.userClub ? 'вдома' : 'виїзд'}</div><FixtureRow home={f.home} away={f.away} me={s.userClub} score={s.results[i]?.find((m) => m.home === f.home)?.score} /></div>; })}</div>
        )}
      </div>
    </>
  );
}

export function Results() {
  const { save } = useApp();
  const s = save!;
  const [r, setR] = useState(Math.max(0, s.round - 1));
  return (
    <>
      <TopBar title="Результати матчів" />
      <div className="page grid">
        {s.round === 0 ? <div className="panel center muted">Ще не зіграно жодного туру.</div> : (<>
          <RoundTabs n={ROUNDS} cur={r} set={setR} max={s.round} />
          <div className="panel"><h3>Тур {r + 1}</h3>{(s.results[r] ?? []).map((m: MatchSummary, i) => <FixtureRow key={i} home={m.home} away={m.away} score={m.score} me={s.userClub} />)}</div>
        </>)}
      </div>
    </>
  );
}

// ---------- медіакоїни ----------
export function CoinsScreen() {
  const { save } = useApp();
  const s = save!;
  const E = B.economy;
  const log = s.coinLog.slice().reverse();
  return (
    <>
      <TopBar title="Медіакоїни" />
      <div className="page grid">
        <div className="panel hero center"><h3>Баланс</h3><div className="bignum gold">{s.coins.toLocaleString('uk-UA')} <small>MC</small></div></div>
        <div className="panel"><h3>Як заробити</h3>
          <div className="row wrap">{[['Перемога', E.win], ['Нічия', E.draw], ['Участь', E.loss], ['Кожен гол', E.perGoal], ['Сухий матч', E.cleanSheet], ['Перемога над фаворитом', E.upsetWin], ['Розгром (+3)', E.bigWin], ['Вольова перемога', E.comebackWin], ['Хет-трик', E.hatTrick], ['Чемпіонство', E.champion]].map(([k, v]) => <span className="chip" key={k as string}>{k}: <b className="gold">+{v}</b></span>)}</div>
          <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>Витрачайте MC на лікування травм, відновлення витривалості та світових зірок, коли «Фінансовий джекпот ІМІ» відкриє трансферний ринок.</p>
          <div className="row wrap" style={{ marginTop: 10 }}><Btn kind="small" onClick={() => go('squad')}>Лікування та відновлення</Btn><Btn kind="small" onClick={() => go('transfers')}>Трансферний ринок</Btn></div>
        </div>
        <div className="panel"><h3>Історія нарахувань і витрат</h3>
          <div className="evlist">{log.map((e, i) => <div key={i}><span className="m">С{e.season}·Т{e.round}</span><span className="grow">{e.reason}</span><b className={e.amount >= 0 ? 'good' : 'bad'}>{e.amount > 0 ? '+' : ''}{e.amount.toLocaleString('uk-UA')}</b></div>)}</div>
        </div>
      </div>
    </>
  );
}

// ---------- статистика ----------
export function MatchDetails({ m, me }: { m: UserMatchRecord; me: string }) {
  const c1 = CLUB_BY_ID[m.home].color, c2 = CLUB_BY_ID[m.away].color;
  const L: [string, keyof UserMatchRecord['stats'][0]][] = [['Удари', 'shots'], ['У площину воріт', 'onTarget'], ['Володіння, %', 'possession'], ['Кутові', 'corners'], ['Фоли', 'fouls'], ['Жовті картки', 'yellows'], ['Червоні картки', 'reds'], ['Сейви', 'saves'], ['Заміни', 'subs'], ['Травми', 'injuries']];
  const ab = Object.entries(m.abilities);
  return (
    <div className="grid" style={{ gap: 10 }}>
      <FixtureRow home={m.home} away={m.away} score={m.score} me={me} />
      {m.goals.length > 0 && <div className="evlist">{m.goals.map((g, i) => <div key={i}><span className="m">{g.minLabel}'</span><span>⚽ {g.name}{g.pen ? ' (пен.)' : ''}{g.scissors ? ' (ножицями!)' : g.header ? ' (головою)' : ''} — {clubName(g.team === 0 ? m.home : m.away)}{g.assist ? ` · асист: ${g.assist}` : ''}</span></div>)}</div>}
      <div style={{ '--c1': c1, '--c2': c2 } as CSSProperties}>
        {L.map(([label, k]) => { const a = m.stats[0][k] as number, b = m.stats[1][k] as number; const t = a + b || 1; return (<div className="statline" key={k}><b>{a}</b><div><div className="lbl">{label}</div><div className="bar"><i style={{ width: `${a + b === 0 ? 50 : (a / t) * 100}%` }} /><u /></div></div><b>{b}</b></div>); })}
      </div>
      {m.motm && <p>⭐ <b>{MSG.bestOfMatch(person(m.motm.name, m.motm.special))}</b> ({clubName(m.motm.team === 0 ? m.home : m.away)})</p>}
      {m.topSaves && m.topSaves.saves > 0 && <p className="muted">🧤 {m.topSaves.name} — сейвів: {m.topSaves.saves}</p>}
      {ab.length > 0 && <div className="row wrap">{ab.map(([k, v]) => <span className="chip gold" key={k}>{k} ×{v}</span>)}</div>}
      {m.cards.length > 0 && <div className="row wrap">{m.cards.map((c, i) => <span key={i} className={`chip ${c.kind === 'red' ? 'red' : ''}`}>{c.kind === 'red' ? '🟥' : '🟨'} {c.name}</span>)}</div>}
      {m.subs.length > 0 && <p className="muted" style={{ fontSize: 12.5 }}>Заміни: {m.subs.map((x) => `${x.min}' ${x.out} → ${x.in}`).join('; ')}</p>}
      {m.injuries.length > 0 && <p className="bad" style={{ fontSize: 13 }}>Травми: {m.injuries.map((x) => `${x.name} (${matchesWord(x.matches)})`).join('; ')}</p>}
    </div>
  );
}

export function Stats() {
  const { save } = useApp();
  const s = save!;
  const [tab, setTab] = useState(0);
  const [open, setOpen] = useState<UserMatchRecord | null>(null);
  const scorers = useMemo(() => {
    const out: { name: string; club: string; goals: number; assists: number }[] = [];
    for (const c of Object.values(s.clubs)) for (const p of c.players) if (p.s.goals > 0) out.push({ name: playerName(p), club: c.id, goals: p.s.goals, assists: p.s.assists });
    return out.sort((a, b) => b.goals - a.goals || b.assists - a.assists).slice(0, 20);
  }, [s]);
  const mine = s.clubs[s.userClub].players.filter((p) => p.s.apps > 0).sort((a, b) => b.s.goals - a.s.goals || b.s.apps - a.s.apps);
  return (
    <>
      <TopBar title="Статистика" />
      <div className="page grid">
        <div className="tabs">{['Мої матчі', 'Бомбардири й бомбардирки', 'Гравці клубу', 'Події сезону'].map((t, i) => <button type="button" key={t} className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>{t}</button>)}</div>
        {tab === 0 && <div className="panel">{s.userMatches.length === 0 && <p className="muted center">Архів сезону порожній — зіграйте перший матч.</p>}
          {s.userMatches.slice().reverse().map((m) => <button type="button" key={m.round} style={{ display: 'block', width: '100%' }} onClick={() => setOpen(m)}><div className="muted" style={{ fontSize: 11, textAlign: 'left', marginTop: 6 }}>Тур {m.round + 1} · натисніть для деталей</div><FixtureRow home={m.home} away={m.away} score={m.score} me="" /></button>)}</div>}
        {tab === 1 && <div className="panel tblwrap"><table className="tbl"><thead><tr><th>#</th><th className="name">Гравець</th><th className="name">Клуб</th><th>Голи</th><th>Асисти</th></tr></thead><tbody>{scorers.map((x, i) => <tr key={i} className={x.club === s.userClub ? 'me' : ''}><td>{i + 1}</td><td className="name">{x.name}</td><td className="name"><span className="row" style={{ gap: 6 }}><Logo club={x.club} size={20} /><span className="ell">{clubName(x.club)}</span></span></td><td className="pts">{x.goals}</td><td>{x.assists}</td></tr>)}</tbody></table>{scorers.length === 0 && <p className="muted center">Голів ще не забито.</p>}</div>}
        {tab === 2 && <div className="panel tblwrap"><table className="tbl"><thead><tr><th className="name">Гравець</th><th>Матчі</th><th>Голи</th><th>Асисти</th><th>Сейви</th><th>🟨</th><th>🟥</th><th title="Найкращий гравець матчу">⭐</th></tr></thead><tbody>{mine.map((p) => <tr key={p.id}><td className="name">{playerName(p)}</td><td>{p.s.apps}</td><td>{p.s.goals}</td><td>{p.s.assists}</td><td>{p.s.saves}</td><td>{p.s.yc}</td><td>{p.s.rc}</td><td>{p.s.motm}</td></tr>)}</tbody></table>{mine.length === 0 && <p className="muted center">Ще немає даних.</p>}</div>}
        {tab === 3 && <div className="panel"><div className="evlist">{s.events.filter((e) => e.season === s.season).reverse().map((e, i) => <div key={i}><span className="m">Тур {e.round}</span><span>{e.text}</span></div>)}{s.events.filter((e) => e.season === s.season).length === 0 && <p className="muted center">Поки що без гучних подій.</p>}</div></div>}
      </div>
      {open && <Modal onClose={() => setOpen(null)} wide><h2>Тур {open.round + 1}</h2><MatchDetails m={open} me={s.userClub} /><div className="actions"><Btn onClick={() => setOpen(null)}>Закрити</Btn></div></Modal>}
    </>
  );
}

// ---------- історія сезонів ----------
export function History() {
  const { save } = useApp();
  const s = save!;
  const [open, setOpen] = useState<number | null>(null);
  const rec = open != null ? s.history[open] : null;
  return (
    <>
      <TopBar title="Історія сезонів" />
      <div className="page grid">
        {s.history.length === 0 && <div className="panel center muted">Тут зʼявляться підсумки завершених сезонів. Поточний сезон — {s.season}.</div>}
        {s.history.slice().reverse().map((h) => (
          <button type="button" className="panel" style={{ textAlign: 'left' }} key={h.season} onClick={() => setOpen(s.history.indexOf(h))}>
            <div className="row"><Logo club={h.champion} size={44} /><div className="grow"><b>Сезон {h.season}</b><div className="row wrap" style={{ gap: 6, marginTop: 2 }}><ChampionshipBadge small label={clubName(h.champion)} /></div></div><div className="center"><div className="muted" style={{ fontSize: 11 }}>Ваше місце</div><b style={{ fontFamily: 'var(--font-head)', fontSize: 22 }} className={h.userPos === 1 ? 'gold' : ''}>{h.userPos}</b></div></div>
            <Achievements list={h.achievements} />
          </button>
        ))}
      </div>
      {rec && <Modal wide onClose={() => setOpen(null)}><h2>Сезон {rec.season}</h2><TableView table={rec.table} me={s.userClub} />
        <h3 style={{ margin: '14px 0 6px' }}>Бомбардири</h3><div className="evlist">{rec.topScorers.slice(0, 5).map((x, i) => <div key={i}><span className="m">{x.goals}</span><span>{x.name} — {clubName(x.club)}</span></div>)}</div>
        <div className="actions"><Btn onClick={() => setOpen(null)}>Закрити</Btn></div></Modal>}
    </>
  );
}

// ---------- налаштування ----------
export function SettingsScreen() {
  const { save, settings, saveFailed } = useApp();
  const [reset, setReset] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const vol = (k: 'music' | 'sfx' | 'crowd', label: string) => (
    <div className="setrow"><label htmlFor={k}>{label}</label><input id={k} type="range" min={0} max={1} step={0.05} value={settings[k]} onChange={(e) => { audio.unlock(); updateSettings({ [k]: Number(e.target.value) }); }} onPointerUp={() => audio.sfx(k === 'crowd' ? 'save' : k === 'sfx' ? 'kick' : 'click')} /><span className="num muted">{Math.round(settings[k] * 100)}%</span></div>
  );
  return (
    <>
      <TopBar title="Налаштування" back={save ? 'hub' : 'title'} />
      <div className="page grid">
        <div className="panel"><h3>Звук</h3>
          {vol('music', 'Гучність музики')}{vol('sfx', 'Гучність ефектів')}{vol('crowd', 'Гучність трибун')}
          <label className="switch"><span>Вимкнути звук</span><input type="checkbox" checked={settings.muted} onChange={(e) => updateSettings({ muted: e.target.checked })} /></label>
        </div>
        <div className="panel"><h3>Графіка</h3>
          <label className="switch" style={{ borderTop: 0 }}><span>Режим зниженої якості графіки<br /><small className="muted">Менше ефектів і частинок — для слабших пристроїв</small></span><input type="checkbox" checked={settings.lowGfx} onChange={(e) => updateSettings({ lowGfx: e.target.checked })} /></label>
        </div>
        <div className="panel"><h3>Збереження</h3>
          {save ? <p>Останнє автозбереження: <b>{fmtTime(save.savedAt)}</b></p> : <p className="muted">Збережень ще немає.</p>}
          {saveFailed && <p className="bad" style={{ marginTop: 6 }}>Не вдалося записати збереження у сховище браузера. Експортуйте файл, щоб не втратити прогрес.</p>}
          <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 10px' }}>Прогрес зберігається автоматично в цьому браузері (IndexedDB). Якщо очистити дані сайту, збереження зникне — регулярно експортуйте файл.</p>
          <div className="row wrap">
            <Btn kind="small" disabled={!save} onClick={downloadSave}>Експортувати у JSON</Btn>
            <Btn kind="small" onClick={() => file.current?.click()}>Імпортувати збереження</Btn>
            <Btn kind="small" disabled={!save} onClick={() => void restoreBackup('backup')}>Відновити попередній стан</Btn>
            <Btn kind="small" disabled={!save} onClick={() => void restoreBackup('seasonStart')}>Відновити сезон (з початку)</Btn>
          </div>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFromFile(f); e.target.value = ''; }} />
        </div>
        {save && <div className="panel"><h3>Небезпечна зона</h3><p className="muted" style={{ marginBottom: 10 }}>Повне видалення прогресу та повернення до вибору клубу.</p><Btn kind="danger small" onClick={() => setReset(true)}>Почати спочатку</Btn></div>}
      </div>
      {reset && <ResetFlow onClose={() => setReset(false)} />}
    </>
  );
}

export function About() {
  return (
    <>
      <TopBar title="Про гру" back="title" />
      <div className="page grid">
        <div className="panel grid">
          <div><SupercupLogo compact /></div>
          <p>Футбольна аркада та симулятор медіачемпіонату. 18 клубів створено на основі медіа, що увійшли до Білого списку Інституту масової інформації за перше півріччя 2026 року.</p>
          <p>Ви — менеджер: обираєте склад і тактику, робите заміни, лікуєте гравців, збираєте мегатрансфери ІМІ та боретеся за трофей. Футболісти на полі діють самостійно — кожен гол, сейв і фол народжується у справжній 2D-симуляції.</p>
          <p className="muted">Це розважальний вигаданий проєкт. Реальні медіа та співробітники ІМІ — лише основа для фантазійних клубів і персонажів. Ігрові характеристики не є оцінкою їхньої роботи.</p>
          <p className="muted">Джерело переліку медіа: <a href="https://imi.org.ua/monitorings/bilyj-spysok-imi-za-pershe-pivrichchya-2026-roku-uvijshly-18-media" target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>Білий список ІМІ</a>.</p>
        </div>
        <div className="panel"><h3>Як грати</h3><div className="news">
          <div>Матч триває два тайми по 90 секунд. Можна прискорити гру або отримати миттєвий результат.</div>
          <div>Після матчів випадають мегатрансфери — щонайменше раз на три матчі.</div>
          <div>Гравці втомлюються та травмуються: ротуйте склад, відновлюйте витривалість і лікуйте за медіакоїни.</div>
          <div>«Фінансовий джекпот ІМІ» відкриває ринок світових зірок.</div>
          <div>Прогрес зберігається автоматично; у налаштуваннях є експорт у файл.</div>
        </div></div>
      </div>
    </>
  );
}

export const isAvailableP = isAvailable;
export type { SaveState };
