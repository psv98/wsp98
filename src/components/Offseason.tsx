// Міжсезоння: підсумки, розвиток футболістів, трансферний ринок, переговори й аукціони, пропозиції клубів, бюджет, підготовка.
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { BALANCE as B } from '../data/balance';
import { MSG, person, roleName } from '../data/i18n';
import { RARITY } from '../data/rarity';
import { SPECIAL_BY_ID } from '../data/specials';
import { assetUrl } from '../game/assets';
import { audio } from '../game/audio';
import { clubName, playerImg, playerName, tableOf } from '../game/selectors';
import { act, actR, go, startNextSeason, useApp } from '../game/store';
import { DEV_OPTIONS, devCost, devUsed, roleGroup } from '../systems/development';
import {
  acceptCounter, developPlayer, fmtMC, listForSale, marketList, marketRating, offseasonSummary, openOffseason, placeBid, playerValue, respondOffer, startDeal, userSpecials, withdrawDeal,
} from '../systems/market';
import { baseQ, playerQ } from '../systems/squad';
import type { Deal, IncomingOffer, PlayerState, SaveState } from '../systems/types';
import { GameCard, specialCard } from './cards';
import { ChampionshipBadge, GoldConfetti, SupercupIcon } from './supercup';
import { Achievements, Btn, Coins, Logo, Modal, TopBar } from './ui';

type Tab = 'summary' | 'dev' | 'market' | 'deals' | 'offers' | 'budget' | 'prep';
const TABS: [Tab, string][] = [
  ['summary', 'Підсумки сезону'], ['dev', 'Розвиток'], ['market', 'Трансферний ринок'], ['deals', 'Мої пропозиції'],
  ['offers', 'Пропозиції клубів'], ['budget', 'Бюджет клубу'], ['prep', 'Підготовка'],
];
const ACTIVE = ['open', 'countered', 'outbid'];

