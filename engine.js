/* City Beautiful Deal - rules engine (no DOM). Works in browser (window.CBD) and Node. */
(function (root) {
'use strict';
const SETS = {
  brown:    { label: 'Brown',      size: 2, rent: [1, 2],       value: 1, hex: '#8a5a32', text: '#fff', places: ['Oak Ridge', 'Tangelo Park'] },
  lightblue:{ label: 'Light Blue', size: 3, rent: [1, 2, 3],    value: 1, hex: '#8fd3f4', text: '#123', places: ['Pine Hills', 'Holden Heights', 'Parramore'] },
  pink:     { label: 'Pink',       size: 3, rent: [1, 2, 4],    value: 2, hex: '#e65ea8', text: '#fff', places: ['Azalea Park', 'Kissimmee', 'Apopka'] },
  orange:   { label: 'Orange',     size: 3, rent: [1, 3, 5],    value: 2, hex: '#f59331', text: '#222', places: ['Ocoee', 'Sanford', 'Casselberry'] },
  red:      { label: 'Red',        size: 3, rent: [2, 3, 6],    value: 3, hex: '#e23b3b', text: '#fff', places: ['Altamonte Springs', 'Longwood', 'Clermont'] },
  yellow:   { label: 'Yellow',     size: 3, rent: [2, 4, 6],    value: 3, hex: '#f6d533', text: '#222', places: ['Winter Garden', 'Oviedo', 'Lake Mary'] },
  green:    { label: 'Green',      size: 3, rent: [2, 4, 7],    value: 4, hex: '#2fa65a', text: '#fff', places: ['Lake Nona', 'Baldwin Park', 'Winter Park'] },
  darkblue: { label: 'Dark Blue',  size: 2, rent: [3, 8],       value: 4, hex: '#2446a8', text: '#fff', places: ['Dr. Phillips', 'Windermere'] },
  railroad: { label: 'Expressway', size: 4, rent: [1, 2, 3, 4], value: 2, hex: '#3b3b3b', text: '#fff', noBuild: true, places: ['I-4', 'SR 408', 'SR 417', 'SR 429'] },
  utility:  { label: 'Utility',    size: 2, rent: [1, 2],       value: 2, hex: '#b9d98c', text: '#222', noBuild: true, places: ['OUC', 'Lake Apopka'] },
};
const COLORS = Object.keys(SETS);
const ACTIONS = {
  dealbreaker: { name: 'Deal Breaker', value: 5, count: 2, text: 'Take one complete property set from another player, including any House or Hotel on it.' },
  jsn:         { name: 'Just Say No', value: 4, count: 3, text: 'Play when another player targets you with an action to cancel it. Can also cancel another Just Say No.' },
  sly:         { name: 'Sly Deal', value: 3, count: 3, text: 'Take one property from another player. It cannot be part of a complete set.' },
  forced:      { name: 'Forced Deal', value: 3, count: 3, text: 'Swap one of your properties for one of another player\'s. Neither can be part of a complete set.' },
  debt:        { name: 'Debt Collector', value: 3, count: 3, text: 'Choose one player. They pay you 5M.' },
  birthday:    { name: "It's My Birthday", value: 2, count: 3, text: 'Every other player pays you 2M.' },
  passgo:      { name: 'Pass Go', value: 1, count: 10, text: 'Draw 2 more cards.' },
  house:       { name: 'House', value: 3, count: 3, text: 'Add to a complete set (not Expressway or Utility). Adds 3M to that set\'s rent.' },
  hotel:       { name: 'Hotel', value: 4, count: 2, text: 'Add to a complete set that already has a House (not Expressway or Utility). Adds 4M to that set\'s rent.' },
  double:      { name: 'Double The Rent', value: 1, count: 2, text: 'Play together with a Rent card to double the rent. Counts as one of your plays.' },
};
const WILDS = [['darkblue','green',4,1],['green','railroad',4,1],['utility','railroad',2,1],['lightblue','railroad',4,1],['lightblue','brown',1,1],['pink','orange',2,2],['red','yellow',3,2]];
const RENTS = [['green','darkblue'],['brown','lightblue'],['pink','orange'],['railroad','utility'],['red','yellow']];

function buildDeck() {
  const cards = []; const add = (o) => { o.id = cards.length; cards.push(o); };
  [[1,6],[2,5],[3,3],[4,3],[5,2],[10,1]].forEach(([v,n]) => { for (let i=0;i<n;i++) add({ kind:'money', value:v, name: v+'M' }); });
  COLORS.forEach(c => SETS[c].places.forEach(p => add({ kind:'prop', color:c, colors:[c], name:p, value:SETS[c].value })));
  WILDS.forEach(([a,b,v,n]) => { for (let i=0;i<n;i++) add({ kind:'wild', colors:[a,b], value:v, name: SETS[a].label+' / '+SETS[b].label+' Wild' }); });
  for (let i=0;i<2;i++) add({ kind:'wild', any:true, colors:COLORS.slice(), value:0, name:'Any-Set Wild' });
  RENTS.forEach(([a,b]) => { for (let i=0;i<2;i++) add({ kind:'rent', colors:[a,b], value:1, name:'Rent: '+SETS[a].label+' / '+SETS[b].label }); });
  for (let i=0;i<3;i++) add({ kind:'rent', any:true, colors:COLORS.slice(), value:3, name:'Wild Rent' });
  Object.keys(ACTIONS).forEach(k => { for (let i=0;i<ACTIONS[k].count;i++) add({ kind:'action', act:k, value:ACTIONS[k].value, name:ACTIONS[k].name }); });
  return cards;
}

function rand(s) { let t = s.rs = (s.rs + 0x6D2B79F5) | 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
function shuffle(s, a) { for (let i=a.length-1;i>0;i--) { const j = Math.floor(rand(s)*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

function log(s, msg) { s.log.push(msg); if (s.log.length > 400) s.log.shift(); }
const C = (s, id) => s.cards[id];
const P = (s, i) => s.players[i];

function newGame(opts) {
  const cards = buildDeck();
  const s = { cards, deck: [], discard: [], players: [], cur: 0, plays: 0, phase: 'play', pending: null, winner: null, log: [], pileSeq: 1, turn: 0, rs: (opts.seed == null ? (Date.now() ^ (Math.random()*1e9)) : opts.seed) | 0, maxTurns: opts.maxTurns || 2000 };
  s.players = opts.players.map((p, i) => ({ id: i, name: p.name || ('Player ' + (i+1)), ai: !!p.ai, hand: [], bank: [], piles: [] }));
  if (s.players.length < 2 || s.players.length > 5) throw new Error('2-5 players');
  s.deck = shuffle(s, cards.map(c => c.id));
  for (let r=0;r<5;r++) s.players.forEach(p => draw(s, p, 1));
  s.cur = opts.first != null ? opts.first : 0;
  log(s, 'New game: ' + s.players.map(p => p.name).join(', ') + '.');
  startTurn(s);
  return s;
}

function draw(s, p, n) {
  let got = 0;
  for (let i=0;i<n;i++) {
    if (!s.deck.length) { if (!s.discard.length) break; s.deck = shuffle(s, s.discard); s.discard = []; log(s, 'Draw pile reshuffled.'); }
    p.hand.push(s.deck.pop()); got++;
  }
  return got;
}

function startTurn(s) {
  s.turn++;
  const p = P(s, s.cur);
  if (s.turn > s.maxTurns) { s.winner = -1; s.phase = 'over'; log(s, 'Turn limit reached: game drawn.'); return; }
  const n = draw(s, p, p.hand.length === 0 ? 5 : 2);
  s.plays = 0; s.phase = 'play';
  log(s, p.name + "'s turn (drew " + n + ').');
}

// ---------- property helpers ----------
const isAny = (s, id) => !!C(s, id).any;
function pileComplete(s, pile) { return pile.cards.length >= SETS[pile.color].size && pile.cards.some(id => !isAny(s, id)); }
function completeColors(s, p) { const set = new Set(); p.piles.forEach(pl => { if (pileComplete(s, pl)) set.add(pl.color); }); return set; }
function findPile(p, id) { return p.piles.find(pl => pl.cards.includes(id) || pl.house === id || pl.hotel === id); }
function rentFor(s, p, color) {
  let best = 0;
  p.piles.forEach(pl => { if (pl.color !== color) return; const n = Math.min(pl.cards.length, SETS[color].size); let r = SETS[color].rent[n-1];
    if (pileComplete(s, pl)) { if (pl.house != null) r += 3; if (pl.hotel != null) r += 4; } if (r > best) best = r; });
  return best;
}
function addProp(s, p, id, color) {
  let pile = p.piles.find(pl => pl.color === color && pl.cards.length < SETS[color].size);
  if (!pile && !isAny(s, id)) pile = p.piles.find(pl => pl.color === color && !pileComplete(s, pl));
  if (!pile) { pile = { id: s.pileSeq++, color, cards: [], house: null, hotel: null }; p.piles.push(pile); }
  pile.cards.push(id);
  normalize(s, p);
}
function removeCardFromPiles(s, p, id) {
  const pile = findPile(p, id); if (!pile) throw new Error('card not on table');
  if (pile.house === id) pile.house = null; else if (pile.hotel === id) pile.hotel = null; else pile.cards.splice(pile.cards.indexOf(id), 1);
  const color = pile.color; normalize(s, p); return color;
}
function normalize(s, p) {
  p.piles.forEach(pl => {
    const size = SETS[pl.color].size;
    while (pl.cards.length > size) { // split overflow (only arises with Any-Set wilds)
      let idx = pl.cards.findIndex(id => isAny(s, id)); if (idx < 0) idx = pl.cards.length - 1;
      const [x] = pl.cards.splice(idx, 1); p.piles.push({ id: s.pileSeq++, color: pl.color, cards: [x], house: null, hotel: null });
    }
  });
  p.piles.forEach(pl => { if (!pileComplete(s, pl)) {
    if (pl.hotel != null) { p.bank.push(pl.hotel); pl.hotel = null; }
    if (pl.house != null) { p.bank.push(pl.house); pl.house = null; } }
    else if (pl.house == null && pl.hotel != null) { p.bank.push(pl.hotel); pl.hotel = null; } });
  p.piles = p.piles.filter(pl => pl.cards.length || pl.house != null || pl.hotel != null);
  p.piles.forEach(pl => { if (!pl.cards.length) { if (pl.house != null) p.bank.push(pl.house); if (pl.hotel != null) p.bank.push(pl.hotel); pl.house = pl.hotel = null; } });
  p.piles = p.piles.filter(pl => pl.cards.length);
  COLORS.forEach(color => {
    const size = SETS[color].size;
    for (;;) {
      const inc = p.piles.filter(pl => pl.color === color && pl.cards.length < size);
      if (inc.length < 2) break;
      const a = inc[0], b = inc[inc.length-1];
      while (b.cards.length && a.cards.length < size) a.cards.push(b.cards.shift());
      if (!b.cards.length) p.piles.splice(p.piles.indexOf(b), 1);
    }
  });
}
function payable(s, p) {
  const out = p.bank.slice();
  p.piles.forEach(pl => { pl.cards.forEach(id => { if (C(s, id).value > 0) out.push(id); }); if (pl.house != null) out.push(pl.house); if (pl.hotel != null) out.push(pl.hotel); });
  return out;
}
const sumVal = (s, ids) => ids.reduce((t, id) => t + C(s, id).value, 0);
function tableValue(s, p) { return sumVal(s, payable(s, p)); }
function bankValue(s, p) { return sumVal(s, p.bank); }

function checkWin(s) {
  if (s.winner != null) return;
  const order = s.players.map((_, i) => (s.cur + i) % s.players.length);
  for (const i of order) if (completeColors(s, P(s, i)).size >= 3) { s.winner = i; s.phase = 'over'; s.pending = null; log(s, P(s, i).name + ' wins with 3 complete sets!'); return; }
}

// ---------- whose decision ----------
function actorNow(s) {
  if (s.winner != null) return null;
  if (s.pending) return s.pending.stage === 'jsn' ? s.pending.responder : s.pending.target;
  return s.cur;
}
function hasJSN(s, i) { return P(s, i).hand.some(id => C(s, id).act === 'jsn'); }

function opponents(s) { return s.players.map((_, i) => i).filter(i => i !== s.cur); }

function legalActions(s) {
  const out = [];
  if (s.winner != null) return out;
  if (s.pending) {
    const pd = s.pending;
    if (pd.stage === 'jsn') return [{ t: 'jsn', use: true }, { t: 'jsn', use: false }];
    return [{ t: 'pay' }]; // card choice made by player; validated in apply
  }
  const p = P(s, s.cur);
  if (s.phase === 'discard') return [{ t: 'discard' }];
  // wild flips (free)
  p.piles.forEach(pl => pl.cards.forEach(id => { const c = C(s, id); if (c.kind === 'wild') c.colors.forEach(col => { if (col !== pl.color) out.push({ t: 'move', card: id, color: col }); }); }));
  out.push({ t: 'end' });
  if (s.plays >= 3) return out;
  const left = 3 - s.plays;
  const doubles = p.hand.filter(id => C(s, id).act === 'double');
  const opps = opponents(s);
  const seen = new Set();
  p.hand.forEach(id => {
    const c = C(s, id);
    const sig = c.kind + '|' + (c.act || '') + '|' + (c.colors || []).join(',') + '|' + c.value + '|' + c.name;
    const dup = seen.has(sig); seen.add(sig);
    if (dup && c.kind !== 'prop') return; // identical cards give identical options
    if (c.kind === 'money') { out.push({ t: 'bank', card: id }); return; }
    if (c.kind === 'prop' || c.kind === 'wild') { c.colors.forEach(col => out.push({ t: 'prop', card: id, color: col })); return; }
    out.push({ t: 'bank', card: id });
    if (c.kind === 'rent') {
      c.colors.forEach(col => { if (rentFor(s, p, col) <= 0) return;
        for (let d = 0; d <= Math.min(doubles.length, left - 1); d++) {
          const ds = doubles.slice(0, d);
          if (c.any) opps.forEach(t => out.push({ t: 'rent', card: id, color: col, target: t, doubles: ds }));
          else out.push({ t: 'rent', card: id, color: col, target: 'all', doubles: ds });
        } });
      return;
    }
    switch (c.act) {
      case 'passgo': out.push({ t: 'passgo', card: id }); break;
      case 'birthday': out.push({ t: 'birthday', card: id }); break;
      case 'debt': opps.forEach(t => out.push({ t: 'debt', card: id, target: t })); break;
      case 'sly': opps.forEach(t => P(s, t).piles.forEach(pl => { if (!pileComplete(s, pl)) pl.cards.forEach(x => out.push({ t: 'sly', card: id, target: t, take: x })); })); break;
      case 'forced': {
        const gives = []; p.piles.forEach(pl => { if (!pileComplete(s, pl)) pl.cards.forEach(x => gives.push(x)); });
        if (gives.length) opps.forEach(t => P(s, t).piles.forEach(pl => { if (!pileComplete(s, pl)) pl.cards.forEach(x => gives.forEach(g => out.push({ t: 'forced', card: id, target: t, take: x, give: g }))); }));
        break; }
      case 'dealbreaker': opps.forEach(t => P(s, t).piles.forEach(pl => { if (pileComplete(s, pl)) out.push({ t: 'dealbreaker', card: id, target: t, pile: pl.id }); })); break;
      case 'house': p.piles.forEach(pl => { if (pileComplete(s, pl) && !SETS[pl.color].noBuild && pl.house == null) out.push({ t: 'house', card: id, pile: pl.id }); }); break;
      case 'hotel': p.piles.forEach(pl => { if (pileComplete(s, pl) && !SETS[pl.color].noBuild && pl.house != null && pl.hotel == null) out.push({ t: 'hotel', card: id, pile: pl.id }); }); break;
    }
  });
  return out;
}

function sameAction(a, b) {
  if (a.t !== b.t) return false;
  for (const k of ['color', 'target', 'take', 'give', 'pile']) if (a[k] !== b[k]) return false;
  if (a.t === 'rent' && (a.doubles || []).length !== (b.doubles || []).length) return false;
  return true;
}
function cardsEquivalent(s, a, b) { if (a === b) return true; const x = C(s, a), y = C(s, b); return x.kind !== 'prop' && x.kind === y.kind && x.act === y.act && x.value === y.value && x.name === y.name; }

function fromHand(s, p, id) { const i = p.hand.indexOf(id); if (i < 0) throw new Error('card not in hand'); p.hand.splice(i, 1); }

function apply(s, a) {
  if (s.winner != null) throw new Error('game over');
  if (s.pending) return applyPending(s, a);
  const p = P(s, s.cur);
  if (s.phase === 'discard') {
    if (a.t !== 'discard') throw new Error('must discard');
    const need = p.hand.length - 7;
    if (!Array.isArray(a.cards) || a.cards.length !== need || new Set(a.cards).size !== need || !a.cards.every(id => p.hand.includes(id))) throw new Error('discard exactly ' + need);
    a.cards.forEach(id => { fromHand(s, p, id); s.discard.push(id); });
    log(s, p.name + ' discarded ' + need + '.');
    return nextTurn(s);
  }
  // validate against legal list (card must be in hand; identical cards interchangeable)
  const legal = legalActions(s);
  const ok = legal.some(l => sameAction(l, a) && (l.card === undefined || (a.card !== undefined && (l.t === 'move' ? l.card === a.card : p.hand.includes(a.card) && cardsEquivalent(s, l.card, a.card)))));
  if (!ok) throw new Error('illegal action ' + JSON.stringify(a));
  if (a.t === 'end') {
    if (p.hand.length > 7) { s.phase = 'discard'; return; }
    return nextTurn(s);
  }
  if (a.t === 'move') { const col = removeCardFromPiles(s, p, a.card); addProp(s, p, a.card, a.color); log(s, p.name + ' flipped ' + C(s, a.card).name + ' from ' + SETS[col].label + ' to ' + SETS[a.color].label + '.'); return checkWin(s); }
  const c = C(s, a.card);
  fromHand(s, p, a.card);
  s.plays++;
  switch (a.t) {
    case 'bank': p.bank.push(a.card); log(s, p.name + ' banked ' + c.name + ' (' + c.value + 'M).'); break;
    case 'prop': addProp(s, p, a.card, a.color); log(s, p.name + ' played ' + c.name + (c.kind === 'wild' ? ' as ' + SETS[a.color].label : '') + '.'); checkWin(s); break;
    case 'passgo': s.discard.push(a.card); draw(s, p, 2); log(s, p.name + ' played Pass Go and drew 2.'); break;
    case 'house': case 'hotel': { const pl = p.piles.find(x => x.id === a.pile); pl[a.t] = a.card; log(s, p.name + ' built a ' + c.name + ' on ' + SETS[pl.color].label + '.'); checkWin(s); break; }
    case 'rent': {
      s.discard.push(a.card);
      const ds = []; (a.doubles || []).forEach(() => { const d = p.hand.find(id => C(s, id).act === 'double'); fromHand(s, p, d); s.discard.push(d); ds.push(d); s.plays++; });
      const amount = rentFor(s, p, a.color) * Math.pow(2, ds.length);
      const targets = a.target === 'all' ? opponents(s) : [a.target];
      log(s, p.name + ' charged ' + SETS[a.color].label + ' rent: ' + amount + 'M' + (ds.length ? ' (doubled' + (ds.length > 1 ? ' twice' : '') + ')' : '') + ' from ' + (a.target === 'all' ? 'everyone' : P(s, a.target).name) + '.');
      beginEffect(s, { kind: 'pay', label: SETS[a.color].label + ' rent', amount, targets }); break; }
    case 'birthday': s.discard.push(a.card); log(s, p.name + " played It's My Birthday: 2M from everyone."); beginEffect(s, { kind: 'pay', label: "It's My Birthday", amount: 2, targets: opponents(s) }); break;
    case 'debt': s.discard.push(a.card); log(s, p.name + ' played Debt Collector on ' + P(s, a.target).name + ' (5M).'); beginEffect(s, { kind: 'pay', label: 'Debt Collector', amount: 5, targets: [a.target] }); break;
    case 'sly': s.discard.push(a.card); log(s, p.name + ' played Sly Deal on ' + P(s, a.target).name + "'s " + C(s, a.take).name + '.'); beginEffect(s, { kind: 'sly', label: 'Sly Deal', targets: [a.target], take: a.take }); break;
    case 'forced': s.discard.push(a.card); log(s, p.name + ' played Forced Deal: ' + C(s, a.give).name + ' for ' + P(s, a.target).name + "'s " + C(s, a.take).name + '.'); beginEffect(s, { kind: 'forced', label: 'Forced Deal', targets: [a.target], take: a.take, give: a.give }); break;
    case 'dealbreaker': { s.discard.push(a.card); const pl = P(s, a.target).piles.find(x => x.id === a.pile); log(s, p.name + ' played Deal Breaker on ' + P(s, a.target).name + "'s " + SETS[pl.color].label + ' set.'); beginEffect(s, { kind: 'dealbreaker', label: 'Deal Breaker', targets: [a.target], pile: a.pile }); break; }
    default: throw new Error('unknown action');
  }
}

function beginEffect(s, eff) {
  s.pending = Object.assign({ from: s.cur, queue: eff.targets.slice(), target: null, stage: 'next', chain: 0, responder: null }, eff);
  advance(s);
}
function advance(s) {
  const pd = s.pending;
  for (;;) {
    if (pd.stage === 'next') {
      if (!pd.queue.length) { s.pending = null; checkWin(s); return; }
      pd.target = pd.queue.shift(); pd.chain = 0; pd.responder = pd.target; pd.stage = 'jsn';
    }
    if (pd.stage === 'jsn') { if (hasJSN(s, pd.responder)) return; pd.stage = pd.chain % 2 ? 'skip' : 'apply'; }
    if (pd.stage === 'skip') { log(s, pd.label + ' against ' + P(s, pd.target).name + ' was cancelled.'); pd.stage = 'next'; continue; }
    if (pd.stage === 'apply') { if (applyEffect(s, pd)) return; pd.stage = 'next'; if (s.winner != null) { s.pending = null; return; } }
  }
}
function applyEffect(s, pd) {
  const from = P(s, pd.from), tg = P(s, pd.target);
  if (pd.kind === 'pay') {
    const assets = payable(s, tg); const total = sumVal(s, assets);
    if (total === 0) { log(s, tg.name + ' has nothing to pay with.'); return false; }
    if (total <= pd.amount) { transfer(s, tg, from, assets); log(s, tg.name + ' paid everything they had (' + total + 'M) to ' + from.name + '.'); return false; }
    pd.stage = 'pay'; return true;
  }
  if (pd.kind === 'sly' || pd.kind === 'forced') {
    const col = removeCardFromPiles(s, tg, pd.take); addProp(s, from, pd.take, col);
    if (pd.kind === 'forced') { const col2 = removeCardFromPiles(s, from, pd.give); addProp(s, tg, pd.give, col2); }
    log(s, from.name + ' took ' + C(s, pd.take).name + (pd.kind === 'forced' ? ' and gave ' + C(s, pd.give).name : '') + '.');
  } else if (pd.kind === 'dealbreaker') {
    const pl = tg.piles.find(x => x.id === pd.pile); tg.piles.splice(tg.piles.indexOf(pl), 1); from.piles.push(pl); normalize(s, from); normalize(s, tg);
    log(s, from.name + ' took the complete ' + SETS[pl.color].label + ' set.');
  }
  checkWin(s); return false;
}
function transfer(s, payer, recv, ids) {
  ids.forEach(id => {
    if (payer.bank.includes(id)) { payer.bank.splice(payer.bank.indexOf(id), 1); recv.bank.push(id); return; }
    const pl = findPile(payer, id); if (!pl) return; // building already moved to bank by normalize -> handle below
    if (pl.house === id || pl.hotel === id) { removeCardFromPiles(s, payer, id); recv.bank.push(id); return; }
    const col = removeCardFromPiles(s, payer, id); addProp(s, recv, id, col);
  });
  // buildings selected but auto-moved to payer bank during removal
  ids.forEach(id => { if (payer.bank.includes(id)) { payer.bank.splice(payer.bank.indexOf(id), 1); recv.bank.push(id); } });
}
function applyPending(s, a) {
  const pd = s.pending;
  if (pd.stage === 'jsn') {
    if (a.t !== 'jsn') throw new Error('expected Just Say No decision');
    if (a.use) {
      const r = P(s, pd.responder); const j = r.hand.find(id => C(s, id).act === 'jsn'); if (j == null) throw new Error('no Just Say No');
      fromHand(s, r, j); s.discard.push(j); pd.chain++;
      log(s, r.name + ' played Just Say No!');
      pd.responder = pd.responder === pd.target ? pd.from : pd.target;
    } else pd.stage = pd.chain % 2 ? 'skip' : 'apply';
    return advance(s);
  }
  if (pd.stage === 'pay') {
    if (a.t !== 'pay' || !Array.isArray(a.cards)) throw new Error('expected payment');
    const tg = P(s, pd.target); const assets = payable(s, tg);
    const ids = [...new Set(a.cards)];
    if (!ids.every(id => assets.includes(id))) throw new Error('invalid payment card');
    const v = sumVal(s, ids);
    if (v < pd.amount && ids.length !== assets.length) throw new Error('payment too small');
    transfer(s, tg, P(s, pd.from), ids);
    log(s, tg.name + ' paid ' + v + 'M to ' + P(s, pd.from).name + '.');
    pd.stage = 'next'; checkWin(s); if (s.winner != null) { s.pending = null; return; }
    return advance(s);
  }
  throw new Error('bad pending state');
}
function nextTurn(s) { s.cur = (s.cur + 1) % s.players.length; startTurn(s); }

function allCardLocations(s) {
  const ids = [...s.deck, ...s.discard];
  s.players.forEach(p => { ids.push(...p.hand, ...p.bank); p.piles.forEach(pl => { ids.push(...pl.cards); if (pl.house != null) ids.push(pl.house); if (pl.hotel != null) ids.push(pl.hotel); }); });
  return ids;
}

const api = { SETS, COLORS, ACTIONS, buildDeck, newGame, legalActions, apply, actorNow, rentFor, pileComplete, completeColors, payable, sumVal, tableValue, bankValue, hasJSN, allCardLocations, opponents, findPile };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CBD = api;
})(typeof window !== 'undefined' ? window : globalThis);
