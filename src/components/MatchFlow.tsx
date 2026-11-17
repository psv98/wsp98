// Потік матчу: передматчевий екран → жива 2D-симуляція → підсумки туру та мегатрансфер.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { BALANCE as B } from '../data/balance';
import { CLUB_BY_ID } from '../data/clubs';
import { FORMATIONS, FORMATION_IDS, ROLE_SHORT, type FormationId } from '../data/formations';
import { RARITY } from '../data/rarity';
import { BUNDLES, SPECIAL_BY_ID } from '../data/specials';
import { audio } from '../game/audio';
import { eventLine, type Line } from '../game/commentary';
import { PitchRenderer } from '../game/renderer';
import { clubName, matchesWord, playerName } from '../game/selectors';
import { act, commit, getState, go, toast, useApp } from '../game/store';
import { MatchEngine } from '../simulation/engine';
import { hashSeed } from '../simulation/rng';
import type { MatchResult, SimPlayer, TeamStats } from '../simulation/types';
import { ackPostMatch, claimCard, treatPlayer } from '../systems/actions';
import { ROUNDS, applyRound, buildMatchSetup, matchSeed, simulateFixture, userFixture } from '../systems/season';
import { buildTeamSetup, treatCost } from '../systems/squad';
import { unitName } from '../systems/transfers';
import { Showcase, unitItems } from './cards';
import { FixtureRow, MatchDetails } from './screens';
import { Btn, Coins, Icon, Logo, Modal, StaminaBar } from './ui';

// ---------- передматчевий екран ----------
export function PreMatch() {
  const { save } = useApp();
  const s = save!;
  const fx = userFixture(s);
  const [alertIdx, setAlertIdx] = useState(0);
  const data = useMemo(() => {
    if (!fx) return null;
    const home = buildTeamSetup(s, fx.home, true), away = buildTeamSetup(s, fx.away, false);
    const opp = home.isUser ? away : home;
    const ids = opp.starters.map((p) => p.special).filter((x): x is string => !!x);
    const units: string[] = [];
    for (const id of ids) { const b = SPECIAL_BY_ID[id].bundle; const u = b ?? id; if (!units.includes(u)) units.push(u); }
    units.sort((a, b) => RARITY[unitItems(a).rarity].order - RARITY[unitItems(b).rarity].order);
    return { home, away, opp, units, oppIds: ids };
  }, [s, fx]);
  if (!fx || !data) { return <div className="page"><Btn onClick={() => go('hub')}>Назад</Btn></div>; }
  const { home, away, units, oppIds } = data;
  if (alertIdx < units.length) {
    const u = units[alertIdx];
    const it = unitItems(u);
    const items = it.items.filter((x) => oppIds.includes(x.special!));
    const last = alertIdx === units.length - 1;
    return (
      <Showcase key={u} rarity={it.rarity} drum={false} isUser={false} onSkip={() => undefined}
        head={`УВАГА! У СКЛАДІ СУПЕРНИКА — ${unitName(u).toUpperCase()}!`}
        sub={u === 'trio' || u === 'duo' ? BUNDLES[u].bonus + (items.length < it.items.length ? ' Сьогодні комплект неповний — бонус ослаблено.' : '') : 'У клубі суперника здібності діють слабше, ніж у вашому, — але недооцінювати їх не варто.'}
        items={items}
        actions={<><Btn kind="primary" onClick={() => setAlertIdx(alertIdx + 1)}>{last ? 'До матчу' : 'Далі'}</Btn>{!last && <Btn onClick={() => setAlertIdx(units.length)}>Пропустити все</Btn>}</>} />
    );
  }
  const list = (t: typeof home) => (
    <div className="plist">{t.starters.map((p, i) => { const sp = p.special ? SPECIAL_BY_ID[p.special] : null; return (
      <div className="prow" key={p.pid} style={{ gridTemplateColumns: '34px minmax(0,1fr) 60px' }}><span className="muted" style={{ fontSize: 11, fontWeight: 700 }}>{FORMATIONS[t.formation][i]?.label}</span><span className="nm ell" style={sp ? { color: RARITY[sp.rarity].color } : undefined}>{sp ? sp.name : `Гравець №${p.num}`}</span><StaminaBar v={p.stamina} /></div>); })}</div>
  );
  return (
    <div className="page grid">
      <div className="panel">
        <h3>Тур {s.round + 1} · сезон {s.season}</h3>
        <div className="next">
          <div className="side"><Logo club={fx.home} size={64} /><b>{home.name}</b><small className="muted">{home.formation} · господарі</small></div><div className="vs">VS</div>
          <div className="side"><Logo club={fx.away} size={64} /><b>{away.name}</b><small className="muted">{away.formation} · гості</small></div>
        </div>
        <div className="row wrap" style={{ justifyContent: 'center', marginTop: 14 }}>
          <Btn onClick={() => go('hub')}>Назад</Btn><Btn onClick={() => go('squad')}>Змінити склад</Btn>
          <Btn kind="primary big" onClick={() => go('match')}>ПОЧАТИ МАТЧ</Btn>
        </div>
        {home.stormArmed || away.stormArmed ? <p className="center gold" style={{ marginTop: 10, fontSize: 13 }}>Ігор Ісиченко сьогодні в особливому настрої: можливий «Повітряний штурм»…</p> : null}
      </div>
      <div className="squad"><div className="panel"><h3>{home.name}</h3>{list(home)}</div><div className="panel"><h3>{away.name}</h3>{list(away)}</div></div>
    </div>
  );
}

