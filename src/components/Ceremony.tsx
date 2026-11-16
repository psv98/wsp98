// Церемонія нагородження після 34-го туру.
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { CLUBS } from '../data/clubs';
import { audio } from '../game/audio';
import { clubName } from '../game/selectors';
import { go, startNextSeason, useApp } from '../game/store';
import { unitName } from '../systems/transfers';
import { ResetFlow, TableView } from './screens';
import { Btn, Coins, Cup, Logo } from './ui';

export function Ceremony() {
  const { save, settings } = useApp();
  const s = save!;
  const rec = s.history.find((h) => h.season === s.season) ?? s.history[s.history.length - 1];
  const [reset, setReset] = useState(false);
  useEffect(() => { audio.music('ceremony'); audio.sfx('goal'); return () => audio.music(null); }, []);
  const confetti = useMemo(() => Array.from({ length: settings.lowGfx ? 0 : 70 }, (_, i) => ({ left: `${(i * 53) % 100}%`, bg: ['#f5c542', '#ffffff', '#3d8bfd', '#ef4b5a', '#2fbf71', CLUBS[i % 18].color][i % 6], dur: `${4 + ((i * 17) % 50) / 10}s`, delay: `${-((i * 11) % 60) / 10}s` })), [settings.lowGfx]);
  if (!rec) return <div className="page"><Btn onClick={() => go('hub')}>До панелі</Btn></div>;
  const mine = rec.champion === s.userClub;
  const w = rec.userResults.filter((m) => (m.home ? m.score[0] > m.score[1] : m.score[1] > m.score[0])).length;
  const d = rec.userResults.filter((m) => m.score[0] === m.score[1]).length;
  return (
    <div className="ceremony">
      <div className="confetti">{confetti.map((c, i) => <i key={i} style={{ left: c.left, background: c.bg, animationDuration: c.dur, animationDelay: c.delay } as CSSProperties} />)}</div>
      <div className="page grid">
        <div className="champ">
          <Cup className="cup" />
          <p className="muted" style={{ letterSpacing: '.12em', textTransform: 'uppercase', fontSize: 12 }}>Білий суперкубок · сезон {rec.season}</p>
          <div style={{ display: 'grid', placeItems: 'center', marginTop: 10 }}><Logo club={rec.champion} size={92} /></div>
          <h1 className="gold">{clubName(rec.champion)}</h1>
          <p style={{ fontFamily: 'var(--font-head)' }}>{mine ? 'ВИ — ЧЕМПІОН! Кубок ваш!' : 'ЧЕМПІОН СЕЗОНУ'}</p>
          {!mine && <p className="muted" style={{ marginTop: 8 }}>Ваш клуб «{clubName(s.userClub)}» фінішував на {rec.userPos} місці з {rec.userPts} очками.</p>}
        </div>
        <div className="hub-stats">
          <div className="stat"><span>Ваше місце</span><b className={rec.userPos <= 3 ? 'gold' : ''}>{rec.userPos}</b></div>
          <div className="stat"><span>Очки</span><b>{rec.userPts}</b></div>
          <div className="stat"><span>В / Н / П</span><b>{w} / {d} / {rec.userResults.length - w - d}</b></div>
          <div className="stat"><span>Зароблено за сезон</span><b><Coins n={rec.coinsEarned} /></b></div>
        </div>
        <div className="panel"><h3>Досягнення клубу</h3><div className="row wrap">{rec.achievements.map((a) => <span className="chip gold" key={a}>🏅 {a}</span>)}</div></div>
        <div className="panel"><h3>Підсумкова таблиця</h3><TableView table={rec.table} me={s.userClub} /></div>
        <div className="panel"><h3>Найкращі бомбардири сезону</h3><div className="evlist">{rec.topScorers.slice(0, 8).map((x, i) => <div key={i} style={{ alignItems: 'center' }}><span className="m">{x.goals} ⚽</span><Logo club={x.club} size={22} /><span><b>{x.name}</b> — {clubName(x.club)}</span></div>)}</div></div>
        <div className="panel"><h3>Трансфери сезону</h3>{rec.transfers.length === 0 ? <p className="muted">Гучних переходів не було.</p> : <div className="evlist">{rec.transfers.map((t, i) => <div key={i}><span className="m">Тур {t.round + 1}</span><span><b>{unitName(t.unitId)}</b> → {clubName(t.club)}{t.from ? ` (із «${clubName(t.from)}»)` : ''}</span></div>)}</div>}</div>
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          <Btn kind="primary big" onClick={startNextSeason}>Почати наступний сезон</Btn>
          <Btn onClick={() => go('history')}>Історія сезонів</Btn>
          <Btn kind="danger" onClick={() => setReset(true)}>Почати спочатку</Btn>
        </div>
        <p className="muted center" style={{ fontSize: 12.5 }}>У новому сезоні зберігаються клуб, гравці, мегатрансфери та медіакоїни. Суперники стануть трохи сильнішими й зможуть купувати світових зірок.</p>
      </div>
      {reset && <ResetFlow onClose={() => setReset(false)} />}
    </div>
  );
}
