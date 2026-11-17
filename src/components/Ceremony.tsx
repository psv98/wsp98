// Церемонія після 34-го туру: вручення кубка (для чемпіона), святковий екран і підсумки сезону.
import { useEffect, useState } from 'react';
import { audio } from '../game/audio';
import { clubName } from '../game/selectors';
import { MSG, person } from '../data/i18n';
import { go, useApp } from '../game/store';
import { unitName } from '../systems/transfers';
import { ResetFlow, TableView } from './screens';
import { ChampionshipBadge, GoldConfetti, SupercupIcon, TrophyRevealAnimation, WinnerScreen } from './supercup';
import { Achievements, Btn, Coins, Logo } from './ui';

export function Ceremony() {
  const { save } = useApp();
  const s = save!;
  const rec = s.history.find((h) => h.season === s.season) ?? s.history[s.history.length - 1];
  const mine = !!rec && rec.champion === s.userClub;
  const [stage, setStage] = useState<'anim' | 'victory' | 'summary'>(mine ? 'anim' : 'victory');
  const [reset, setReset] = useState(false);
  useEffect(() => {
    if (stage !== 'summary') return;
    audio.music('ceremony');
    return () => audio.music(null);
  }, [stage]);
  if (!rec) return <div className="page"><Btn onClick={() => go('hub')}>До панелі</Btn></div>;
  if (stage === 'anim') return <TrophyRevealAnimation onDone={() => setStage('victory')} />;
  if (stage === 'victory') {
    const champRow = rec.table.find((r) => r.id === rec.champion);
    return (
      <>
        <WinnerScreen winnerClub={rec.champion} season={rec.season} points={champRow?.pts ?? rec.userPts} isUser={mine}
          actions={<>
            <Btn kind="primary" onClick={() => go('offseason')}>До міжсезоння</Btn>
            <Btn kind="blue" onClick={() => setStage('summary')}>Переглянути підсумки сезону</Btn>
            <Btn kind="silver" onClick={() => go('title')}>Повернутися до меню</Btn>
            <Btn kind="danger" onClick={() => setReset(true)}>Почати спочатку</Btn>
          </>} />
        {reset && <ResetFlow onClose={() => setReset(false)} />}
      </>
    );
  }
  const w = rec.userResults.filter((m) => (m.home ? m.score[0] > m.score[1] : m.score[1] > m.score[0])).length;
  const d = rec.userResults.filter((m) => m.score[0] === m.score[1]).length;
  return (
    <div className="ceremony">
      {mine && <GoldConfetti count={50} />}
      <div className="page grid">
        <div className="champ">
          <SupercupIcon size={120} />
          <p className="muted" style={{ letterSpacing: '.12em', textTransform: 'uppercase', fontSize: 12 }}>Білий суперкубок · сезон {rec.season}</p>
          <div style={{ display: 'grid', placeItems: 'center', marginTop: 10 }}><Logo club={rec.champion} size={92} /></div>
          <h1 className="gold">{clubName(rec.champion)}</h1>
          <ChampionshipBadge label={mine ? 'Ви — чемпіони!' : 'Чемпіон сезону'} />
          {!mine && <p className="muted" style={{ marginTop: 8 }}>Ваш клуб «{clubName(s.userClub)}» фінішував на {rec.userPos} місці з {rec.userPts} очками.</p>}
        </div>
        <div className="hub-stats">
          <div className="stat"><span>Ваше місце</span><b className={rec.userPos <= 3 ? 'gold' : ''}>{rec.userPos}</b></div>
          <div className="stat"><span>Очки</span><b>{rec.userPts}</b></div>
          <div className="stat"><span>В / Н / П</span><b>{w} / {d} / {rec.userResults.length - w - d}</b></div>
          <div className="stat"><span>Зароблено за сезон</span><b><Coins n={rec.coinsEarned} /></b></div>
        </div>
        <div className="panel"><h3>Досягнення клубу</h3><Achievements list={rec.achievements} /></div>
        <div className="panel"><h3>Підсумкова таблиця</h3><TableView table={rec.table} me={s.userClub} champion={rec.champion} /></div>
        <div className="panel"><h3>Бомбардири й бомбардирки сезону</h3>{rec.topScorers[0] && <p className="gold" style={{ marginBottom: 10, fontWeight: 600 }}>⚽ {MSG.bestScorerSeason(person(rec.topScorers[0].name, rec.topScorers[0].special), rec.topScorers[0].goals)}</p>}<div className="evlist">{rec.topScorers.slice(0, 8).map((x, i) => <div key={i} style={{ alignItems: 'center' }}><span className="m">{x.goals} ⚽</span><Logo club={x.club} size={22} /><span><b>{x.name}</b> — {clubName(x.club)}</span></div>)}</div></div>
        <div className="panel"><h3>Трансфери сезону</h3>{rec.transfers.length === 0 ? <p className="muted">Гучних переходів не було.</p> : <div className="evlist">{rec.transfers.map((t, i) => <div key={i}><span className="m">Тур {t.round + 1}</span><span><b>{unitName(t.unitId)}</b> → {clubName(t.club)}{t.from ? ` (із «${clubName(t.from)}»)` : ''}</span></div>)}</div>}</div>
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          <Btn kind="primary big" onClick={() => go('offseason')}>До міжсезоння</Btn>
          <Btn kind="blue" onClick={() => setStage('victory')}>До екрана чемпіона</Btn>
          <Btn kind="silver" onClick={() => go('title')}>Повернутися до меню</Btn>
          <Btn kind="danger" onClick={() => setReset(true)}>Почати спочатку</Btn>
        </div>
        <p className="muted center" style={{ fontSize: 12.5 }}>Попереду міжсезоння: розвиток футболістів і трансферне вікно для всіх 18 клубів. Клуб, гравці, мегатрансфери та медіакоїни зберігаються.</p>
      </div>
      {reset && <ResetFlow onClose={() => setReset(false)} />}
    </div>
  );
}