// ---------- живий матч ----------
const DT = B.match.dt;
function liveStats(m: MatchEngine): [TeamStats, TeamStats] {
  const t = m.stats[0].possession + m.stats[1].possession || 1;
  const p0 = Math.round((m.stats[0].possession / t) * 100);
  return [{ ...m.stats[0], possession: p0 }, { ...m.stats[1], possession: 100 - p0 }];
}
const STAT_ROWS: [string, keyof TeamStats][] = [['Удари', 'shots'], ['У площину', 'onTarget'], ['Володіння, %', 'possession'], ['Кутові', 'corners'], ['Фоли', 'fouls'], ['Жовті', 'yellows'], ['Червоні', 'reds'], ['Сейви', 'saves']];
function StatBlock({ st, c1, c2 }: { st: [TeamStats, TeamStats]; c1: string; c2: string }) {
  return <div style={{ '--c1': c1, '--c2': c2 } as CSSProperties}>{STAT_ROWS.map(([l, k]) => { const a = st[0][k], b = st[1][k], t = a + b || 1; return <div className="statline" key={k}><b>{a}</b><div><div className="muted" style={{ fontSize: 12 }}>{l}</div><div className="bar"><i style={{ width: `${(a / t) * 100}%` }} /><u /></div></div><b>{b}</b></div>; })}</div>;
}