export function Offseason() {
  const { save } = useApp();
  const s = save!;
  const [tab, setTab] = useState<Tab>('summary');
  const [dealId, setDealId] = useState<string | null>(null);
  const [start, setStart] = useState(false);
  // міжсезоння відкривається при першому вході
  useEffect(() => { if (!s.offseason || s.offseason.season !== s.season) act(openOffseason); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const o = s.offseason;
  if (!o) return <div className="page muted center">Відкриваємо трансферне вікно…</div>;
  const pendingOffers = o.incoming.filter((x) => x.status === 'pending' || x.status === 'countered').length;
  const activeDeals = o.deals.filter((d) => ACTIVE.includes(d.status)).length;
  const deal = dealId ? o.deals.find((d) => d.id === dealId) ?? null : null;
  const badge: Partial<Record<Tab, number>> = { offers: pendingOffers, deals: activeDeals };

  return (
    <>
      <TopBar title={`Міжсезоння · сезон ${s.season}`} back="hub" />
      <div className="page grid">
        <div className="panel hero off-hero" style={{ '--off-bg': `url(${assetUrl('assets/art/offseason.webp')})` } as CSSProperties}>
          <div className="off-hero-l">
            <SupercupIcon size={64} />
            <div>
              <h2>Міжсезоння</h2>
              <p className="muted">Трансферне вікно відкрите для всіх 18 клубів. Розвивайте гравців, торгуйтеся за зірок і готуйтеся до сезону {s.season + 1}.</p>
            </div>
          </div>
          <div className="off-hero-r">
            <div className="off-budget"><span>Бюджет</span><b>{s.coins.toLocaleString('uk-UA')} <small>MC</small></b></div>
            <Btn kind="primary big" onClick={() => setStart(true)}>Почати наступний сезон</Btn>
          </div>
        </div>
        <div className="tabs" role="tablist">
          {TABS.map(([t, label]) => <button type="button" role="tab" aria-selected={tab === t} key={t} className={tab === t ? 'on' : ''} onClick={() => { audio.sfx('click'); setTab(t); }}>{label}{badge[t] ? <span className="tab-badge">{badge[t]}</span> : null}</button>)}
        </div>
        {tab === 'summary' && <SummaryTab s={s} />}
        {tab === 'dev' && <DevTab s={s} />}
        {tab === 'market' && <MarketTab s={s} onOpen={(id) => setDealId(id)} />}
        {tab === 'deals' && <DealsTab s={s} onOpen={(id) => setDealId(id)} />}
        {tab === 'offers' && <OffersTab s={s} />}
        {tab === 'budget' && <BudgetTab s={s} />}
        {tab === 'prep' && <PrepTab s={s} />}
      </div>
      {deal && <DealModal s={s} deal={deal} onClose={() => setDealId(null)} />}
      {start && <StartSeasonModal s={s} onClose={() => setStart(false)} />}
    </>
  );
}

// ---------- підсумки ----------
function SummaryTab({ s }: { s: SaveState }) {
  const rec = s.history.find((h) => h.season === s.season);
  const table = useMemo(() => tableOf(s), [s]);
  if (!rec) return <div className="panel muted center">Підсумки сезону недоступні.</div>;
  const top = rec.topScorers[0];
  return (
    <div className="grid two">
      <div className="panel">
        <h3>Сезон {rec.season}</h3>
        <div className="row" style={{ gap: 14 }}><Logo club={rec.champion} size={64} /><div><ChampionshipBadge label="Чемпіон" /><h2 style={{ marginTop: 6 }}>{clubName(rec.champion)}</h2></div></div>
        <div className="hub-stats" style={{ marginTop: 14 }}>
          <div className="stat"><span>Ваше місце</span><b className={rec.userPos <= 3 ? 'gold' : ''}>{rec.userPos}</b></div>
          <div className="stat"><span>Очки</span><b>{rec.userPts}</b></div>
          <div className="stat"><span>Зароблено</span><b className="gold">{rec.coinsEarned.toLocaleString('uk-UA')}</b></div>
        </div>
        {top && <p className="gold" style={{ marginTop: 12, fontWeight: 600 }}>⚽ {MSG.bestScorerSeason(person(top.name, top.special), top.goals)}</p>}
        <Achievements list={rec.achievements} />
      </div>
      <div className="panel">
        <h3>Підсумкова таблиця</h3>
        <div className="mini-table">{table.slice(0, 8).map((r, i) => <div key={r.id} className={r.id === s.userClub ? 'me' : ''}><span>{i + 1}</span><Logo club={r.id} size={22} /><span className="grow ell">{clubName(r.id)}</span><b>{r.pts}</b></div>)}</div>
        {table.findIndex((r) => r.id === s.userClub) >= 8 && <p className="muted" style={{ marginTop: 8 }}>Ваш клуб — {table.findIndex((r) => r.id === s.userClub) + 1} місце.</p>}
        <div style={{ marginTop: 10 }}><Btn kind="small blue" onClick={() => go('history')}>Історія сезонів</Btn></div>
      </div>
    </div>
  );
}

// ---------- розвиток ----------
function DevTab({ s }: { s: SaveState }) {
  const club = s.clubs[s.userClub];
  const [pick, setPick] = useState<PlayerState | null>(null);
  const [anim, setAnim] = useState<{ from: number; to: number; text: string; img: string; rc: string } | null>(null);
  const players = club.players.slice().sort((a, b) => Number(!!b.special) - Number(!!a.special) || Number(club.lineup.includes(b.id)) - Number(club.lineup.includes(a.id)) || playerQ(b, true) - playerQ(a, true));
  return (
    <>
      <div className="panel">
        <h3>Розвиток футболістів</h3>
        <p style={{ fontSize: 14 }}>Кожен футболіст може підвищити загальний рейтинг на <b>+2</b> за міжсезоння, незалежно від рідкісності. Перший пункт — <Coins n={B.development.costs[0]} />, другий — <Coins n={B.development.costs[1]} /> (для рейтингу понад 85 — дорожче). Максимальний рейтинг — 99. Особливі здібності зберігаються.</p>
      </div>
      <div className="dev-list">
        {players.map((p) => {
          const used = devUsed(p, s.season);
          const cost = devCost(p, true, s.season);
          const sp = p.special ? SPECIAL_BY_ID[p.special] : null;
          const q = playerQ(p, true), q0 = baseQ(p, true);
          return (
            <div className="dev-row" key={p.id} style={{ '--rc': sp ? RARITY[sp.rarity].color : '#b0c0c9' } as CSSProperties}>
              <div className="ava"><img src={assetUrl(playerImg(p, club.id))} alt="" /></div>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="nm ell" style={sp ? { color: RARITY[sp.rarity].color } : undefined}>{playerName(p)}</div>
                <div className="meta">{sp ? sp.roleName : roleName(p.role, 'male')} · старт {q0}{q > q0 ? <b className="good"> → {q}</b> : null}</div>
              </div>
              <div className="dev-pips" aria-label={`Використано ${used} з 2`}>{[0, 1].map((i) => <i key={i} className={i < used ? 'on' : ''} />)}</div>
              <span className="dev-q">{q}</span>
              <Btn kind="small green" disabled={cost == null || s.coins < (cost ?? 0)} onClick={() => setPick(p)}>{cost == null ? (q >= 99 ? 'Максимум' : 'Ліміт +2') : `+1 · ${cost.toLocaleString('uk-UA')} MC`}</Btn>
            </div>
          );
        })}
      </div>
      {pick && <DevModal s={s} p={pick} onClose={() => setPick(null)} onDone={(r) => { setPick(null); setAnim(r); }} />}
      {anim && (
        <div className="overlay" onClick={() => setAnim(null)}>
          <div className="rating-up" style={{ '--rc': anim.rc } as CSSProperties}>
            <GoldConfetti count={36} />
            <div className="ru-ava"><img src={assetUrl(anim.img)} alt="" /></div>
            <div className="ru-nums"><span>{anim.from}</span><i>→</i><b>{anim.to}</b></div>
            <p>{anim.text}</p>
            <Btn kind="primary" onClick={() => setAnim(null)}>Чудово!</Btn>
          </div>
        </div>
      )}
    </>
  );
}

function DevModal({ s, p, onClose, onDone }: { s: SaveState; p: PlayerState; onClose: () => void; onDone: (r: { from: number; to: number; text: string; img: string; rc: string }) => void }) {
  const opts = DEV_OPTIONS[roleGroup(p.role)];
  const [opt, setOpt] = useState(opts[0].id);
  const cost = devCost(p, true, s.season) ?? 0;
  const sp = p.special ? SPECIAL_BY_ID[p.special] : null;
  const q = playerQ(p, true);
  const focus = Object.entries(p.dev?.focus ?? {}).filter(([, v]) => (v ?? 0) > 0);
  return (
    <Modal onClose={onClose} wide>
      <div className="dev-modal">
        <div className="dev-card">{sp ? <GameCard data={specialCard(sp, true, { rating: q, club: s.userClub })} compact /> : <div className="gen-card"><Logo club={s.userClub} size={90} /><b>{playerName(p)}</b><span>{roleName(p.role, 'male')}</span><em>{q}</em></div>}</div>
        <div className="dev-body">
          <h2>Покращення · {q} → {Math.min(99, q + 1)}</h2>
          <p className="muted" style={{ marginBottom: 10 }}>Оберіть напрям розвитку. Він підсилює відповідну дію в матчі, загальний рейтинг зростає на 1.</p>
          <div className="dev-opts" role="radiogroup">
            {opts.map((o) => (
              <button type="button" role="radio" aria-checked={opt === o.id} key={o.id} className={`dev-opt ${opt === o.id ? 'on' : ''}`} onClick={() => setOpt(o.id)}>
                <b>{o.label}</b><small>{o.hint}</small>
              </button>
            ))}
          </div>
          {focus.length > 0 && <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>Уже розвинено: {p.dev!.log.map((l) => l.focus).join(', ')}</p>}
          <div className="actions">
            <Btn kind="silver" onClick={onClose}>Скасувати</Btn>
            <Btn kind="primary" sound="coin" disabled={s.coins < cost} onClick={() => {
              const r = actR((st) => developPlayer(st, p.id, opt));
              if (r) { audio.sfx('reveal-epic'); onDone({ from: q, to: Math.min(99, q + 1), text: r.text, img: playerImg(p, s.userClub), rc: sp ? RARITY[sp.rarity].color : '#f2c14e' }); }
            }}>Підтвердити · {cost.toLocaleString('uk-UA')} MC</Btn>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ---------- ринок ----------
function MarketTab({ s, onOpen }: { s: SaveState; onOpen: (id: string) => void }) {
  const list = useMemo(() => marketList(s).sort((a, b) => RARITY[a.sp.rarity].order - RARITY[b.sp.rarity].order || b.value - a.value), [s]);
  const [filter, setFilter] = useState<'all' | 'imi' | 'star'>('all');
  const shown = list.filter((x) => filter === 'all' || x.sp.kind === filter);
  return (
    <>
      <div className="panel">
        <h3>Трансферний ринок</h3>
        <p style={{ fontSize: 14 }}>Купуйте персонажів ІМІ з інших клубів і світових зірок. Ціну визначають рейтинг, рідкісність, розвиток і статистика. Клуб може погодитися, відмовити або назвати свою ціну, а інші клуби — перебити вашу пропозицію (до {B.market.maxRounds} раундів торгів). Учасників комплектів можна купувати окремо.</p>
        <div className="row wrap" style={{ marginTop: 10, gap: 4 }}>
          {([['all', 'Усі'], ['imi', 'Персонажі ІМІ'], ['star', 'Світові зірки']] as const).map(([k, l]) => <Btn key={k} kind={`small ${filter === k ? 'primary' : 'silver'}`} onClick={() => setFilter(k)}>{l}</Btn>)}
        </div>
      </div>
      <div className="cardgrid market">
        {shown.map(({ sp, owner, value, rating }) => {
          const d = s.offseason!.deals.find((x) => x.specialId === sp.id && ACTIVE.includes(x.status));
          return (
            <GameCard key={sp.id} compact data={specialCard(sp, false, { rating, club: owner ?? undefined, status: owner ? clubName(owner) : 'Вільний агент' })} footer={
              <div className="gc-foot">
                <Coins n={value} />
                <Btn kind={`small ${d ? 'purple' : 'primary'} block`} disabled={!d && s.coins < value * 0.5} onClick={() => { const r = actR((st) => startDeal(st, sp.id)); if (r) onOpen(r.dealId); }}>{d ? 'Продовжити торги' : 'Переговори'}</Btn>
              </div>} />
          );
        })}
      </div>
      {!shown.length && <div className="panel muted center">Немає доступних гравців.</div>}
    </>
  );
}

function DealsTab({ s, onOpen }: { s: SaveState; onOpen: (id: string) => void }) {
  const deals = s.offseason!.deals.slice().reverse();
  if (!deals.length) return <div className="panel muted center">Ви ще не робили пропозицій. Відкрийте «Трансферний ринок».</div>;
  return (
    <div className="deal-list">
      {deals.map((d) => {
        const sp = SPECIAL_BY_ID[d.specialId];
        return (
          <button type="button" key={d.id} className={`deal-row st-${d.status}`} onClick={() => onOpen(d.id)} style={{ '--rc': RARITY[sp.rarity].color } as CSSProperties}>
            <div className="ava"><img src={assetUrl(sp.img)} alt="" /></div>
            <div className="grow" style={{ minWidth: 0 }}>
              <b className="ell">{sp.name}</b>
              <small className="ell">{d.message}</small>
            </div>
            <span className={`deal-st st-${d.status}`}>{STATUS_LABEL[d.status]}</span>
          </button>
        );
      })}
    </div>
  );
}

const STATUS_LABEL: Record<Deal['status'], string> = { open: 'Торги', countered: 'Зустрічна ціна', outbid: 'Вас перебили', won: 'Підписано', lost: 'Програно', rejected: 'Відмова', withdrawn: 'Закрито' };

function DealModal({ s, deal, onClose }: { s: SaveState; deal: Deal; onClose: () => void }) {
  const sp = SPECIAL_BY_ID[deal.specialId];
  const active = ACTIVE.includes(deal.status);
  const top = deal.rivals.reduce((m, r) => Math.max(m, r.bid), 0);
  const base = Math.max(deal.value, top);
  const presets = Array.from(new Set((deal.status === 'outbid' ? [1.03, 1.08, 1.15] : [0.85, 1, 1.15, 1.3]).map((k) => Math.max(1000, Math.round((base * k) / 500) * 500))));
  const pickDefault = () => presets.find((v, i) => i >= 1 && v <= s.coins) ?? presets.find((v) => v <= s.coins) ?? presets[1] ?? presets[0];
  const [amount, setAmount] = useState<number>(pickDefault);
  useEffect(() => { setAmount(pickDefault()); }, [deal.round, deal.status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (deal.status === 'won') audio.sfx('reveal-legendary'); else if (deal.status === 'lost' || deal.status === 'rejected') audio.sfx('groan'); }, [deal.status]);
  const board = [...deal.rivals.map((r) => ({ club: r.club, bid: r.bid, me: false })), ...(deal.userBid ? [{ club: s.userClub, bid: deal.userBid, me: true }] : [])].sort((a, b) => b.bid - a.bid);
  const bid = (v: number) => act((st) => placeBid(st, deal.id, v));
  return (
    <Modal onClose={onClose} wide>
      <div className={`deal ${deal.status}`}>
        {deal.status === 'won' && <GoldConfetti count={40} />}
        <div className="deal-card"><GameCard data={specialCard(sp, deal.status === 'won', { rating: marketRating(s, sp.id), club: deal.seller ?? undefined })} compact /></div>
        <div className="deal-body">
          <div className="deal-head">
            <span className="muted">Переговори · раунд {Math.min(deal.round, B.market.maxRounds)} з {B.market.maxRounds}</span>
            <h2>{sp.name}</h2>
            <div className="row wrap" style={{ gap: 8 }}>
              <span className="chip" style={{ color: RARITY[sp.rarity].color }}>{sp.kind === 'star' ? 'Світова зірка' : RARITY[sp.rarity].name}</span>
              <span className="chip">{sp.roleName}</span>
              {deal.seller ? <span className="chip"><Logo club={deal.seller} size={16} /> {clubName(deal.seller)}</span> : <span className="chip">Вільний агент</span>}
            </div>
            <p style={{ marginTop: 8 }}>Ринкова вартість: <Coins n={deal.value} /></p>
          </div>
          <div className={`deal-msg st-${deal.status}`}>{deal.message}</div>
          {board.length > 0 && (
            <div className="auction">
              <h3>Пропозиції клубів</h3>
              {board.map((b, i) => <div key={b.club + i} className={b.me ? 'me' : ''}><span className="pos">{i + 1}</span><Logo club={b.club} size={24} /><span className="grow ell">{b.me ? 'Ваша пропозиція' : clubName(b.club)}</span><b>{fmtMC(b.bid)}</b></div>)}
            </div>
          )}
          {active && (
            <>
              <div className="bid-presets">{presets.map((v) => <button type="button" key={v} className={amount === v ? 'on' : ''} onClick={() => setAmount(v)}>{v.toLocaleString('uk-UA')}</button>)}</div>
              <label className="bid-input"><span>Ваша сума, MC</span><input type="number" inputMode="numeric" min={1000} step={500} value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></label>
              <p className="muted" style={{ fontSize: 12.5 }}>Ваш бюджет: {fmtMC(s.coins)}</p>
              <div className="actions">
                {deal.status === 'countered' && deal.counter && <Btn kind="green" disabled={s.coins < deal.counter} onClick={() => act((st) => acceptCounter(st, deal.id))} sound="coin">Прийняти {fmtMC(deal.counter)}</Btn>}
                <Btn kind="primary" disabled={!amount || amount > s.coins} onClick={() => bid(amount)}>{deal.userBid ? 'Підвищити пропозицію' : 'Надіслати пропозицію'}</Btn>
                <Btn kind="silver" onClick={() => { act((st) => withdrawDeal(st, deal.id)); onClose(); }}>Вийти з переговорів</Btn>
              </div>
            </>
          )}
          {!active && <div className="actions"><Btn kind="primary" onClick={onClose}>{deal.status === 'won' ? 'До команди!' : 'Закрити'}</Btn></div>}
        </div>
      </div>
    </Modal>
  );
}

// ---------- пропозиції інших клубів ----------
function OffersTab({ s }: { s: SaveState }) {
  const o = s.offseason!;
  const mine = userSpecials(s);
  return (
    <>
      {o.incoming.length === 0 && <div className="panel muted center">Поки що ніхто не надсилав пропозицій. Ви можете виставити гравця на продаж нижче.</div>}
      <div className="offer-list">{o.incoming.slice().reverse().map((of) => <OfferCard key={of.id} s={s} of={of} />)}</div>
      {mine.length > 0 && (
        <div className="panel">
          <h3>Виставити на продаж</h3>
          <p className="muted" style={{ marginBottom: 10, fontSize: 13.5 }}>Клуби-суперники надішлють пропозиції. Без вашого рішення ніхто нікого не продає.</p>
          <div className="row wrap" style={{ gap: 4 }}>{mine.map((id) => <Btn key={id} kind="small silver" disabled={o.incoming.some((x) => x.specialId === id && ['pending', 'countered'].includes(x.status))} onClick={() => act((st) => listForSale(st, id), 'Пропозиції надіслано клубам')}>{SPECIAL_BY_ID[id].short} · {fmtMC(playerValue(s, id))}</Btn>)}</div>
        </div>
      )}
    </>
  );
}

function OfferCard({ s, of }: { s: SaveState; of: IncomingOffer }) {
  const sp = SPECIAL_BY_ID[of.specialId];
  const [counter, setCounter] = useState(Math.round((of.amount * 1.2) / 500) * 500);
  const [askOpen, setAskOpen] = useState(false);
  const live = of.status === 'pending' || of.status === 'countered';
  const price = of.status === 'countered' && of.countered ? of.countered : of.amount;
  const p = person(sp.name, sp.id);
  const own = s.clubs[s.userClub].players.find((x) => x.special === sp.id);
  return (
    <div className={`offer ${live ? 'live' : 'done'}`} style={{ '--rc': RARITY[sp.rarity].color } as CSSProperties}>
      {live && <div className="offer-tag">Нова трансферна пропозиція!</div>}
      <div className="offer-in">
        <div className="offer-card"><GameCard data={specialCard(sp, true, { club: s.userClub, rating: own ? playerQ(own, true) : undefined })} compact /></div>
        <div className="offer-body">
          <div className="row" style={{ gap: 10 }}><Logo club={of.buyer} size={44} /><div><b className="offer-club">{clubName(of.buyer)}</b><p className="muted" style={{ fontSize: 13 }}>{MSG.offerFor(clubName(of.buyer), fmtMC(price), p)}</p></div></div>
          <div className="offer-sum"><span>Пропозиція</span><b>{fmtMC(price)}</b><small>Орієнтовна вартість: {fmtMC(playerValue(s, sp.id))}</small></div>
          {of.message && <div className="deal-msg">{of.message}</div>}
          {live && (
            <>
              <div className="actions">
                <Btn kind="green" sound="coin" onClick={() => act((st) => respondOffer(st, of.id, 'accept'), `Продано за ${fmtMC(price)}`)}>Прийняти</Btn>
                <Btn kind="danger" onClick={() => act((st) => respondOffer(st, of.id, 'reject'))}>Відхилити</Btn>
                {of.status === 'pending' && <Btn kind="blue" onClick={() => setAskOpen((v) => !v)}>Запропонувати іншу суму</Btn>}
              </div>
              {askOpen && of.status === 'pending' && (
                <div className="row wrap" style={{ marginTop: 6, gap: 6 }}>
                  <label className="bid-input grow"><span>Ваша ціна, MC</span><input type="number" inputMode="numeric" step={500} min={of.amount} value={counter} onChange={(e) => setCounter(Number(e.target.value))} /></label>
                  <Btn kind="primary" onClick={() => { if (act((st) => respondOffer(st, of.id, 'counter', counter))) setAskOpen(false); }}>Надіслати</Btn>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- бюджет ----------
function BudgetTab({ s }: { s: SaveState }) {
  const o = s.offseason!;
  const rows = Object.values(s.clubs).map((c) => ({ id: c.id, coins: c.id === s.userClub ? s.coins : c.coins, inc: c.finance.income, sp: c.finance.spend })).sort((a, b) => b.coins - a.coins);
  return (
    <div className="grid two">
      <div className="panel">
        <h3>Ваш бюджет</h3>
        <div className="bignum gold">{s.coins.toLocaleString('uk-UA')} <small>MC</small></div>
        <div className="evlist" style={{ marginTop: 12 }}>
          <div><span className="grow">На початку міжсезоння</span><b className="num">{fmtMC(o.startCoins)}</b></div>
          <div><span className="grow">Купівля гравців</span><b className="bad num">−{fmtMC(o.transferSpent)}</b></div>
          <div><span className="grow">Продаж гравців</span><b className="good num">+{fmtMC(o.transferIncome)}</b></div>
          <div><span className="grow">Розвиток футболістів</span><b className="bad num">−{fmtMC(o.devSpent)}</b></div>
        </div>
      </div>
      <div className="panel">
        <h3>Бюджети клубів ліги</h3>
        <div className="mini-table budget">{rows.map((r, i) => <div key={r.id} className={r.id === s.userClub ? 'me' : ''}><span>{i + 1}</span><Logo club={r.id} size={22} /><span className="grow ell">{clubName(r.id)}</span><b>{fmtMC(r.coins)}</b></div>)}</div>
        {o.news.length > 0 && <><h3 style={{ marginTop: 16 }}>Новини ринку</h3><div className="news">{o.news.slice().reverse().slice(0, 8).map((n, i) => <div key={i} style={{ '--nc': 'var(--r-legendary)' } as CSSProperties}>{n}</div>)}</div></>}
      </div>
    </div>
  );
}

// ---------- підготовка ----------
function PrepTab({ s }: { s: SaveState }) {
  const sum = offseasonSummary(s);
  const club = s.clubs[s.userClub];
  const specials = club.players.filter((p) => p.special);
  return (
    <div className="grid two">
      <div className="panel">
        <h3>Підготовка до сезону {s.season + 1}</h3>
        <p style={{ fontSize: 14 }}>На старті сезону всі гравці відновлюють витривалість до 100%, травми й дискваліфікації скасовуються. Перевірте склад і тактику.</p>
        <div className="hub-stats" style={{ marginTop: 12 }}>
          <div className="stat"><span>Прогноз сили</span><b>{sum.strength}</b></div>
          <div className="stat"><span>Схема</span><b>{club.formation}</b></div>
          <div className="stat"><span>Особливі гравці</span><b>{specials.length}</b></div>
        </div>
        <div className="row wrap" style={{ marginTop: 12 }}><Btn kind="blue" onClick={() => go('squad')}>Перейти до складу</Btn></div>
      </div>
      <div className="panel">
        <h3>Особливі гравці у складі</h3>
        <div className="chips-list">{specials.map((p) => { const sp = SPECIAL_BY_ID[p.special!]; return <span className="chip" key={p.id} style={{ color: RARITY[sp.rarity].color }}>{sp.short} · {playerQ(p, true)}</span>; })}{!specials.length && <span className="muted">Поки що немає</span>}</div>
      </div>
    </div>
  );
}

// ---------- старт сезону ----------
function StartSeasonModal({ s, onClose }: { s: SaveState; onClose: () => void }) {
  const sum = offseasonSummary(s);
  const pending = s.offseason!.incoming.filter((x) => x.status === 'pending' || x.status === 'countered').length + s.offseason!.deals.filter((d) => ACTIVE.includes(d.status)).length;
  return (
    <Modal onClose={onClose} wide>
      <h2>Почати сезон {s.season + 1}?</h2>
      <div className="hub-stats" style={{ margin: '12px 0' }}>
        <div className="stat"><span>Бюджет</span><b className="gold">{s.coins.toLocaleString('uk-UA')}</b></div>
        <div className="stat"><span>Витрачено</span><b>{sum.spent.toLocaleString('uk-UA')}</b></div>
        <div className="stat"><span>Від продажів</span><b className="good">+{sum.income.toLocaleString('uk-UA')}</b></div>
        <div className="stat"><span>Прогноз сили</span><b>{sum.strength}</b></div>
      </div>
      <div className="evlist">
        <div><span className="grow">Придбано</span><b>{sum.bought.map((id) => SPECIAL_BY_ID[id].name).join(', ') || '—'}</b></div>
        <div><span className="grow">Продано</span><b>{sum.sold.map((id) => SPECIAL_BY_ID[id].name).join(', ') || '—'}</b></div>
        {sum.ratingChanges.map((r) => <div key={r.id}><span className="grow">{r.name}</span><b className="good">{r.from} → {r.to}</b></div>)}
      </div>
      {pending > 0 && <p className="gold" style={{ marginTop: 10, fontSize: 13.5 }}>Незавершені переговори ({pending}) буде закрито разом із трансферним вікном.</p>}
      <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>Після старту клуби-суперники завершать свої угоди й розвиток, буде створено новий календар.</p>
      <div className="actions"><Btn kind="silver" onClick={onClose}>Повернутися</Btn><Btn kind="primary" onClick={() => { onClose(); startNextSeason(); }}>Почати сезон {s.season + 1}</Btn></div>
    </Modal>
  );
}

