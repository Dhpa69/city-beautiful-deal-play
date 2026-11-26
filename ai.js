/* City Beautiful Deal - computer player */
(function (root) {
'use strict';
const E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.CBD;
const { SETS } = E;
const C = (s, id) => s.cards[id];

function colorCount(s, p, color) { let best = 0; p.piles.forEach(pl => { if (pl.color === color && !E.pileComplete(s, pl)) best = Math.max(best, pl.cards.length); }); return best; }
function hasComplete(s, p, color) { return p.piles.some(pl => pl.color === color && E.pileComplete(s, pl)); }
function propGain(s, p, color, cardId) {
  const size = SETS[color].size, n = colorCount(s, p, color) + 1;
  const pile = p.piles.find(pl => pl.color === color && !E.pileComplete(s, pl));
  const real = !C(s, cardId).any || (pile && pile.cards.some(id => !C(s, id).any));
  const done = doneSets(s, p), need = E.setsNeeded(s);
  if (n >= size && real) return (!done.has(color) && done.size >= need - 1) ? 2000 : (done.has(color) ? 60 : 150);
  return 30 + 60 * n / size + SETS[color].value * 2 - (done.has(color) ? 15 : 0);
}
function doneSets(s, p) { return s.teams ? E.teamColors(s, s.teams[p.id]) : E.completeColors(s, p); }
function lossOf(s, p, id) { // how much the owner loses giving up a table card
  const pl = E.findPile(p, id); if (!pl) return C(s, id).value;
  if (E.pileComplete(s, pl)) return 80 + C(s, id).value;
  return C(s, id).value + 25 * pl.cards.length / SETS[pl.color].size;
}
function richest(s, ids) { return ids.slice().sort((a, b) => E.tableValue(s, s.players[b]) - E.tableValue(s, s.players[a]))[0]; }

function score(s, a) {
  const p = s.players[s.cur];
  const c = a.card != null ? C(s, a.card) : null;
  const bank = E.bankValue(s, p);
  switch (a.t) {
    case 'end': return 0;
    case 'move': return -1;
    case 'passgo': return 120;
    case 'prop': return propGain(s, p, a.color, a.card);
    case 'bank':
      if (c.kind === 'money') return 40 + c.value;
      if (c.act === 'jsn') return bank < 3 ? 5 : -10;
      if (c.act === 'dealbreaker') return -20;
      if (c.kind === 'rent') return bank < 4 ? 8 : -5;
      return (bank < 5 ? 25 : 2) + c.value - (c.act === 'passgo' ? 30 : 0);
    case 'rent': {
      const amt = E.rentFor(s, p, a.color) * Math.pow(2, a.doubles.length);
      const tg = a.target === 'all' ? E.opponents(s) : [a.target];
      const got = tg.reduce((t, i) => t + Math.min(amt, E.tableValue(s, s.players[i])), 0);
      if (a.target !== 'all' && a.target !== richest(s, E.opponents(s))) return got * 10 - 30;
      return got * 12 - a.doubles.length * 25 - (c.any ? 15 : 0);
    }
    case 'debt': return Math.min(5, E.tableValue(s, s.players[a.target])) * 12 - 5;
    case 'birthday': return E.opponents(s).reduce((t, i) => t + Math.min(2, E.tableValue(s, s.players[i])), 0) * 12 - 5;
    case 'sly': { const tg = s.players[a.target]; const pl = E.findPile(tg, a.take); return propGain(s, p, pl.color, a.take) + 10 + 10 * pl.cards.length / SETS[pl.color].size; }
    case 'forced': { const tg = s.players[a.target]; const pl = E.findPile(tg, a.take); return propGain(s, p, pl.color, a.take) - lossOf(s, p, a.give) - 10; }
    case 'dealbreaker': { const pl = s.players[a.target].piles.find(x => x.id === a.pile); const done = doneSets(s, p);
      return (!done.has(pl.color) && done.size >= E.setsNeeded(s) - 1) ? 5000 : 300 + SETS[pl.color].value * 10 + (pl.house != null ? 30 : 0) + (pl.hotel != null ? 40 : 0); }
    case 'house': return 90; case 'hotel': return 95;
  }
  return 0;
}

function choosePayment(s, i, amount) {
  const p = s.players[i];
  const bank = p.bank.slice().filter(id => C(s, id).value > 0);
  const bt = E.sumVal(s, bank);
  if (bt >= amount) { // minimal overpay subset via DP
    const best = new Map([[0, []]]);
    bank.forEach(id => { const v = C(s, id).value; [...best.entries()].forEach(([sum, set]) => { const n = sum + v; if (!best.has(n) || best.get(n).length > set.length + 1) best.set(n, set.concat(id)); }); });
    const sums = [...best.keys()].filter(x => x >= amount).sort((a, b) => a - b);
    return best.get(sums[0]);
  }
  const pick = bank.slice(); let need = amount - bt;
  const rest = E.payable(s, p).filter(id => !p.bank.includes(id)).sort((a, b) => lossOf(s, p, a) - lossOf(s, p, b));
  for (const id of rest) { if (need <= 0) break; pick.push(id); need -= C(s, id).value; }
  return pick;
}
function stake(s, pd, forActor) {
  if (pd.kind === 'dealbreaker') return 10;
  if (pd.kind === 'pay') return Math.min(pd.amount, E.tableValue(s, s.players[pd.target]));
  const tg = s.players[pd.target]; const pl = E.findPile(tg, pd.take);
  return pl ? 2 + Math.round(3 * pl.cards.length / SETS[pl.color].size) : 2;
}
function choose(s) {
  const who = E.actorNow(s); if (who == null) return null;
  const pd = s.pending;
  if (pd) {
    if (pd.stage === 'jsn') return { t: 'jsn', use: stake(s, pd, who === pd.from) >= 3 };
    if (pd.stage === 'boost') { const rich = Math.max(...E.opponents(s).map(i => E.tableValue(s, s.players[i]))); return { t: 'boost', n: pd.amount >= 2 && rich > pd.amount ? E.countDoubles(s, who) : 0 }; }
    return { t: 'pay', cards: choosePayment(s, who, pd.amount) };
  }
  const p = s.players[s.cur];
  if (s.phase === 'discard') {
    const keep = id => { const c = C(s, id); return c.value + (c.kind === 'prop' || c.kind === 'wild' ? 12 : 0) + (c.act === 'jsn' ? 9 : 0) + (c.act === 'dealbreaker' ? 15 : 0); };
    return { t: 'discard', cards: p.hand.slice().sort((a, b) => keep(a) - keep(b)).slice(0, p.hand.length - 7) };
  }
  let best = { t: 'end' }, bs = 0;
  E.legalActions(s).forEach(a => { const v = score(s, a); if (v > bs) { bs = v; best = a; } });
  return best;
}
const api = { choose, choosePayment };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CBDAI = api;
})(typeof window !== 'undefined' ? window : globalThis);