export function MatchScreen() {
  const { save, settings } = useApp();
  const s = save!;
  const fx = useMemo(() => userFixture(s)!, []); // eslint-disable-line react-hooks/exhaustive-deps
  const userTeam: 0 | 1 = fx.home === s.userClub ? 0 : 1;
  const engine = useMemo(() => new MatchEngine(buildMatchSetup(s, fx, hashSeed(matchSeed(s, s.round, 99), Date.now()))), []); // eslint-disable-line react-hooks/exhaustive-deps
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const rendRef = useRef<PitchRenderer | null>(null);
  const paused = useRef(false);
  const speed = useRef(settings.speed || 1);
  const [, force] = useState(0);
  const [lines, setLines] = useState<{ min: string; line: Line }[]>([]);
  const [banner, setBanner] = useState<{ line: Line; key: number } | null>(null);
  const [panel, setPanel] = useState<null | 'subs' | 'tactics' | 'exit' | 'instant' | 'log'>(null);
  const [subOut, setSubOut] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [userPaused, setUserPaused] = useState(false);
  const names: [string, string] = [clubName(fx.home), clubName(fx.away)];
  const colors: [string, string] = [CLUB_BY_ID[fx.home].color, CLUB_BY_ID[fx.away].color];

  useEffect(() => { paused.current = panel != null || userPaused; }, [panel, userPaused]);
  useEffect(() => { rendRef.current?.setLow(settings.lowGfx); }, [settings.lowGfx]);

  useEffect(() => {
    const canvas = canvasRef.current!, box = boxRef.current!;
    const stars = engine.players.filter((p) => p.sp && p.sp.kind === 'star').map((p) => p.sp!.img);
    stars.push('assets/imi/imi-user.png', 'assets/imi/imi-opp.png');
    const rend = new PitchRenderer(canvas, [{ logo: CLUB_BY_ID[fx.home].logo, color: colors[0], isUser: userTeam === 0 }, { logo: CLUB_BY_ID[fx.away].logo, color: colors[1], isUser: userTeam === 1 }], stars);
    rend.low = settings.lowGfx;
    rendRef.current = rend;
    const ro = new ResizeObserver(() => rend.resize(box.clientWidth, box.clientHeight));
    ro.observe(box);
    rend.resize(box.clientWidth, box.clientHeight);
    audio.music(null); audio.crowd(true);
    let raf = 0, last = performance.now(), acc = 0, evIdx = 0, hudKey = '', exT = 0, bannerT: number | undefined;
    const onEvent = (i: number) => {
      const e = engine.events[i];
      const line = eventLine(e, names);
      if (!line) return;
      setLines((l) => [...l.slice(-60), { min: e.minLabel, line }]);
      if (line.big) {
        setBanner({ line, key: i });
        window.clearTimeout(bannerT);
        bannerT = window.setTimeout(() => setBanner(null), line.tone === 'goal' ? 2800 : 2300);
      }
      if (e.type === 'goal' || e.type === 'ownGoal') rend.goalFlash(colors[e.team as 0 | 1]);
      if (e.type === 'golden' || e.type === 'storm' || e.type === 'lastAttack' || e.type === 'var') audio.sfx('special');
      if (e.type === 'miss') audio.sfx('groan');
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!paused.current && engine.phase !== 'half' && !engine.finished) {
        acc += dt * speed.current;
        let n = 0;
        while (acc >= DT && n < 30) {
          engine.step(DT); acc -= DT; n++;
          if (engine.sfx) { const sfx = engine.sfx; engine.sfx = null; audio.sfx(sfx === 'goal' && engine.goals[engine.goals.length - 1]?.team !== userTeam ? 'groan' : sfx); }
        }
        if (n >= 30) acc = 0;
      }
      while (evIdx < engine.events.length) onEvent(evIdx++);
      rend.draw(engine, now);
      if (now - exT > 300) {
        exT = now;
        const b = engine.ball;
        const dg = Math.min(Math.hypot(b.x, b.y - 34), Math.hypot(105 - b.x, b.y - 34));
        audio.excitement(engine.phase === 'play' ? Math.max(0, 1 - dg / 45) : engine.phase === 'wait' ? 0.6 : 0.1);
      }
      const key = `${engine.score[0]}:${engine.score[1]}|${engine.minLabel()}|${engine.phase}|${engine.teams[userTeam].subsLeft}|${engine.teams[userTeam].subQueue.length}`;
      if (key !== hudKey) { hudKey = key; force((x) => x + 1); }
    };
    raf = requestAnimationFrame(loop);
    const vis = () => { last = performance.now(); audio.suspend(document.hidden); };
    document.addEventListener('visibilitychange', vis);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); rend.destroy(); rendRef.current = null; audio.crowd(false); window.clearTimeout(bannerT); document.removeEventListener('visibilitychange', vis); if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setSpeed = (v: number) => { speed.current = v; force((x) => x + 1); };
  const team = engine.teams[userTeam];
  const onPitch = team.players.filter((p) => p.on).sort((a, b) => a.slot - b.slot);
  const bench = team.players.filter((p) => !p.on && !p.off && !p.played);
  const queuedOut = new Set(team.subQueue.map((q) => q.out)), queuedIn = new Set(team.subQueue.map((q) => q.in));
  const subsLeft = team.subsLeft - team.subQueue.length;

  const instant = () => {
    engine.autoVar = true;
    if (engine.pendingVar) engine.answerVar(true);
    let g = 0;
    while (!engine.finished && g++ < 400000) { if (engine.phase === 'half') engine.startSecondHalf(); engine.step(DT); }
    engine.sfx = null;
    setPanel(null);
    audio.sfx('whistleLong');
    force((x) => x + 1);
  };

  const finish = async () => {
    const cur = getState().save!;
    setBusy('Симулюємо інші матчі туру…');
    try {
      const result: MatchResult = engine.result();
      const others = new Map<number, MatchResult>();
      const fixtures = cur.schedule[cur.round];
      let done = 0;
      for (let i = 0; i < fixtures.length; i++) {
        if (fixtures[i].home === cur.userClub || fixtures[i].away === cur.userClub) continue;
        await new Promise((r) => setTimeout(r, 0));
        others.set(i, simulateFixture(cur, cur.round, i));
        setBusy(`Симулюємо інші матчі туру… ${++done}/8`);
      }
      const next = applyRound(cur, result, others);
      await commit(next);
      go('post');
    } catch (e) { console.error(e); setBusy(null); toast('Не вдалося зберегти результат матчу. Спробуйте ще раз.', 'err'); }
  };

  const pRow = (p: SimPlayer, on: boolean, sel: boolean, click: () => void, disabled: boolean) => (
    <button type="button" key={p.pid} className={`prow ${sel ? 'sel' : ''}`} disabled={disabled} onClick={click} style={{ gridTemplateColumns: '40px minmax(0,1fr) 70px' }}>
      <span className="chip">{ROLE_SHORT[on ? p.role : p.nat]}</span>
      <span className="nm ell" style={p.sp ? { color: RARITY[p.sp.rarity].color } : undefined}>{p.name}{p.yellow ? ' 🟨' : ''}</span>
      <span><StaminaBar v={p.stamina} /></span>
    </button>
  );
  const halfLabel = engine.phase === 'full' ? 'Матч завершено' : engine.phase === 'half' ? 'Перерва' : engine.half === 1 ? '1-й тайм' : '2-й тайм';
  const last = lines[lines.length - 1];
  const tone = banner?.line.tone;

  return (
    <div className="match">
      <div className="mboard">
        <div className="tm" style={{ '--tc': colors[0] } as CSSProperties}><Logo club={fx.home} size={38} /><span className="ell">{names[0]}</span>{userTeam === 0 && <span className="you">ВИ</span>}</div>
        <div className="mid">
          <div className="score" aria-label={`Рахунок ${engine.score[0]}:${engine.score[1]}`}><b key={`h${engine.score[0]}`} className={engine.score[0] ? 'bump' : ''}>{engine.score[0]}</b><i>:</i><b key={`a${engine.score[1]}`} className={engine.score[1] ? 'bump' : ''}>{engine.score[1]}</b></div>
          <div className="clock">{engine.minLabel()}' · {halfLabel}</div>
        </div>
        <div className="tm r" style={{ '--tc': colors[1] } as CSSProperties}>{userTeam === 1 && <span className="you">ВИ</span>}<span className="ell">{names[1]}</span><Logo club={fx.away} size={38} /></div>
      </div>
      <div className="mcanvas" ref={boxRef}>
        <canvas ref={canvasRef} />
        {userPaused && !panel && !engine.finished && engine.phase !== 'half' && <div className="banner info">Пауза</div>}
        {banner && <div key={banner.key} className={`banner ${tone}`}>{banner.line.text.split('. ')[0]}{banner.line.text.includes('. ') && <small>{banner.line.text.split('. ').slice(1).join('. ')}</small>}</div>}
        {engine.phase === 'var' && engine.pendingVar && (
          <div className="mpanel"><div className="box center">
            <h2 style={{ color: 'var(--r-legendary)' }}>«Юридичний VAR»</h2>
            <p style={{ margin: '10px 0' }}>Спірний епізод: <b>{engine.pendingVar.kind === 'goal' ? 'гол у ваші ворота' : engine.pendingVar.kind === 'penalty' ? 'пенальті у ваші ворота' : 'вилучення вашого гравця'}</b>. Юридичне мегадуо може ініціювати перегляд — лише раз за матч. Рішення не гарантоване.</p>
            <div className="row wrap" style={{ justifyContent: 'center' }}><Btn kind="primary" onClick={() => { engine.answerVar(true); force((x) => x + 1); }}>Запросити VAR</Btn><Btn onClick={() => { engine.answerVar(false); force((x) => x + 1); }}>Не оскаржувати</Btn></div>
          </div></div>
        )}
        {engine.phase === 'half' && !panel && (
          <div className="mpanel"><div className="box">
            <h2 className="center">Перерва · {engine.score[0]} : {engine.score[1]}</h2>
            <StatBlock st={liveStats(engine)} c1={colors[0]} c2={colors[1]} />
            <div className="row wrap" style={{ justifyContent: 'center', marginTop: 12 }}><Btn onClick={() => setPanel('subs')}>Заміни ({subsLeft})</Btn><Btn onClick={() => setPanel('tactics')}>Тактика</Btn><Btn kind="primary" onClick={() => { engine.startSecondHalf(); force((x) => x + 1); }}>Другий тайм</Btn></div>
          </div></div>
        )}
        {engine.finished && (
          <div className="mpanel"><div className="box">
            <h2 className="center">Фінальний свисток</h2>
            <div className="next" style={{ margin: '10px 0' }}><div className="side"><Logo club={fx.home} size={48} /><b>{names[0]}</b></div><div className="score num" style={{ fontFamily: 'var(--font-num)', fontSize: 34 }}>{engine.score[0]} : {engine.score[1]}</div><div className="side"><Logo club={fx.away} size={48} /><b>{names[1]}</b></div></div>
            <StatBlock st={liveStats(engine)} c1={colors[0]} c2={colors[1]} />
            <div className="center" style={{ marginTop: 12 }}><Btn kind="primary big" disabled={!!busy} onClick={() => void finish()}>{busy ?? 'Підсумки туру'}</Btn></div>
          </div></div>
        )}
        {panel === 'subs' && (
          <div className="mpanel"><div className="box">
            <h2>Заміни · залишилось {subsLeft}</h2>
            <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 8px' }}>Оберіть, кого замінити, а потім — хто вийде. Заміна відбудеться під час найближчої зупинки гри. Вилученого гравця замінити не можна.</p>
            {team.subQueue.length > 0 && <p className="gold" style={{ fontSize: 13 }}>Очікують: {team.subQueue.map((q) => `${team.players.find((p) => p.pid === q.out)?.name} → ${team.players.find((p) => p.pid === q.in)?.name}`).join('; ')}</p>}
            <div className="squad" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div className="plist"><div className="muted" style={{ fontSize: 11 }}>НА ПОЛІ</div>{onPitch.map((p) => pRow(p, true, subOut === p.pid, () => setSubOut(subOut === p.pid ? null : p.pid), subsLeft <= 0 || queuedOut.has(p.pid)))}</div>
              <div className="plist"><div className="muted" style={{ fontSize: 11 }}>ЗАПАСНІ</div>{bench.map((p) => pRow(p, false, false, () => { if (subOut && engine.queueSub(userTeam, subOut, p.pid)) { setSubOut(null); audio.sfx('click'); } else toast('Спершу оберіть гравця на полі', 'err'); }, subsLeft <= 0 || !subOut || queuedIn.has(p.pid)))}{bench.length === 0 && <p className="muted">Запасних немає</p>}</div>
            </div>
            <div className="center" style={{ marginTop: 12 }}><Btn kind="primary" onClick={() => { setPanel(null); setSubOut(null); }}>Продовжити гру</Btn></div>
          </div></div>
        )}
        {panel === 'tactics' && (
          <div className="mpanel"><div className="box center">
            <h2>Тактична схема</h2>
            <p className="muted" style={{ margin: '6px 0 12px' }}>Зміна діє до кінця цього матчу.</p>
            <div className="row wrap" style={{ justifyContent: 'center' }}>{FORMATION_IDS.map((f: FormationId) => <Btn key={f} kind={team.formation === f ? 'primary' : ''} onClick={() => { engine.setFormation(userTeam, f); force((x) => x + 1); }}>{f}</Btn>)}</div>
            <div style={{ marginTop: 14 }}><Btn kind="primary" onClick={() => setPanel(null)}>Продовжити гру</Btn></div>
          </div></div>
        )}
        {panel === 'log' && (
          <div className="mpanel"><div className="box">
            <h2>Хід матчу</h2>
            <div className="evlist" style={{ margin: '10px 0' }}>{lines.length === 0 && <p className="muted">Подій ще не було.</p>}{lines.slice().reverse().map((l, i) => <div key={i}><span className="m">{l.min}'</span><span className={l.line.tone === 'goal' ? 'gold' : l.line.tone === 'bad' ? 'bad' : ''}>{l.line.text}</span></div>)}</div>
            <StatBlock st={liveStats(engine)} c1={colors[0]} c2={colors[1]} />
            <div className="center" style={{ marginTop: 12 }}><Btn kind="primary" onClick={() => setPanel(null)}>Продовжити гру</Btn></div>
          </div></div>
        )}
      </div>
      <div className="mbar">
        <button type="button" className="mbtn" aria-label="Вийти з матчу" onClick={() => setPanel('exit')}><Icon name="cross" size={18} /></button>
        <div className="ticker ell" onClick={() => setPanel('log')} role="button" tabIndex={0}>{last ? <><b className="gold">{last.min}'</b> <b>{last.line.text}</b></> : 'Матч починається…'}</div>
        <button type="button" className={`mbtn ${userPaused ? 'on' : ''}`} aria-label={userPaused ? 'Продовжити' : 'Пауза'} title={userPaused ? 'Продовжити' : 'Пауза'} disabled={engine.finished} onClick={() => setUserPaused((v) => !v)}><Icon name={userPaused ? 'play' : 'pause'} size={18} /></button>
        {[1, 2, 4].map((v) => <button type="button" key={v} className={`mbtn spd ${speed.current === v ? 'on' : ''}`} onClick={() => setSpeed(v)} title={`Швидкість ×${v}`}>×{v}</button>)}
        <button type="button" className={`mbtn spd-cycle ${speed.current > 1 ? 'on' : ''}`} onClick={() => setSpeed(speed.current === 1 ? 2 : speed.current === 2 ? 4 : 1)} aria-label={`Швидкість ×${speed.current}, змінити`}>×{speed.current}</button>
        <button type="button" className="mbtn txt" onClick={() => setPanel('subs')} disabled={engine.finished}>Заміни</button>
        <button type="button" className="mbtn txt" onClick={() => setPanel('tactics')} disabled={engine.finished}>Тактика</button>
        <button type="button" className="mbtn" onClick={() => setPanel('instant')} disabled={engine.finished} title="Миттєвий результат">⏭</button>
        <button type="button" className="mbtn" aria-label="На весь екран" onClick={() => { const el = document.documentElement; if (document.fullscreenElement) void document.exitFullscreen(); else void el.requestFullscreen?.().then(() => (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock?.('landscape').catch(() => undefined)).catch(() => undefined); }}><Icon name="full" size={18} /></button>
      </div>
      {panel === 'exit' && <Modal onClose={() => setPanel(null)}><h2>Вийти з матчу?</h2><p>Матч не буде зараховано — його доведеться зіграти заново.</p><div className="actions"><Btn onClick={() => setPanel(null)}>Продовжити гру</Btn><Btn kind="danger" onClick={() => go('hub')}>Вийти</Btn></div></Modal>}
      {panel === 'instant' && <Modal onClose={() => setPanel(null)}><h2>Миттєвий результат</h2><p>Решту матчу буде прораховано тим самим рушієм симуляції без показу на екрані. Керувати замінами вже не вдасться.</p><div className="actions"><Btn onClick={() => setPanel(null)}>Дивитися далі</Btn><Btn kind="primary" onClick={instant}>Прорахувати</Btn></div></Modal>}
    </div>
  );
}

// ---------- підсумки туру ----------
export function PostMatch() {
  const { save } = useApp();
  const s = save!;
  const post = s.pending;
  const [reveal, setReveal] = useState(!!post?.card && !post.cardClaimed);
  const [details, setDetails] = useState(false);
  const [sens, setSens] = useState(true);
  useEffect(() => { if (!post) go(s.round >= ROUNDS ? 'ceremony' : 'hub'); }, [post, s.round]);
  useEffect(() => { if (post && !reveal) audio.sfx('coin'); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!post) return null;
  const m = post.user;
  const home = m.home === s.userClub;
  const us = home ? m.score[0] : m.score[1], them = home ? m.score[1] : m.score[0];
  const total = post.rewards.reduce((a, e) => a + e.amount, 0);
  const club = s.clubs[s.userClub];
  const mySens = post.sensation.find((x) => x.home === s.userClub || x.away === s.userClub);

  if (reveal && post.card && !post.cardClaimed) {
    const c = post.card;
    if (c.kind === 'unit') {
      const it = unitItems(c.unitId);
      return <Showcase rarity={it.rarity} isUser head={it.head} sub={c.from ? `Сюжетний перехід! ${unitName(c.unitId)} залишає «${clubName(c.from)}» і приєднується до вас.` : c.unitId === 'oksana' ? 'Вихованка клубу повертається додому — тепер вона грає за вас.' : it.sub} items={it.items} onSkip={() => undefined}
        footerNote="У вашому клубі здібності діють на повну силу."
        actions={<><Btn kind="primary" onClick={() => { if (act((st) => claimCard(st, true), 'Гравця додано до стартового складу!')) setReveal(false); }}>Одразу в основу</Btn><Btn onClick={() => { if (act((st) => claimCard(st, false), 'Гравця додано до заявки (резерв)')) setReveal(false); }}>Додати до команди (резерв)</Btn></>} />;
    }
    return <Showcase rarity={c.kind === 'jackpot' ? 'divine' : 'rare'} isUser head={c.kind === 'jackpot' ? 'ФІНАНСОВИЙ ДЖЕКПОТ ІМІ' : 'ТРАНСФЕРНА ПОДІЯ'} sub={c.kind === 'jackpot' ? 'Трансферний бюджет погоджено!' : 'Цього разу без нового гравця — зате партнери клубу поповнили бюджет.'}
      items={[c.kind === 'jackpot' ? { jackpot: c.amount } : { sponsor: c.amount }]} onSkip={() => undefined}
      actions={<Btn kind="primary" sound="coin" onClick={() => { if (act((st) => claimCard(st, false), c.kind === 'jackpot' ? 'Трансферний ринок відкрито!' : 'Бонус зараховано')) setReveal(false); }}>{c.kind === 'jackpot' ? 'Забрати й відкрити ринок' : 'Забрати бонус'}</Btn>} />;
  }

  return (
    <div className="page grid">
      <div className="panel center" style={{ background: `radial-gradient(circle at 50% 0, ${us > them ? 'rgba(47,191,113,.25)' : us < them ? 'rgba(239,75,90,.2)' : 'rgba(255,255,255,.1)'}, transparent 70%), var(--panel)` }}>
        <h3>Тур {post.round + 1} · підсумок матчу</h3>
        <h2 className={us > them ? 'good' : us < them ? 'bad' : ''}>{us > them ? 'ПЕРЕМОГА!' : us < them ? 'Поразка' : 'Нічия'}</h2>
        <div style={{ maxWidth: 520, margin: '8px auto 0' }}><FixtureRow home={m.home} away={m.away} score={m.score} me={s.userClub} /></div>
        {m.motm && <p style={{ marginTop: 8 }}>⭐ Герой матчу: <b>{m.motm.name}</b> ({clubName(m.motm.team === 0 ? m.home : m.away)})</p>}
        <div style={{ marginTop: 8 }}><Btn kind="small" onClick={() => setDetails(true)}>Статистика матчу</Btn></div>
      </div>
      <div className="panel">
        <h3>Медіакоїни за матч</h3>
        <div className="evlist">{post.rewards.map((r, i) => <div key={i}><span className="grow">{r.reason}</span><b className="good">+{r.amount}</b></div>)}<div style={{ borderTop: '1px solid var(--line)', paddingTop: 6 }}><b className="grow">Разом</b><Coins n={total} sign /></div></div>
      </div>
      {(post.newInjuries.length > 0 || post.newBans.length > 0) && (
        <div className="panel"><h3>Лазарет і дискваліфікації</h3><div className="news">
          {post.newInjuries.map((inj) => { const p = club.players.find((x) => x.id === inj.pid); const healed = !p || p.injured <= 0; return (
            <div key={inj.pid} style={{ '--nc': 'var(--red)' } as CSSProperties} className="row wrap"><span className="grow">{healed ? <><b>{inj.name}</b> — вилікувано, готовий до наступного матчу ✔</> : <><b>{inj.name}</b> пропустить {matchesWord(p!.injured)}.</>}</span>
              {!healed && p && <Btn kind="small green" sound="coin" disabled={s.coins < treatCost(p)} onClick={() => act((st) => treatPlayer(st, p.id), `${playerName(p)} повернеться вже в наступному матчі!`)}>Вартість лікування: {treatCost(p).toLocaleString('uk-UA')} MC</Btn>}</div>); })}
          {post.newBans.map((b, i) => <div key={i} style={{ '--nc': '#ffd43b' } as CSSProperties}><b>{b.name}</b> дискваліфікований на {matchesWord(b.matches)} — {b.reason}.</div>)}
        </div></div>
      )}
      <div className="panel"><h3>Інші матчі туру</h3>{post.others.map((o, i) => <FixtureRow key={i} home={o.home} away={o.away} score={o.score} me={s.userClub} />)}</div>
      {(post.aiTransfers.length > 0 || post.sensation.length > 0) && (
        <div className="panel"><h3>Новини ліги</h3><div className="news">
          {post.sensation.map((x, i) => <div key={`s${i}`} style={{ '--nc': 'var(--gold)' } as CSSProperties}>⚡ <b>Сенсація туру!</b> {clubName(x.home)} {x.score[0]}:{x.score[1]} {clubName(x.away)}</div>)}
          {post.aiTransfers.map((t, i) => <div key={`t${i}`} style={{ '--nc': 'var(--r-mythic)' } as CSSProperties}>📰 Мегатрансфер суперника: <b>{unitName(t.unitId)}</b> тепер грає за «{clubName(t.club)}».</div>)}
        </div></div>
      )}
      <div className="center">
        {post.card && !post.cardClaimed ? <Btn kind="purple big" onClick={() => setReveal(true)}>ВІДКРИТИ МЕГАТРАНСФЕР</Btn>
          : <Btn kind="primary big" onClick={() => { if (act(ackPostMatch)) go(post.seasonFinished ? 'ceremony' : 'hub'); }}>{post.seasonFinished ? 'До церемонії нагородження' : 'Далі'}</Btn>}
        {!post.card && <p className="muted" style={{ marginTop: 8, fontSize: 12.5 }}>Цього разу мегатрансфер не випав. {s.transfers.pity >= B.transfers.pityMatches - 1 ? 'Після наступного матчу він гарантований!' : ''}</p>}
      </div>
      {details && <Modal wide onClose={() => setDetails(false)}><h2>Статистика матчу</h2><MatchDetails m={m} me={s.userClub} /><div className="actions"><Btn onClick={() => setDetails(false)}>Закрити</Btn></div></Modal>}
      {sens && mySens && us > them && <Modal onClose={() => setSens(false)}><div className="center"><div style={{ fontSize: 54, animation: 'pulse 1s infinite' }}>⚡</div><h2 className="gold">СЕНСАЦІЯ ТУРУ!</h2><p style={{ margin: '10px 0' }}>Ваш клуб здолав явного фаворита. Про цей матч говоритиме вся ліга!</p><Btn kind="primary" onClick={() => setSens(false)} sound="goal">Чудово!</Btn></div></Modal>}
    </div>
  );
}
