/* City Beautiful Deal - browser UI */
(function () {
'use strict';
const E = window.CBD, AI = window.CBDAI, SETS = E.SETS;
const $ = id => document.getElementById(id);
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SAVE = 'cbd-save-v1';
let S = null, viewer = 0, aiTimer = null, AI_DELAY = 700;
let setup = { n: 4, mode: 'ai', seats: [], teams: false };
const TEAM_HEX = ['#ff9f1c', '#4ea8ff'];
function teamBadge(team) { return `<span class="tbadge" style="background:${TEAM_HEX[team]}">${E.TEAM_NAMES[team].replace('Team ', '')}</span>`; }
function progLabel(p) { if (!S.teams) return E.completeColors(S, p).size + '/3 sets'; return teamBadge(p.team) + ' ' + E.teamColors(S, p.team).size + '/5 team sets'; }

// ---------- setup ----------
function seatDefaults() {
  const names = ['You', 'Lake Eola Lou', 'Citrus Sam', 'Gator Gail'];
  for (let i = 0; i < 4; i++) {
    if (!setup.seats[i]) setup.seats[i] = {};
    if (setup.mode === 'ai') { setup.seats[i] = { name: i === 0 ? 'You' : names[i], ai: i !== 0, team: i % 2 }; }
    else { setup.seats[i] = { name: 'Player ' + (i + 1), ai: false, team: i % 2 }; }
  }
}
function renderSeats() {
  const box = $('seats'); box.innerHTML = '';
  for (let i = 0; i < setup.n; i++) {
    const st = setup.seats[i];
    const d = document.createElement('div'); d.className = 'seat';
    d.innerHTML = `<input maxlength="16" value="${esc(st.name)}" aria-label="Seat ${i + 1} name"><select><option value="h">Human</option><option value="a">Computer</option></select>` + (setup.teams ? `<select class="tsel"><option value="0">Orange</option><option value="1">Blue</option></select>` : '');
    if (setup.teams) { const ts = d.querySelector('.tsel'); ts.value = String(st.team); ts.style.background = TEAM_HEX[st.team] + '55'; ts.onchange = e => { st.team = +e.target.value; renderSeats(); }; }
    d.querySelector('input').oninput = e => st.name = e.target.value;
    const sel = d.querySelector('select'); sel.value = st.ai ? 'a' : 'h'; sel.onchange = e => st.ai = e.target.value === 'a';
    box.appendChild(d);
  }
}
function initSetup() {
  seatDefaults(); renderSeats();
  $('teamSeg').querySelectorAll('button').forEach(b => b.onclick = () => { setup.teams = b.dataset.t === '1'; $('teamSeg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    if (setup.teams) { setup.n = 4; $('countSeg').querySelectorAll('button').forEach(x => x.classList.toggle('on', +x.dataset.n === 4)); }
    $('teamHint').classList.toggle('hidden', !setup.teams); renderSeats(); });
  $('countSeg').querySelectorAll('button').forEach(b => b.onclick = () => { if (setup.teams && +b.dataset.n !== 4) return toast('Team mode is 4 players (2 vs 2).'); setup.n = +b.dataset.n; $('countSeg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); renderSeats(); });
  $('modeSeg').querySelectorAll('button').forEach(b => b.onclick = () => { setup.mode = b.dataset.m; $('modeSeg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); seatDefaults(); renderSeats(); });
  $('startBtn').onclick = startGame;
  $('resumeBtn').classList.toggle('hidden', !localStorage.getItem(SAVE));
  $('resumeBtn').onclick = () => { try { const d = JSON.parse(localStorage.getItem(SAVE)); S = d.S; viewer = d.viewer; if (d.room) return NET.resumeHost(d.room); showGame(); } catch (e) { localStorage.removeItem(SAVE); toast('Saved game could not be loaded.'); } };
}
function startGame() {
  const players = setup.seats.slice(0, setup.n).map((s, i) => ({ name: (s.name || '').trim() || ('Player ' + (i + 1)), ai: s.ai }));
  if (!players.some(p => !p.ai)) { toast('Make at least one seat Human.'); return; }
  let teams;
  if (setup.teams) { teams = setup.seats.slice(0, 4).map(s => s.team); if (teams.filter(x => x === 0).length !== 2) return toast('Each team needs exactly 2 players.'); }
  S = E.newGame({ players, teams });
  viewer = players.findIndex(p => !p.ai);
  showGame();
}
function showGame() { skipAll = false; lastSeq = (S && S.evSeq) ? Math.max(0, S.evSeq - (S.turn <= 1 ? 1 : 0)) : 0; $('setup').classList.add('hidden'); $('game').classList.remove('hidden'); passedTo = humans().length > 1 ? null : viewer; loop(); }
const humans = () => S.players.filter(p => !p.ai && !p.remote).map(p => p.id);
function save() { if (NET.mode === 'client') return; try { if (S.winner == null) localStorage.setItem(SAVE, JSON.stringify({ S, viewer, room: NET.mode === 'host' ? NET.roomSave() : null })); else localStorage.removeItem(SAVE); } catch (e) {} }

// ---------- main loop with paced playback ----------
let passedTo = null;
const SPEEDS = { slow: 1800, normal: 1250, fast: 650, instant: 0 };
const THINK = { slow: 700, normal: 450, fast: 200, instant: 0 };
let speed = localStorage.getItem('cbd-speed') || 'normal'; if (!(speed in SPEEDS)) speed = 'normal';
let lastSeq = 0, playing = false, loopAgain = false, shown = null, skipAll = false, skipStep = null;
function snapshot() { const c = S.cards; delete S.cards; const x = JSON.parse(JSON.stringify(S)); S.cards = c; x.cards = c; return x; }
function newEvents() { return (S.events || []).filter(e => e.seq > lastSeq); }
function loop() {
  clearTimeout(aiTimer);
  if (!S) return;
  if (playing) { loopAgain = true; return; }
  save();
  if (NET.mode === 'host') NET.broadcastState();
  const evs = newEvents();
  if (evs.length && SPEEDS[speed] > 0) {
    closeModal(); playing = true; lastSeq = evs[evs.length - 1].seq;
    render();
    playEvents(evs).then(() => { playing = false; shown = null; loopAgain = false; loop(); });
    return;
  }
  lastSeq = S.evSeq || 0; shown = null;
  closeModal(); render();
  if (S.winner != null) return showWinner();
  const who = E.actorNow(S);
  if (NET.mode === 'client') { $('pass').classList.add('hidden'); if (who !== viewer) return; return humanPrompt(); }
  const pl = S.players[who];
  if (pl.remote && !pl.ai) {
    if (!pl.away) return;
    const left = NET.grace - (Date.now() - pl.away);
    aiTimer = setTimeout(() => { if (E.actorNow(S) === who && S.players[who].away) act(AI.choose(S)); else loop(); }, Math.max(left, AI_DELAY)); return;
  }
  if (pl.ai) { aiTimer = setTimeout(() => act(AI.choose(S)), speed === 'instant' ? AI_DELAY : THINK[speed]); return; }
  if (humans().length > 1 && passedTo !== who) return showPass(who);
  viewer = who; $('pass').classList.add('hidden'); render();
  humanPrompt();
  if (!S.pending && S.phase === 'play') maybeTips();
}
function humanPrompt() {
  if (S.pending) return S.pending.stage === 'jsn' ? promptJSN() : S.pending.stage === 'boost' ? promptBoost() : promptPay();
  if (S.phase === 'discard') return promptDiscard();
}
function act(a) {
  if (NET.mode === 'client') { closeModal(); NET.send({ t: 'act', a }); $('playsLeft').textContent = 'Sending…'; return; }
  if (!playing) shown = snapshot();
  try { E.apply(S, a); } catch (e) { shown = null; toast(e.message); console.error(e); }
  loop();
}
function showPass(who) {
  const p = S.players[who];
  $('passTitle').textContent = 'Pass to ' + p.name;
  $('passMsg').textContent = S.pending ? (S.pending.stage === 'jsn' ? p.name + ' needs to decide on a Just Say No.' : S.pending.stage === 'boost' ? p.name + ' can stack Double The Rent.' : p.name + ' needs to pay.') : (who === S.cur ? "It's " + p.name + "'s turn." : '');
  $('passBtn').textContent = "I'm " + p.name + ' - show my hand';
  $('pass').classList.remove('hidden');
  $('passBtn').onclick = () => { passedTo = who; viewer = who; loop(); };
}

// ---------- names & wording ----------
const youMode = () => NET.mode !== 'local' || (S && humans().length <= 1);
const N = pid => (youMode() && pid === viewer) ? 'You' : esc(S.players[pid].name);
const POS = pid => (youMode() && pid === viewer) ? 'your' : esc(S.players[pid].name) + "'s";
const VB = (pid, a, b) => (youMode() && pid === viewer) ? a : b;
const cname = id => { const c = S.cards[id]; return c.kind === 'wild' ? (c.any ? 'Any-Set Wild' : 'Wild') : c.name; };
const AVATAR = ['#ff9f1c', '#4ea8ff', '#e65ea8', '#2fa65a'];
function avatar(p) { return `<span class="avatar" style="background:${S.teams ? TEAM_HEX[p.team] : AVATAR[p.id % 4]}">${esc((p.name || '?')[0].toUpperCase())}</span>`; }
function progressText(p) { return S.teams ? E.teamColors(S, p.team).size + '/5' : E.completeColors(S, p).size + '/3'; }

// ---------- cards ----------
const ICON = { dealbreaker: '💥', jsn: '✋', sly: '🦊', forced: '🔄', debt: '💼', birthday: '🎂', passgo: '🚦', house: '🏠', hotel: '🏨', double: '✖️2' };
const SHORT = { dealbreaker: 'Steal a complete set', jsn: 'Cancel an action against you', sly: 'Steal 1 property (not from a full set)', forced: 'Swap 1 property (not from a full set)', debt: 'One player pays you 5M', birthday: 'Everyone pays you 2M', passgo: 'Draw 2 extra cards', house: '+3M rent on a full set', hotel: '+4M rent (set needs a House)', double: 'Play with Rent: x2' };
function sw(color) { return `<span class="sw" style="background:${SETS[color].hex}"></span>`; }
function cardHTML(id, cls) {
  cls = cls || '';
  if (id === 'back' || id == null || id < 0) return `<div class="card back ${cls}"><div class="backart"><span class="sun"></span><b>City<br>Beautiful</b></div></div>`;
  const c = S.cards[id];
  if (c.kind === 'prop') { const st = SETS[c.color];
    return `<div class="card prop ${cls}" data-id="${id}" style="--c:${st.hex};--t:${st.text}"><div class="cbar">${esc(st.label)}</div><div class="cname">${esc(c.name)}</div><div class="ladder">${st.rent.map((r, i) => `<div class="${i === st.rent.length - 1 ? 'full' : ''}"><span>${i === st.rent.length - 1 ? '★ full set' : (i + 1) + ' card' + (i ? 's' : '')}</span><b>${r}M</b></div>`).join('')}</div><div class="cval">${c.value}M</div></div>`; }
  if (c.kind === 'wild') {
    if (c.any) return `<div class="card wild anyw ${cls}" data-id="${id}"><div class="cbar rainbow">Wild · any set</div><div class="cname">Any-Set Wild</div><div class="ctext">Counts as any color. No money value - can't pay debts.</div></div>`;
    const [a, b] = c.colors, A = SETS[a], B = SETS[b];
    return `<div class="card wild ${cls}" data-id="${id}"><div class="cbar split" style="background:linear-gradient(90deg,${A.hex} 50%,${B.hex} 50%)"><span style="color:${A.text}">${esc(A.label)}</span><span style="color:${B.text}">${esc(B.label)}</span></div><div class="cname">Property Wild</div><div class="wrent"><div>${sw(a)}${A.rent.join('·')}M</div><div>${sw(b)}${B.rent.join('·')}M</div></div><div class="cval">${c.value}M</div></div>`; }
  if (c.kind === 'money') return `<div class="card money m${c.value} ${cls}" data-id="${id}"><div class="mcorner">${c.value}M</div><div class="mbig">${c.value}M</div><div class="mcap">Money</div></div>`;
  if (c.kind === 'rent') {
    const disc = c.any ? 'conic-gradient(#8a5a32,#8fd3f4,#e65ea8,#f59331,#e23b3b,#f6d533,#2fa65a,#2446a8,#8a5a32)' : `conic-gradient(${SETS[c.colors[0]].hex} 0 50%,${SETS[c.colors[1]].hex} 50% 100%)`;
    return `<div class="card rent ${cls}" data-id="${id}"><div class="rdisc" style="background:${disc}"><b>RENT</b></div><div class="aname">${c.any ? 'Wild Rent' : esc(SETS[c.colors[0]].label + ' / ' + SETS[c.colors[1]].label)}</div><div class="ctext">${c.any ? 'One player pays rent for any of your sets' : 'Every opponent pays'}</div><div class="cval">${c.value}M</div></div>`; }
  return `<div class="card action a-${c.act} ${cls}" data-id="${id}"><div class="aicon">${ICON[c.act]}</div><div class="aname">${esc(c.name)}</div><div class="ctext">${SHORT[c.act]}</div><div class="cval">${c.value}M</div></div>`;
}
function pileHTML(pl, mine) {
  const done = E.pileComplete(S, pl), st = SETS[pl.color];
  const canFlip = mine && S.cur === viewer && !S.pending && S.phase === 'play' && !playing && NET.mode !== 'client' || (mine && NET.mode === 'client' && S.cur === viewer && !S.pending && S.phase === 'play');
  let cards = pl.cards.map(id => cardHTML(id, 'xs' + (S.cards[id].kind === 'wild' && canFlip ? ' flip' : ''))).join('');
  if (pl.house != null) cards += cardHTML(pl.house, 'xs'); if (pl.hotel != null) cards += cardHTML(pl.hotel, 'xs');
  return `<div class="fan ${done ? 'done' : ''}" style="--c:${st.hex}"><div class="fanhead">${sw(pl.color)}<b>${esc(st.label)}</b><span>${Math.min(pl.cards.length, st.size)}/${st.size}${done ? ' ✓' : ''}</span><span class="rentnow">rent ${E.rentFor(S, { piles: [pl] }, pl.color)}M</span></div><div class="fancards">${cards}</div></div>`;
}
function setBar(pl) {
  const st = SETS[pl.color], n = Math.min(pl.cards.length, st.size), done = E.pileComplete(S, pl);
  return `<span class="setbar ${done ? 'done' : ''}" style="--c:${st.hex};--t:${st.text}" title="${esc(pl.cards.map(cname).join(', '))}"><span class="fill" style="width:${n / st.size * 100}%"></span><span class="lbl">${esc(st.label)} ${n}/${st.size}${pl.house != null ? ' 🏠' : ''}${pl.hotel != null ? '🏨' : ''}${done ? ' ✓' : ''}</span></span>`;
}

// ---------- rendering ----------
function render() {
  if (!S) return;
  const real = S; if (shown) S = shown;
  try { renderBody(); } finally { S = real; }
}
function renderBody() {
  const cur = S.players[S.cur], me = S.players[viewer];
  const myTurn = S.winner == null && viewer === S.cur && !S.pending && S.phase === 'play' && !playing;
  // header pill
  let pill;
  if (S.winner != null) pill = 'Game over';
  else if (S.pending) { const a = E.actorNow(S); pill = `${avatar(S.players[a])}<span>${a === viewer && youMode() ? 'Your decision' : 'Waiting for ' + esc(S.players[a].name)}</span>`; }
  else pill = `${avatar(cur)}<span>${S.cur === viewer && youMode() ? 'Your turn' : esc(cur.name) + "'s turn"}</span>`;
  $('turnPill').innerHTML = pill; $('turnPill').classList.toggle('mine', S.cur === viewer && S.winner == null);
  $('speedBtn').textContent = { slow: '🐢 Slow', normal: '▶ Normal', fast: '⏩ Fast', instant: '⚡' }[speed];
  // feed
  const recent = (S.events || []).filter(e => e.k !== 'win').slice(-4).reverse();
  $('feed').innerHTML = recent.map((e, i) => { const v = eventView(e); return `<span class="chip ${i === 0 ? 'new' : ''} tone-${v.tone || ''}">${v.icon || ''} ${v.cap}</span>`; }).join('') || '<span class="chip">Moves will show here</span>';
  // opponents
  $('opps').className = 'n' + (S.players.length - 1);
  $('opps').innerHTML = S.players.filter(p => p.id !== viewer).map(p => {
    const active = p.id === S.cur && S.winner == null, deciding = S.pending && E.actorNow(S) === p.id;
    const mate = S.teams && p.team === me.team;
    return `<div class="opp ${active ? 'active' : ''} ${deciding ? 'deciding' : ''} ${S.teams ? 'team' + p.team : ''}" data-p="${p.id}">
      <div class="ohead">${avatar(p)}<div class="oname"><b>${esc(p.name)}</b>${p.ai ? '<span class="tag">CPU</span>' : ''}${p.remote ? (p.away ? '<span class="tag off">offline</span>' : '<span class="tag">📱</span>') : ''}${mate ? '<span class="tag mate">teammate</span>' : ''}</div>${active ? '<span class="turntag">' + (S.pending ? '…' : 'playing') + '</span>' : deciding ? '<span class="turntag dec">deciding</span>' : ''}</div>
      <div class="ostats"><span title="Cards in hand">🂠 ${p.hand.length}</span><span title="Bank">💰 ${E.bankValue(S, p)}M</span><span title="Complete sets" class="prog">★ ${progressText(p)}</span></div>
      <div class="osets">${p.piles.map(setBar).join('') || '<span class="none">No properties yet</span>'}</div></div>`;
  }).join('');
  $('opps').querySelectorAll('.opp').forEach(x => x.onclick = () => showPlayer(+x.dataset.p));
  // middle
  $('deckCount').textContent = S.deck.length + ' left';
  $('discardTop').innerHTML = S.discard.length ? cardHTML(S.discard[S.discard.length - 1], 'xs') : '<div class="card xs empty"></div>';
  // me
  $('me').innerHTML = `<div class="mebox ${S.cur === viewer && S.winner == null ? 'active' : ''} ${S.teams ? 'team' + me.team : ''}">
    <div class="mehead">${avatar(me)}<b>${esc(me.name)}${youMode() && !/^you$/i.test(me.name) ? ' (you)' : ''}</b>${S.teams ? teamBadge(me.team) : ''}<span class="prog">★ ${progressText(me)} ${S.teams ? 'team sets' : 'sets'}</span></div>
    <div class="merow"><div id="myBank" class="bankbox"><div class="lbl">Bank</div><div class="bigval">${E.bankValue(S, me)}M</div><div class="coins">${me.bank.map(id => `<span class="coin m${S.cards[id].value}">${S.cards[id].value}</span>`).join('')}</div></div>
    <div id="myPiles" class="mypiles">${me.piles.map(pl => pileHTML(pl, true)).join('') || '<div class="none">Your properties go here. Tap a property card in your hand to play it.</div>'}</div></div></div>`;
  $('me').querySelectorAll('.card.flip').forEach(x => x.onclick = () => flipWild(+x.dataset.id));
  // hand
  const hideHand = playing && NET.mode === 'local' && humans().length > 1;
  $('handTitle').textContent = 'Your hand · ' + me.hand.length;
  const left = 3 - S.plays;
  $('playsLeft').innerHTML = myTurn ? `<span class="pips">${[0, 1, 2].map(i => `<i class="${i < left ? 'on' : ''}"></i>`).join('')}</span> Plays left: <b>${left}</b>` : (S.winner != null ? '' : playing ? 'Watching moves…' : 'Waiting for ' + esc(S.players[E.actorNow(S)].name) + '…');
  $('endBtn').disabled = !myTurn; $('endBtn').classList.toggle('pulse', myTurn && left === 0);
  $('hand').innerHTML = hideHand ? '<div class="hidden-hand">Hand hidden while moves play</div>' : me.hand.map(id => cardHTML(id, myTurn && left > 0 ? 'playable' : (myTurn ? '' : 'dim'))).join('');
  $('hand').querySelectorAll('.card').forEach(x => x.onclick = () => handTap(+x.dataset.id, myTurn));
  $('logList').innerHTML = S.log.slice().reverse().map(l => `<div>${esc(l)}</div>`).join('');
}

// ---------- playback stage ----------
function eventView(e) {
  const P = S.players;
  switch (e.k) {
    case 'turn': return { icon: '🔄', cap: e.p === viewer && youMode() ? 'Your turn' : `${esc(P[e.p].name)}'s turn`, sub: `${N(e.p)} drew ${e.n} card${e.n === 1 ? '' : 's'}`, cards: Array(Math.min(e.n, 5)).fill('back'), from: ['deck'], to: [e.p, 'hand'], tone: 'turn', quick: true };
    case 'bank': return { icon: '💰', cap: `${N(e.p)} banked ${S.cards[e.card].value}M`, sub: esc(cname(e.card)) + ' goes to the bank', cards: [e.card], from: [e.p, 'hand'], to: [e.p, 'bank'], quick: e.p === viewer };
    case 'prop': { const c = S.cards[e.card]; return { icon: '🏡', cap: `${N(e.p)} played ${esc(cname(e.card))}`, sub: `Added to ${POS(e.p)} ${esc(SETS[e.color].label)} set` + (c.kind === 'wild' ? ` (wild used as ${esc(SETS[e.color].label)})` : ''), cards: [e.card], from: [e.p, 'hand'], to: [e.p, 'sets'], quick: e.p === viewer }; }
    case 'passgo': return { icon: '🚦', cap: `${N(e.p)} played Pass Go`, sub: `${N(e.p)} ${VB(e.p, 'draw', 'draws')} ${e.n} more`, cards: [e.card], from: [e.p, 'hand'], to: ['discard'] };
    case 'build': return { icon: ICON[S.cards[e.card].act], cap: `${N(e.p)} built a ${esc(S.cards[e.card].name)}`, sub: `On ${POS(e.p)} ${esc(SETS[e.color].label)} set: rent +${S.cards[e.card].value}M`, cards: [e.card], from: [e.p, 'hand'], to: [e.p, 'sets'] };
    case 'rent': return { icon: '🏷️', cap: `${N(e.p)} ${VB(e.p, 'charge', 'charges')} ${esc(SETS[e.color].label)} rent: ${e.amount}M`, sub: `From ${e.targets.map(N).join(' and ')}` + (e.doubles ? ` · doubled x${Math.pow(2, e.doubles)}` : ''), cards: [e.card], from: [e.p, 'hand'], to: ['discard'], tone: 'attack' };
    case 'action': {
      const t = e.targets[0];
      const M = { birthday: () => [`It's ${N(e.p) === 'You' ? 'your' : N(e.p) + "'s"} birthday!`, `Everyone pays ${N(e.p)} 2M`, [e.card]],
        debt: () => ['Debt Collector!', `${N(t)} ${VB(t, 'owe', 'owes')} ${N(e.p)} 5M`, [e.card]],
        sly: () => ['Sly Deal!', `${N(e.p)} ${VB(e.p, 'want', 'wants')} ${POS(t)} ${esc(cname(e.take))}`, [e.card, e.take]],
        forced: () => ['Forced Deal!', `${N(e.p)} ${VB(e.p, 'swap', 'swaps')} ${esc(cname(e.give))} for ${POS(t)} ${esc(cname(e.take))}`, [e.card, e.give, e.take]],
        dealbreaker: () => ['Deal Breaker!', `${N(e.p)} ${VB(e.p, 'want', 'wants')} ${POS(t)} complete ${esc(SETS[e.color].label)} set`, [e.card].concat(e.cards.slice(0, 3))] }, m = M[e.act]();
      return { icon: ICON[e.act], cap: m[0], sub: m[1], cards: m[2], from: [e.p, 'hand'], to: ['discard'], tone: 'attack' }; }
    case 'boost': return { icon: '✖️2', cap: `${N(e.p)} ${VB(e.p, 'stack', 'stacks')} Double The Rent`, sub: `Teammate's rent is now ${e.amount}M`, cards: Array(Math.min(e.n, 3)).fill(S.cards.findIndex(c => c.act === 'double')), from: [e.p, 'hand'], to: ['discard'], tone: 'attack' };
    case 'jsn': return { icon: '✋', cap: `${N(e.p)}: Just Say No!`, sub: `Blocking ${esc(e.label)}`, cards: [e.card], from: [e.p, 'hand'], to: ['discard'], tone: 'block' };
    case 'cancel': return { icon: '🛑', cap: 'Blocked!', sub: `${esc(e.label)} against ${N(e.target)} is cancelled`, cards: [], tone: 'block' };
    case 'pay': if (!e.total) return { icon: '🤷', cap: `${N(e.from)} ${VB(e.from, 'have', 'has')} nothing to pay`, sub: '', cards: [], quick: true };
      return { icon: '💸', cap: `${N(e.from)} ${VB(e.from, 'pay', 'pays')} ${N(e.to)} ${e.total}M`, sub: e.all ? 'Everything they had on the table' : e.cards.map(id => esc(cname(id))).join(', '), cards: e.cards.slice(0, 6), from: [e.from, 'bank'], to: [e.to, 'bank'], tone: 'pay' };
    case 'take': return { icon: '🦊', cap: `${N(e.to)} ${VB(e.to, 'take', 'takes')} ${POS(e.from)} ${esc(cname(e.card))}`, sub: e.give != null ? `${N(e.from)} ${VB(e.from, 'get', 'gets')} ${esc(cname(e.give))} in return` : '', cards: [e.card].concat(e.give != null ? [e.give] : []), from: [e.from, 'sets'], to: [e.to, 'sets'], tone: 'attack' };
    case 'stealset': return { icon: '💥', cap: `${N(e.to)} ${VB(e.to, 'take', 'takes')} ${POS(e.from)} ${esc(SETS[e.color].label)} set!`, sub: 'The whole set moves, buildings too', cards: e.cards.slice(0, 5), from: [e.from, 'sets'], to: [e.to, 'sets'], tone: 'attack' };
    case 'flip': return { icon: '🔁', cap: `${N(e.p)} moved a wild`, sub: `${esc(SETS[e.from].label)} → ${esc(SETS[e.color].label)}`, cards: [e.card], from: [e.p, 'sets'], to: [e.p, 'sets'], quick: true };
    case 'discard': return { icon: '🗑️', cap: `${N(e.p)} discarded ${e.n}`, sub: 'Hands are limited to 7 cards', cards: Array(Math.min(e.n, 4)).fill('back'), from: [e.p, 'hand'], to: ['discard'], quick: true };
    case 'win': return { icon: '🏆', cap: S.teams ? `${esc(E.TEAM_NAMES[e.team])} wins!` : `${N(e.p)} ${VB(e.p, 'win', 'wins')}!`, sub: '', cards: [] };
  }
  return { cap: '', cards: [] };
}
function anchorEl(a) {
  if (!a) return null;
  if (a[0] === 'deck') return $('deckPile'); if (a[0] === 'discard') return $('discardPile');
  if (a[0] === viewer) return a[1] === 'bank' ? $('myBank') : a[1] === 'sets' ? $('myPiles') : $('hand');
  return document.querySelector(`.opp[data-p="${a[0]}"]`);
}
function centerOf(el) { const r = (el || $('game')).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
function wait(ms) { return new Promise(res => { const t = setTimeout(() => { skipStep = null; res(); }, ms); skipStep = () => { clearTimeout(t); skipStep = null; res(); }; }); }
async function playEvents(evs) {
  const st = $('stage');
  for (const e of evs) {
    if (skipAll) break;
    if (e.k === 'win') continue;
    await showEvent(e);
  }
  st.classList.add('hidden'); st.className = 'hidden'; skipAll = false;
}
async function showEvent(e) {
  const v = eventView(e), base = SPEEDS[speed], dur = v.quick ? base * 0.6 : base;
  const st = $('stage');
  st.className = 'tone-' + (v.tone || 'plain');
  $('stageCap').innerHTML = `<span class="sicon">${v.icon || ''}</span> ${v.cap}`;
  $('stageSub').innerHTML = v.sub || '';
  $('stageCards').innerHTML = v.cards.map(id => cardHTML(id, 'lg')).join('');
  st.classList.remove('hidden');
  const cards = [...$('stageCards').children];
  const src = centerOf(anchorEl(v.from)), fly = Math.min(420, base * 0.3);
  cards.forEach((c, i) => { const r = c.getBoundingClientRect(); const dx = src.x - (r.left + r.width / 2), dy = src.y - (r.top + r.height / 2);
    c.animate([{ transform: `translate(${dx}px,${dy}px) scale(.25)`, opacity: .3 }, { transform: 'none', opacity: 1 }], { duration: fly, delay: i * 60, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }); });
  highlight(v.from, true); highlight(v.to, true);
  await wait(dur);
  if (v.to && cards.length && !skipAll) {
    const dst = centerOf(anchorEl(v.to)), out = Math.min(320, base * 0.25);
    const anims = cards.map((c, i) => { const r = c.getBoundingClientRect(); const dx = dst.x - (r.left + r.width / 2), dy = dst.y - (r.top + r.height / 2);
      return c.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(.2)`, opacity: 0.1 }], { duration: out, delay: i * 40, easing: 'ease-in', fill: 'forwards' }); });
    await Promise.race([Promise.all(anims.map(a => a.finished.catch(() => {}))), wait(out + 200)]);
  }
  highlight(v.from, false); highlight(v.to, false);
}
function highlight(a, on) { const x = anchorEl(a); if (x) x.classList.toggle('glow', on); }

// ---------- modal helpers ----------
function openModal(build) { const sh = $('sheet'); sh.innerHTML = ''; clearInterval(jsnTimer); build(sh); $('modal').classList.remove('hidden'); }
function closeModal() { clearInterval(jsnTimer); $('modal').classList.add('hidden'); }
function el(tag, html, cls) { const e = document.createElement(tag); if (html != null) e.innerHTML = html; if (cls) e.className = cls; return e; }
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.add('hidden'), 2600); }
function closeBtn(label) { const b = el('button', label || 'Close', 'ghost big'); b.onclick = closeModal; return b; }
function showCardInfo(id, note) {
  openModal(sh => { sh.appendChild(el('div', cardHTML(id, 'lg'), 'bigcard')); if (note) sh.appendChild(el('p', note, 'center')); sh.appendChild(closeBtn()); });
}
function showPlayer(i) {
  const p = S.players[i];
  openModal(sh => {
    sh.appendChild(el('h2', avatar(p) + ' ' + esc(p.name)));
    sh.appendChild(el('p', `Hand ${p.hand.length} cards · Bank ${E.bankValue(S, p)}M · Sets ${progressText(p)}`));
    sh.appendChild(el('div', p.bank.map(id => cardHTML(id, 'xs')).join('') || '<span class="none">Empty bank</span>', 'bankcards'));
    sh.appendChild(el('div', p.piles.map(pl => pileHTML(pl, false)).join('') || '<p>No properties yet.</p>', 'mypiles'));
    sh.appendChild(closeBtn());
  });
}

// ---------- playing a card ----------
const FIELDS = ['t', 'color', 'target', 'pile', 'take', 'give', 'nd'];
function sameCard(a, b) { if (a === b) return true; const x = S.cards[a], y = S.cards[b]; return x.kind !== 'prop' && x.kind === y.kind && x.act === y.act && x.value === y.value && x.name === y.name; }
function rentReason(c) { if (c.any) return "You don't own any properties yet"; return `You don't own any ${SETS[c.colors[0]].label} or ${SETS[c.colors[1]].label} property yet`; }
const ACT_REASON = { sly: 'Nothing to steal - only properties outside complete sets can be taken', forced: 'You both need a property that is not part of a complete set', dealbreaker: 'No opponent has a complete set yet', house: 'Needs one of your complete sets (not Expressway or Utility) without a House', hotel: 'Needs one of your complete sets that already has a House', debt: 'No one to charge', birthday: 'No one to charge' };
function handTap(id, myTurn) {
  const c = S.cards[id];
  const legal = myTurn ? E.legalActions(S).filter(a => a.card != null && a.t !== 'move' && sameCard(a.card, id)).map(a => Object.assign({}, a, { card: id, nd: a.doubles ? a.doubles.length : undefined })) : [];
  const g = t => legal.filter(a => a.t === t);
  const opts = [];
  const bank = () => opts.push({ label: `💰 Bank it as ${c.value}M`, sub: 'Money in the bank pays debts and rent', acts: g('bank') });
  if (c.kind === 'money') bank();
  if (c.kind === 'prop') opts.push({ label: '🏡 Play as property', sub: `Adds to your ${SETS[c.color].label} set`, acts: g('prop') });
  if (c.kind === 'wild') opts.push({ label: '🏡 Play as property', sub: c.any ? 'Choose any color' : `Choose ${SETS[c.colors[0]].label} or ${SETS[c.colors[1]].label}`, acts: g('prop') });
  if (c.kind === 'rent') { opts.push({ label: '🏷️ Charge rent', sub: c.any ? 'Pick one of your sets and one player' : 'Every opponent pays', acts: g('rent'), reason: rentReason(c) }); bank(); }
  if (c.kind === 'action') {
    if (c.act === 'double') { const canRent = myTurn && S.plays < 2 && S.players[viewer].hand.some(x => S.cards[x].kind === 'rent' && E.legalActions(S).some(a => a.t === 'rent' && sameCard(a.card, x))); opts.push({ label: '✖️2 Double a rent', sub: '', acts: [], reason: canRent ? 'Tap your Rent card - you can add this there' : 'Needs a Rent card you can play and 2 plays left' }); }
    else if (c.act === 'jsn') opts.push({ label: '✋ Keep for defense', acts: [], reason: "You'll be asked automatically when someone targets you" + (S.teams ? ' or your teammate' : '') });
    else opts.push({ label: `${ICON[c.act]} Use ${c.name}`, sub: SHORT[c.act], acts: g(c.act), reason: ACT_REASON[c.act] });
    bank();
  }
  openModal(sh => {
    sh.appendChild(el('div', cardHTML(id, 'lg'), 'bigcard'));
    if (!myTurn) sh.appendChild(el('p', 'You can play this on your turn.', 'center'));
    else if (S.plays >= 3) sh.appendChild(el('p', 'No plays left this turn - tap <b>End turn</b>.', 'center'));
    const box = el('div', null, 'opts');
    opts.forEach(o => {
      const ok = o.acts.length > 0;
      const why = !myTurn ? 'Wait for your turn' : S.plays >= 3 ? 'No plays left' : (o.reason || '');
      const b = el('button', `<span class="ol">${o.label}</span><small>${ok ? (o.sub || '') : esc(why)}</small>`, ok ? 'opt' : 'opt off');
      b.disabled = !ok; if (ok) b.onclick = () => wizard(id, o.acts, {}); box.appendChild(b);
    });
    sh.appendChild(box); sh.appendChild(closeBtn('Cancel'));
  });
}
function targetLabel(v) { if (v === 'all') return '👥 Every opponent'; const p = S.players[v]; return `${avatar(p)} ${esc(p.name)} <small>💰 ${E.bankValue(S, p)}M bank · ${E.tableValue(S, p)}M on table</small>`; }
function fieldLabel(f, v, a, id) {
  const me = S.players[viewer];
  switch (f) {
    case 't': return v;
    case 'color': return sw(v) + esc(SETS[v].label) + (a.t === 'rent' ? ` <small>rent ${E.rentFor(S, me, v)}M</small>` : ` <small>${(me.piles.find(p => p.color === v) || { cards: [] }).cards.length}/${SETS[v].size} owned</small>`);
    case 'target': return targetLabel(v);
    case 'pile': { const owner = a.t === 'dealbreaker' ? S.players[a.target] : me; const pl = owner.piles.find(x => x.id === v); return `<span class="optcards">${pl.cards.map(x => cardHTML(x, 'xs')).join('')}</span>${esc(SETS[pl.color].label)} set`; }
    case 'take': { const pl = E.findPile(S.players[a.target], v); return `<span class="optcards">${cardHTML(v, 'xs')}</span>Take ${esc(cname(v))} <small>${esc(SETS[pl.color].label)}</small>`; }
    case 'give': { const pl = E.findPile(me, v); return `<span class="optcards">${cardHTML(v, 'xs')}</span>Give ${esc(cname(v))} <small>${esc(SETS[pl.color].label)}</small>`; }
    case 'nd': return v === 0 ? 'No, normal rent' : `Add ${v} Double The Rent <small>x${Math.pow(2, v)} · uses ${v} more play${v > 1 ? 's' : ''}</small>`;
  }
}
const QUESTIONS = { color: 'Which set?', target: 'Who do you target?', pile: 'Which set?', take: 'Which property do you take?', give: 'Which of yours do you give?', nd: 'Double the rent?' };
function describeAction(a) {
  const me = S.players[viewer], tn = t => t === 'all' ? 'every opponent' : esc(S.players[t].name);
  switch (a.t) {
    case 'rent': return `Charge ${esc(SETS[a.color].label)} rent: <b>${E.rentFor(S, me, a.color) * Math.pow(2, a.nd || 0)}M</b> from ${tn(a.target)}`;
    case 'debt': return `<b>${tn(a.target)}</b> pays you 5M`;
    case 'birthday': return 'Every opponent pays you 2M';
    case 'sly': return `Take <b>${esc(cname(a.take))}</b> from ${tn(a.target)}`;
    case 'forced': return `Give your <b>${esc(cname(a.give))}</b>, take ${tn(a.target)}'s <b>${esc(cname(a.take))}</b>`;
    case 'dealbreaker': { const pl = S.players[a.target].piles.find(x => x.id === a.pile); return `Take ${tn(a.target)}'s complete <b>${esc(SETS[pl.color].label)}</b> set`; }
    case 'house': case 'hotel': { const pl = me.piles.find(x => x.id === a.pile); return `Build on your ${esc(SETS[pl.color].label)} set`; }
    case 'passgo': return 'Draw 2 more cards';
  }
  return '';
}
function wizard(id, opts, chosen) {
  for (const f of FIELDS) {
    if (f === 't') continue;
    const vals = [...new Set(opts.map(a => a[f]).filter(v => v !== undefined))];
    if (vals.length > 1 && !(f in chosen)) {
      return openModal(sh => {
        sh.appendChild(el('div', cardHTML(id, 'md'), 'bigcard'));
        sh.appendChild(el('h2', QUESTIONS[f]));
        const box = el('div', null, 'opts');
        vals.forEach(v => { const b = el('button', fieldLabel(f, v, opts.find(a => a[f] === v), id), 'opt'); b.onclick = () => wizard(id, opts.filter(a => a[f] === v), Object.assign({}, chosen, { [f]: v })); box.appendChild(b); });
        sh.appendChild(box);
        const back = el('button', 'Back', 'ghost big'); back.onclick = () => handTap(id, true); sh.appendChild(back);
      });
    }
  }
  const a = Object.assign({}, opts[0]);
  const fire = () => { const nd = a.nd; delete a.nd; if (a.t === 'rent') a.doubles = S.players[viewer].hand.filter(x => S.cards[x].act === 'double').slice(0, nd); closeModal(); act(a); };
  if (a.t === 'bank' || a.t === 'prop' || a.t === 'passgo') return fire();
  openModal(sh => {
    sh.appendChild(el('div', cardHTML(id, 'md'), 'bigcard'));
    sh.appendChild(el('h2', 'Confirm'));
    sh.appendChild(el('p', describeAction(a), 'confirmtxt'));
    const ok = el('button', '✅ Play it', 'primary big'); ok.onclick = fire;
    const back = el('button', 'Back', 'ghost big'); back.onclick = () => handTap(id, true);
    sh.append(ok, back);
  });
}
function flipWild(id) {
  const c = S.cards[id], pl = E.findPile(S.players[viewer], id);
  openModal(sh => {
    sh.appendChild(el('div', cardHTML(id, 'md'), 'bigcard'));
    sh.appendChild(el('h2', 'Move this wild to…')); sh.appendChild(el('p', 'Moving a wild is free - it does not use a play.'));
    const box = el('div', null, 'opts');
    c.colors.filter(x => x !== pl.color).forEach(col => { const b = el('button', sw(col) + esc(SETS[col].label), 'opt'); b.onclick = () => { closeModal(); act({ t: 'move', card: id, color: col }); }; box.appendChild(b); });
    sh.appendChild(box); sh.appendChild(closeBtn('Cancel'));
  });
}

// ---------- prompts ----------
let jsnTimer = null;
function describePending(pd, forPartner) {
  const from = esc(S.players[pd.from].name), whom = forPartner ? esc(S.players[pd.target].name) : 'you', whose = forPartner ? esc(S.players[pd.target].name) + "'s" : 'your';
  if (pd.kind === 'pay') return `${from} wants <b>${pd.amount}M</b> from ${whom} (${esc(pd.label)}).`;
  if (pd.kind === 'sly') return `${from} wants to take ${whose} <b>${esc(cname(pd.take))}</b> (Sly Deal).`;
  if (pd.kind === 'forced') return `${from} wants to swap their ${esc(cname(pd.give))} for ${whose} <b>${esc(cname(pd.take))}</b> (Forced Deal).`;
  const pl = S.players[pd.target].piles.find(x => x.id === pd.pile); return `${from} wants ${whose} complete <b>${esc(SETS[pl.color].label)}</b> set (Deal Breaker).`;
}
function countdown(sh, secs, onEnd) {
  const bar = el('div', '<i></i><span></span>', 'countdown'); sh.appendChild(bar);
  let left = secs; const upd = () => { bar.querySelector('span').textContent = `Auto-skips in ${left}s`; bar.querySelector('i').style.width = (left / secs * 100) + '%'; };
  upd(); clearInterval(jsnTimer); jsnTimer = setInterval(() => { left--; upd(); if (left <= 0) { clearInterval(jsnTimer); onEnd(); } }, 1000);
}
function promptJSN() {
  const pd = S.pending, attacking = pd.chain % 2 === 1, forPartner = attacking ? viewer !== pd.from : viewer !== pd.target;
  const tgN = esc(S.players[pd.target].name);
  openModal(sh => {
    if (pd.card != null) sh.appendChild(el('div', cardHTML(pd.card, 'md'), 'bigcard'));
    sh.appendChild(el('h2', attacking ? '✋ Your side was told No!' : forPartner ? '🛡️ Protect your teammate?' : '⚠️ You are being targeted'));
    sh.appendChild(el('p', attacking ? `${forPartner ? esc(S.players[pd.from].name) + "'s" : 'Your'} ${esc(pd.label)} against ${tgN} was blocked. Play your Just Say No to push it through?` : describePending(pd, forPartner) + (pd.chain ? ' (Their Just Say No was countered.)' : '')));
    const box = el('div', null, 'opts');
    const y = el('button', '✋ Play Just Say No', 'primary big'); y.onclick = () => act({ t: 'jsn', use: true });
    const n = el('button', attacking ? 'Let it be cancelled' : forPartner ? "Don't use it" : 'Accept it', 'big'); n.onclick = () => act({ t: 'jsn', use: false });
    box.append(y, n); sh.appendChild(box);
    countdown(sh, 25, () => act({ t: 'jsn', use: false }));
  });
}
function promptBoost() {
  const pd = S.pending, k = E.countDoubles(S, viewer);
  openModal(sh => {
    sh.appendChild(el('div', cardHTML(S.players[viewer].hand.find(x => S.cards[x].act === 'double'), 'md'), 'bigcard'));
    sh.appendChild(el('h2', 'Stack Double The Rent?'));
    sh.appendChild(el('p', `Your teammate ${esc(S.players[pd.from].name)} is charging <b>${pd.amount}M</b> ${esc(pd.label)} to ${pd.queue.map(i => esc(S.players[i].name)).join(' and ')}. Adding yours is free - it doesn't use a play.`));
    const box = el('div', null, 'opts');
    for (let n = 1; n <= k; n++) { const b = el('button', `Add ${n} → rent becomes ${pd.amount * Math.pow(2, n)}M`, 'primary big'); b.onclick = () => act({ t: 'boost', n }); box.appendChild(b); }
    const no = el('button', 'No thanks', 'big'); no.onclick = () => act({ t: 'boost', n: 0 }); box.appendChild(no);
    sh.appendChild(box);
    countdown(sh, 25, () => act({ t: 'boost', n: 0 }));
  });
}
function promptPay() {
  const pd = S.pending, me = S.players[viewer], assets = E.payable(S, me), sel = new Set();
  const bankIds = assets.filter(id => me.bank.includes(id)), tableIds = assets.filter(id => !me.bank.includes(id));
  openModal(sh => {
    sh.appendChild(el('h2', `💸 You owe ${esc(S.players[pd.from].name)} ${pd.amount}M`));
    sh.appendChild(el('p', describePending(pd, false) + ' Tap cards to pay. No change is given; properties you hand over go onto their table.'));
    const meter = el('div', '<div class="meterbar"><i></i></div><div class="metertxt"></div>', 'meter'); sh.appendChild(meter);
    const mk = (title, ids) => { if (!ids.length) return; sh.appendChild(el('div', title, 'sec'));
      const row = el('div', ids.map(id => cardHTML(id, 'sm pickable')).join(''), 'pickrow'); sh.appendChild(row);
      row.querySelectorAll('.card').forEach(n => n.onclick = () => { const id = +n.dataset.id; sel.has(id) ? sel.delete(id) : sel.add(id); n.classList.toggle('sel', sel.has(id)); upd(); }); };
    mk(`Bank · ${E.sumVal(S, bankIds)}M`, bankIds); mk('Table (properties & buildings)', tableIds);
    const btn = el('button', 'Pay', 'primary big');
    const auto = el('button', '✨ Pick for me (least loss)', 'ghost big');
    const upd = () => { const v = E.sumVal(S, [...sel]); const ok = v >= pd.amount || sel.size === assets.length;
      meter.querySelector('i').style.width = Math.min(100, v / pd.amount * 100) + '%'; meter.classList.toggle('ok', ok);
      meter.querySelector('.metertxt').innerHTML = `Selected <b>${v}M</b> of ${pd.amount}M` + (v > pd.amount ? ` <small>(overpaying ${v - pd.amount}M)</small>` : '');
      btn.disabled = !ok; btn.textContent = ok ? `Pay ${v}M` : `Select ${pd.amount - v}M more`; };
    auto.onclick = () => { sel.clear(); AI.choosePayment(S, viewer, pd.amount).forEach(x => sel.add(x)); sh.querySelectorAll('.pickrow .card').forEach(n => n.classList.toggle('sel', sel.has(+n.dataset.id))); upd(); };
    btn.onclick = () => act({ t: 'pay', cards: [...sel] });
    sh.append(btn, auto); upd();
  });
}
function promptDiscard() {
  const me = S.players[viewer], need = me.hand.length - 7, sel = new Set();
  openModal(sh => {
    sh.appendChild(el('h2', `🗑️ Discard ${need} card${need > 1 ? 's' : ''}`));
    sh.appendChild(el('p', `You have ${me.hand.length} cards but can only keep 7 at the end of your turn. Pick ${need} to put on the discard pile.`));
    const list = el('div', me.hand.map(id => cardHTML(id, 'sm pickable')).join(''), 'pickrow wrap'); sh.appendChild(list);
    const btn = el('button', `Select ${need} card${need > 1 ? 's' : ''}`, 'primary big'); btn.disabled = true;
    list.querySelectorAll('.card').forEach(n => n.onclick = () => { const id = +n.dataset.id; if (sel.has(id)) sel.delete(id); else if (sel.size < need) sel.add(id); n.classList.toggle('sel', sel.has(id)); btn.disabled = sel.size !== need; btn.textContent = sel.size === need ? 'Discard' : `Select ${need - sel.size} more`; });
    btn.onclick = () => act({ t: 'discard', cards: [...sel] }); sh.appendChild(btn);
  });
}
function showWinner() {
  if (NET.mode !== 'client') localStorage.removeItem(SAVE);
  const w = S.winner >= 0 ? S.players[S.winner] : null;
  $('pass').classList.add('hidden');
  openModal(sh => {
    sh.appendChild(el('div', '<div class="trophy">🏆</div>'));
    if (w && S.teams) {
      const mates = S.players.filter(p => p.team === S.winnerTeam);
      sh.appendChild(el('h2', `${esc(E.TEAM_NAMES[S.winnerTeam])} wins! (${mates.map(p => esc(p.name)).join(' & ')})`, 'center'));
      sh.appendChild(el('div', mates.map(m => m.piles.filter(pl => E.pileComplete(S, pl)).map(pl => pileHTML(pl, false)).join('')).join(''), 'mypiles'));
    } else {
      sh.appendChild(el('h2', w ? `${esc(w.name)} wins!` : 'Game drawn', 'center'));
      if (w) sh.appendChild(el('div', w.piles.filter(pl => E.pileComplete(S, pl)).map(pl => pileHTML(pl, false)).join(''), 'mypiles'));
    }
    if (NET.mode === 'host') { const rm = el('button', 'Rematch with this room', 'primary big'); rm.onclick = () => { closeModal(); NET.rematch(); }; sh.appendChild(rm); }
    if (NET.mode === 'client') sh.appendChild(el('p', 'The host can start a rematch.', 'center'));
    const again = el('button', NET.mode === 'local' ? 'New game' : 'Leave room', NET.mode === 'local' ? 'primary big' : 'ghost big'); again.onclick = () => { closeModal(); NET.leave(); backToSetup(); }; sh.appendChild(again);
    const look = el('button', 'Look at the table', 'ghost big'); look.onclick = closeModal; sh.appendChild(look);
  });
}
function backToSetup() { clearTimeout(aiTimer); skipAll = true; if (skipStep) skipStep(); S = null; shown = null; playing = false; $('stage').className = 'hidden'; $('lobby').classList.add('hidden'); NET.refreshSetup(); $('game').classList.add('hidden'); $('pass').classList.add('hidden'); $('setup').classList.remove('hidden'); $('resumeBtn').classList.toggle('hidden', !localStorage.getItem(SAVE)); }

// ---------- first-game tips ----------
const TIPS = [
  ['🎯', 'Goal', 'Collect <b>3 complete property sets</b> of different colors (5 between you and your teammate in Team mode).'],
  ['🃏', 'Your turn', 'You draw 2 cards, then play up to <b>3 cards</b>. Tap any card in your hand to see what you can do with it.'],
  ['💰', 'Bank vs. properties', 'Bank money and spare action cards to pay rent and debts. Properties go on your table and never into the bank.'],
  ['👀', 'Follow the action', 'Every move shows in the middle of the screen. Tap it to skip a step; change the speed with the speed button at the top.'],
];
function maybeTips(force) {
  if (!force && (localStorage.getItem('cbd-tips') || speed === 'instant')) return;
  let i = 0;
  const show = () => openModal(sh => {
    const [ic, h, t] = TIPS[i];
    sh.appendChild(el('div', ic, 'tipicon')); sh.appendChild(el('h2', h, 'center')); sh.appendChild(el('p', t, 'center tiptxt'));
    sh.appendChild(el('div', TIPS.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join(''), 'dots'));
    const nx = el('button', i < TIPS.length - 1 ? 'Next' : "Got it - let's play", 'primary big'); nx.onclick = () => { if (++i < TIPS.length) show(); else { localStorage.setItem('cbd-tips', '1'); closeModal(); loop(); } };
    const sk = el('button', 'Skip tips', 'ghost big'); sk.onclick = () => { localStorage.setItem('cbd-tips', '1'); closeModal(); loop(); };
    sh.append(nx, sk);
  });
  show();
}

// ---------- help ----------
function buildHelp() {
  const sets = E.COLORS.map(c => { const s = SETS[c]; return `<tr><td>${sw(c)} ${esc(s.label)}</td><td>${s.places.map(esc).join(', ')}</td><td>${s.value}M</td><td>${s.rent.map((r, i) => (i + 1) + ': ' + r + 'M').join('<br>')}</td></tr>`; }).join('');
  const acts = Object.keys(E.ACTIONS).map(k => { const a = E.ACTIONS[k]; return `<tr><td><b>${esc(a.name)}</b> ×${a.count}</td><td>${a.value}M</td><td>${esc(a.text)}</td></tr>`; }).join('');
  $('helpBody').innerHTML = `
  <h3>Goal</h3><p>Be the first to own <b>three complete property sets of different colors</b>.</p>
  <h3>Your turn</h3><ul>
  <li>Draw 2 cards (draw 5 instead if your hand is empty).</li>
  <li>Play up to 3 cards: bank money or action cards, lay down properties, or play actions.</li>
  <li>End your turn. If you hold more than 7 cards, discard down to 7.</li>
  <li>Flipping a wild you already own to another color is free (your turn only).</li></ul>
  <h3>Paying</h3><ul><li>Pay from your bank and/or the properties on your table. No change is given.</li>
  <li>If you can't cover the full amount you pay everything you have. With nothing on the table you pay nothing.</li>
  <li>Properties are never banked. The Any-Set Wild has no money value and can't be used to pay.</li></ul>
  <h3>Property sets (28 property cards)</h3><table><tr><th>Set</th><th>Places</th><th>Card value</th><th>Rent by cards owned</th></tr>${sets}</table>
  <h3>Property wilds (11)</h3><p>Dark Blue/Green 4M · Green/Expressway 4M · Utility/Expressway 2M · Light Blue/Expressway 4M · Light Blue/Brown 1M · Pink/Orange 2M ×2 · Red/Yellow 3M ×2 · Any-Set Wild ×2 (no value). A complete set needs at least one card that isn't an Any-Set Wild.</p>
  <h3>Rent cards (13)</h3><p>Two-color rent (1M each, ×2 of each pair): Green/Dark Blue, Brown/Light Blue, Pink/Orange, Expressway/Utility, Red/Yellow - <b>every other player</b> pays. Wild Rent (3M, ×3) - pick any of your sets and <b>one player</b> pays. You must own a property of the color you charge for.</p>
  <h3>Action cards (34)</h3><table><tr><th>Card</th><th>Value</th><th>What it does</th></tr>${acts}</table>
  <p>Any action can be banked as money instead. Double The Rent must be played together with a Rent card and counts as a play. Houses and Hotels on a set that breaks up go to the owner's bank.</p>
  <h3>Money (20)</h3><p>1M ×6 · 2M ×5 · 3M ×3 · 4M ×3 · 5M ×2 · 10M ×1. Total deck: 106 cards.</p>
  <h3>Team mode (2 vs 2)</h3><ul>
  <li>Four players in two teams of two; by default teammates sit opposite each other (seats 1 &amp; 3 vs 2 &amp; 4).</li>
  <li>A team wins with <b>5 complete sets of different colors</b> counted across both teammates' tables (the same color complete on both counts once).</li>
  <li>Rent, Debt Collector and It's My Birthday only hit the other team. Sly Deal, Forced Deal and Deal Breaker can't target your teammate.</li>
  <li>Stack Double The Rent: play several with one Rent card on your turn (each uses a play). When your teammate charges rent, you may add your own Double The Rent cards before anyone pays - those are free.</li>
  <li>Just Say No: when anyone on your team is targeted, either teammate may block it, and either player on the attacking team may counter.</li>
  <li>Teammates keep separate hands and banks; each pays from their own table.</li></ul>
  <h3>Modes</h3><p>2-4 players. Mix human and computer seats. With more than one human, a cover screen hides each hand while the device is passed.</p>`;
}

// ---------- wiring ----------
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => $(b.dataset.close).classList.add('hidden'));
$('logBtn').onclick = () => $('logPanel').classList.toggle('hidden');
$('helpBtn').onclick = $('helpBtn0').onclick = () => { buildHelp(); $('helpPanel').classList.remove('hidden'); };
$('endBtn').onclick = () => act({ t: 'end' });
$('speedBtn').onclick = () => { const order = ['slow', 'normal', 'fast']; speed = order[(order.indexOf(speed) + 1) % 3]; localStorage.setItem('cbd-speed', speed); render(); toast('Move speed: ' + speed); };
$('stage').onclick = e => { if (e.target.id === 'skipAllBtn') { skipAll = true; } if (skipStep) skipStep(); };
$('feed').onclick = () => $('logPanel').classList.toggle('hidden');
$('menuBtn').onclick = () => openModal(sh => {
  sh.appendChild(el('h2', 'Menu'));
  const box = el('div', null, 'opts');
  const sp = el('div', ['slow', 'normal', 'fast'].map(k => `<button data-s="${k}" class="${speed === k ? 'on' : ''}">${{ slow: '🐢 Slow', normal: '▶ Normal', fast: '⏩ Fast' }[k]}</button>`).join(''), 'seg speedseg');
  sp.querySelectorAll('button').forEach(b => b.onclick = () => { speed = b.dataset.s; localStorage.setItem('cbd-speed', speed); closeModal(); loop(); });
  const tipsB = el('button', '💡 Show the quick tips again'); tipsB.onclick = () => maybeTips(true);
  const q = el('button', NET.mode === 'client' ? 'Leave online game' : NET.mode === 'host' ? 'End online game for everyone' : 'Quit to main menu (game is saved)');
  q.onclick = () => { closeModal(); if (NET.mode === 'host') { localStorage.removeItem(SAVE); NET.leave(); } else if (NET.mode === 'client') NET.leave(); else save(); backToSetup(); };
  if (NET.mode === 'host') { const inv = el('button', '📨 Room ' + NET.code + ' - share invite again'); inv.onclick = () => NET.shareInvite(); box.append(inv); }
  const r = el('button', 'Resume'); r.onclick = () => { closeModal(); loop(); };
  box.append(r, el('div', 'Move speed', 'sec'), sp, tipsB, q); sh.appendChild(box);
});
// ---------- online play: host-authoritative, relayed over public MQTT-over-WebSocket brokers (no accounts, no keys) ----------
// Every phone only makes outgoing secure WebSocket connections (wss://), so it works on cellular, hotel Wi-Fi and behind any NAT.
// The host listens on several free public brokers at once; a joining phone uses whichever one answers first.
// Messages are end-to-end encrypted with a key derived from the room code, and topics are hashed, so the brokers only see noise.
const DECK = E.buildDeck();
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CLIENT_KEY = 'cbd-online-client';
const rid = n => Array.from({ length: n }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const BROKERS = window.__cbdBrokers || [
  { name: 'shiftr', url: 'wss://public.cloud.shiftr.io', opts: { username: 'public', password: 'public' } },
  { name: 'emqx', url: 'wss://broker.emqx.io:8084/mqtt' },
  { name: 'hivemq', url: 'wss://broker.hivemq.com:8884/mqtt' },
];
const TXT = new TextEncoder(), UNTXT = new TextDecoder();
const hex = buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
async function roomCrypto(code) {
  const subtle = window.crypto && window.crypto.subtle;
  if (!subtle) return { topic: 'cbdeal/v2/p/' + code, key: null };
  const topic = 'cbdeal/v2/' + hex(await subtle.digest('SHA-256', TXT.encode('cbd-topic:' + code))).slice(0, 24);
  const base = await subtle.importKey('raw', TXT.encode('cbd-room:' + code), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey({ name: 'PBKDF2', salt: TXT.encode('city-beautiful-deal-v2'), iterations: 20000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 128 }, false, ['encrypt', 'decrypt']);
  return { topic, key };
}
async function seal(key, obj) {
  const data = TXT.encode(JSON.stringify(obj));
  if (!key) { const out = new Uint8Array(data.length + 1); out[0] = 80; out.set(data, 1); return out; }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  const out = new Uint8Array(13 + ct.length); out[0] = 69; out.set(iv, 1); out.set(ct, 13); return out;
}
async function unseal(key, buf) {
  const u = new Uint8Array(buf);
  if (u[0] === 80) return JSON.parse(UNTXT.decode(u.subarray(1)));
  if (u[0] !== 69 || !key) return null;
  return JSON.parse(UNTXT.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.subarray(1, 13) }, key, u.subarray(13))));
}
// A Relay connects to every broker, subscribes to one inbox topic, and delivers decrypted messages in order.
class Relay {
  constructor(code, inbox, onMsg, onStatus) { this.code = code; this.inbox = inbox; this.onMsg = onMsg; this.onStatus = onStatus || (() => {}); this.clients = []; this.ok = []; this.closed = false; this.q = Promise.resolve(); this.rq = Promise.resolve(); }
  async start() {
    const rc = await roomCrypto(this.code); this.topic = rc.topic; this.key = rc.key;
    if (this.closed) return;
    if (!window.mqtt) { this.onStatus('nolib'); return; }
    BROKERS.forEach((b, i) => {
      const will = this.will ? { topic: this.topic + '/h', payload: 'G:' + this.will, qos: 0, retain: false } : undefined;
      const c = window.mqtt.connect(b.url, Object.assign({ clientId: 'cbd' + rid(10).toLowerCase(), keepalive: 20, reconnectPeriod: 2500, connectTimeout: 9000, clean: true, will, protocolVersion: 4 }, b.opts || {}));
      this.clients[i] = c; this.ok[i] = false;
      c.on('connect', () => { c.subscribe(this.topic + this.inbox, { qos: 1 }, err => { this.ok[i] = !err; this.onStatus('change', i); }); });
      c.on('close', () => { if (this.ok[i]) { this.ok[i] = false; this.onStatus('change', i); } });
      c.on('offline', () => { if (this.ok[i]) { this.ok[i] = false; this.onStatus('change', i); } });
      c.on('error', () => {});
      c.on('message', (t, payload) => {
        const raw = new Uint8Array(payload);
        if (raw[0] === 71 && raw[1] === 58) { const cid = UNTXT.decode(raw.subarray(2)); this.rq = this.rq.then(() => this.onMsg({ t: 'gone' }, i, cid)); return; }
        this.rq = this.rq.then(() => unseal(this.key, raw)).then(m => { if (m && !this.closed) this.onMsg(m.m || m, i, m.f); }).catch(() => {});
      });
    });
  }
  up() { return this.ok.filter(Boolean).length; }
  send(i, sub, obj) {
    const c = this.clients[i]; if (!c || this.closed) return false;
    this.q = this.q.then(() => seal(this.key, obj)).then(p => { if (c.connected) c.publish(this.topic + sub, p, { qos: 1 }); }).catch(() => {});
    return !!this.ok[i];
  }
  wake() { this.clients.forEach(c => { try { if (!c.connected && !c.reconnecting) c.reconnect(); } catch (e) {} }); }
  end() { this.closed = true; this.clients.forEach(c => { try { c.end(true); } catch (e) {} }); this.clients = []; }
}
// A virtual connection to one remote phone (host side) or to the host (phone side).
function makeConn(relay, sub, wrap) {
  return { open: true, broker: -1, send(msg) { if (this.open && this.broker >= 0) relay.send(this.broker, sub, wrap ? wrap(msg) : msg); }, close() { this.open = false; } };
}
const NET = {
  mode: 'local', relay: null, code: null, grace: 30000, room: null, conns: {}, conn: null, seat: null, token: null, name: '', leaving: false, hb: null, lastHost: 0, retryUntil: 0, cid: null, aid: 0, pendingAct: null,
  // ----- shared -----
  status(msg, kind) {
    $('lobbyStatus').textContent = msg || ''; $('lobbyStatus').className = 'center ' + (kind === 'bad' ? 'bad' : kind === 'good' ? 'good' : 'muted');
    $('lobbyRetry').classList.toggle('hidden', kind !== 'bad');
    const pill = $('netPill'); if (pill) { pill.classList.toggle('hidden', this.mode === 'local'); pill.className = 'netpill ' + (kind || '') + (this.mode === 'local' ? ' hidden' : ''); pill.textContent = kind === 'bad' ? '⚠ Offline' : kind === 'good' ? '● Online' : '◌ Connecting'; }
  },
  leave() {
    this.leaving = true; clearInterval(this.hb); clearTimeout(this._knock); clearTimeout(this._rt);
    try { if (this.mode === 'client' && this.conn && this.conn.open) this.conn.send({ t: 'bye' }); } catch (e) {}
    const r = this.relay; if (r) setTimeout(() => r.end(), 300);
    if (this.mode === 'client') localStorage.removeItem(CLIENT_KEY);
    this.mode = 'local'; this.relay = null; this.conn = null; this.conns = {}; this.room = null; this.code = null; this.pendingAct = null;
    const pill = $('netPill'); if (pill) pill.classList.add('hidden');
  },
  refreshSetup() {
    const c = JSON.parse(localStorage.getItem(CLIENT_KEY) || 'null');
    $('rejoinBtn').classList.toggle('hidden', !c); if (c) $('rejoinBtn').textContent = 'Rejoin online game ' + c.code;
  },
  invitText() { return `Join my City Beautiful Deal game! Open the City Beautiful Deal app, tap "Join online game" and enter room code ${this.code}. Or play in your browser: https://dhpa69.github.io/city-beautiful-deal-play/#join/${this.code}`; },
  async shareInvite() {
    const text = this.invitText();
    const Share = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Share;
    try {
      if (Share) await Share.share({ title: 'City Beautiful Deal invite', text, dialogTitle: 'Invite players' });
      else if (navigator.share) await navigator.share({ title: 'City Beautiful Deal invite', text });
      else { await navigator.clipboard.writeText(text); toast('Invite copied - paste it into a message.'); }
    } catch (e) { if (!/cancel|abort/i.test(String(e && (e.message || e.name)))) { try { await navigator.clipboard.writeText(text); toast('Invite copied - paste it into a message.'); } catch (_) { toast('Room code: ' + this.code); } } }
  },
  showLobby() { $('setup').classList.add('hidden'); $('game').classList.add('hidden'); $('lobby').classList.remove('hidden'); this.renderLobby(); },
  renderLobby(seats, total) {
    const host = this.mode === 'host';
    if (host) { seats = this.room.seats; total = this.room.total; }
    $('lobbyCode').textContent = this.code || '…';
    $('lobbyCount').classList.toggle('hidden', !host);
    $('lobbyCount').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.n === total));
    $('lobbyStart').classList.toggle('hidden', !host);
    $('lobbyWait').classList.toggle('hidden', host);
    const teams = host ? this.room.teams : this._teams;
    $('lobbyTeams').classList.toggle('hidden', !host); $('lobbyTeams').querySelectorAll('button').forEach(b => b.classList.toggle('on', (b.dataset.t === '1') === !!teams));
    $('lobbySeats').innerHTML = (seats || []).slice(0, total).map((s, i) => `<div class="lseat" data-i="${i}">${teams ? `<button class="tbtn" data-i="${i}" style="background:${TEAM_HEX[s.team || 0]}">${E.TEAM_NAMES[s.team || 0].replace('Team ', '')}</button>` : ''}<span class="dot ${s.kind === 'open' ? 'open' : s.kind === 'remote' && !s.connected ? 'off' : 'on'}"></span><b>${esc(s.kind === 'open' ? 'Open seat' : s.name)}</b><span>${s.kind === 'host' ? 'Host' : s.kind === 'remote' ? (s.connected ? 'Joined' : 'Reconnecting…') : s.kind === 'ai' ? 'Computer' : 'Computer fills this if nobody joins'}${this.mode === 'client' && i === this.seat ? ' · you' : ''}</span></div>`).join('') + (teams ? `<p class="center muted" style="font-size:12px">${host ? 'Tap a team badge to switch a seat. ' : ''}Team mode: 2 vs 2, a team needs 5 sets.</p>` : '');
    if (host && teams) $('lobbySeats').querySelectorAll('.tbtn').forEach(b => b.onclick = () => { const s = this.room.seats[+b.dataset.i]; s.team = (s.team || 0) ? 0 : 1; this.broadcastLobby(); });
  },
  retry() { if (this.mode === 'host' && this.room) { const r = this.room, code = this.code; this.relay && this.relay.end(); this.relay = null; this.openRelay(code, true); } else if (this.mode === 'client' || localStorage.getItem(CLIENT_KEY)) { const c = JSON.parse(localStorage.getItem(CLIENT_KEY) || 'null'); if (c) this.join(c.code, c.name); } },
  // ----- host -----
  host(name, total) {
    this.leave(); this.leaving = false; this.mode = 'host'; this.name = name;
    this.room = { total, teams: false, seats: [{ kind: 'host', name, connected: true, team: 0 }].concat([1, 2, 3].map(i => ({ kind: 'open', name: '', team: i % 2 }))), started: false };
    this.code = rid(5); this.showLobby(); this.openRelay(this.code, false);
  },
  roomSave() { return { code: this.code, total: this.room.total, teams: this.room.teams, seats: this.room.seats.map(s => ({ kind: s.kind, name: s.name, token: s.token, team: s.team })), started: this.room.started }; },
  resumeHost(r) {
    this.leave(); this.leaving = false; this.mode = 'host'; this.room = { total: r.total, teams: r.teams, seats: r.seats.map(s => Object.assign({}, s, { connected: s.kind === 'host' })), started: true };
    S.players.forEach(p => { if (p.remote) p.away = p.away || Date.now(); });
    this.code = r.code; this.openRelay(r.code, true); showGame();
  },
  openRelay(code, resuming) {
    this.status('Opening room…'); this.conns = {}; this.hs = rid(6);
    const started = Date.now(); let announced = false;
    const relay = new Relay(code, '/h', (msg, bi, cid) => this.onRelayHost(msg, bi, cid), () => {
      if (this.relay !== relay) return;
      const up = relay.up();
      if (up) { this.status(`Room open (${up} of ${BROKERS.length} relays). Share the invite, then tap Start.`, 'good'); if (!announced) { announced = true; if (resuming) toast('Room ' + code + ' reopened - players can rejoin.'); } }
      else this.status(Date.now() - started > 9000 ? "Can't reach the online service. Check your internet connection, then tap Retry." : 'Opening room…', Date.now() - started > 9000 ? 'bad' : '');
    });
    this.relay = relay; relay.start();
    clearTimeout(this._chk); this._chk = setTimeout(() => { if (this.relay === relay && !relay.up()) this.status("Can't reach the online service. Check your internet connection, then tap Retry.", 'bad'); }, 10000);
    this.startHeartbeat();
  },
  onRelayHost(msg, bi, cid) {
    if (!cid || typeof cid !== 'string' || cid.length > 40) return;
    let conn = this.conns[cid];
    if (msg.t === 'gone') { if (conn && conn.broker === bi) { conn.close(); this.dropConn(conn); delete this.conns[cid]; } return; }
    if (!conn || !conn.open) { conn = makeConn(this.relay, '/c/' + cid); conn.cid = cid; this.conns[cid] = conn; }
    conn.broker = bi; // reply on whichever relay this phone used last
    if (msg.t === 'knock') return conn.send({ t: 'here', code: this.code });
    this.onHostMsg(conn, msg);
  },
  seatOfConn(conn) { return this.room.seats.findIndex(s => s.conn === conn); },
  dropConn(conn) {
    const i = this.seatOfConn(conn); if (i < 0) return;
    const s = this.room.seats[i]; s.conn = null; s.connected = false;
    if (!this.room.started) { this.room.seats[i] = { kind: 'open', name: '', team: s.team }; this.broadcastLobby(); return; }
    if (S && S.players[i] && S.players[i].remote) { S.players[i].away = Date.now(); log2(S.players[i].name + ' disconnected. The computer plays for them after ' + Math.round(this.grace / 1000) + 's until they rejoin.'); loop(); }
  },
  onHostMsg(conn, msg) {
    if (!msg || typeof msg !== 'object') return;
    const room = this.room; if (!room) return; let i = this.seatOfConn(conn);
    if (i >= 0) room.seats[i].lastSeen = Date.now();
    if (msg.t === 'hello') {
      const token = String(msg.token || '').slice(0, 40), name = String(msg.name || 'Player').trim().slice(0, 16) || 'Player';
      i = room.seats.findIndex(s => s.kind === 'remote' && s.token === token);
      if (i < 0) {
        if (room.started) return conn.send({ t: 'fatal', msg: 'That game has already started.' });
        i = room.seats.findIndex((s, k) => k < room.total && s.kind === 'open');
        if (i < 0) return conn.send({ t: 'fatal', msg: 'That room is full.' });
        room.seats[i] = { kind: 'remote', name, token, team: room.seats[i].team, lastAid: 0 };
      }
      const s = room.seats[i]; if (s.conn && s.conn !== conn) { s.conn.close(); }
      s.conn = conn; s.connected = true; s.lastSeen = Date.now();
      conn.send({ t: 'welcome', seat: i, code: this.code, lastAid: s.lastAid || 0 });
      if (room.started && S) { if (S.players[i].away) { S.players[i].away = null; log2(S.players[i].name + ' is back.'); } this.sendState(i); loop(); }
      else this.broadcastLobby();
      return;
    }
    if (i < 0) { if (msg.t !== 'bye') conn.send({ t: 'who' }); return; } // unknown phone (e.g. host page reloaded): ask it to say hello again
    if (msg.t === 'act') {
      const s = room.seats[i];
      if (msg.aid && msg.aid <= (s.lastAid || 0)) return this.sendState(i); // duplicate resend - already applied
      if (!S || S.winner != null || E.actorNow(S) !== i) { conn.send({ t: 'error', msg: 'Not your move right now.', aid: msg.aid }); s.lastAid = msg.aid || s.lastAid; return this.sendState(i); }
      if (!playing) shown = snapshot();
      try { E.apply(S, msg.a); s.lastAid = msg.aid || s.lastAid; } catch (e) { shown = null; s.lastAid = msg.aid || s.lastAid; conn.send({ t: 'error', msg: e.message, aid: msg.aid }); return this.sendState(i); }
      loop();
    } else if (msg.t === 'pong') { if (room.started && S && (msg.hs !== this.hs || msg.ver < this.ver)) this.sendState(i); }
    else if (msg.t === 'sync') { if (room.started && S) this.sendState(i); else this.broadcastLobby(); }
    else if (msg.t === 'bye') { conn.close(); this.dropConn(conn); delete this.conns[conn.cid]; }
  },
  setTeams(on) { if (on && this.room.seats.filter(s => s.kind !== 'open').length > 4) return; this.room.teams = on; if (on) this.room.total = 4; this.broadcastLobby(); },
  setTotal(n) { if (this.room.teams && n !== 4) return toast('Team mode is 4 players (2 vs 2).'); const joined = this.room.seats.filter(s => s.kind !== 'open').length; if (n < joined) return toast('Already ' + joined + ' players joined.'); this.room.total = n; this.broadcastLobby(); },
  broadcastLobby() {
    this.renderLobby();
    const seats = this.room.seats.map(s => ({ kind: s.kind, name: s.name, connected: !!s.connected, team: s.team }));
    this.room.seats.forEach((s, i) => { if (s.conn && s.conn.open) s.conn.send({ t: 'lobby', seats, total: this.room.total, seat: i, teams: this.room.teams }); });
  },
  start() {
    const room = this.room; room.started = true;
    room.seats.forEach((s, i) => { if (i < room.total && s.kind === 'open') { s.kind = 'ai'; s.name = ['Lake Eola Lou', 'Citrus Sam', 'Gator Gail'][i - 1] || ('Computer ' + i); } });
    const players = room.seats.slice(0, room.total).map(s => ({ name: s.name, ai: s.kind === 'ai' }));
    let teams; if (room.teams) { teams = room.seats.slice(0, 4).map(s => s.team || 0); if (teams.filter(x => x === 0).length !== 2) { room.started = false; room.seats.forEach(s => { if (s.kind === 'ai') { s.kind = 'open'; s.name = ''; } }); this.broadcastLobby(); return toast('Each team needs exactly 2 seats.'); } }
    S = E.newGame({ players, teams });
    S.players.forEach((p, i) => { if (room.seats[i].kind === 'remote') { p.remote = true; if (!room.seats[i].connected) p.away = Date.now(); } });
    viewer = 0; $('lobby').classList.add('hidden'); showGame();
  },
  rematch() {
    const old = S.players; S = E.newGame({ players: old.map(p => ({ name: p.name, ai: p.ai })), teams: S.teams, first: (S.winner >= 0 ? S.winner : 0) });
    S.players.forEach((p, i) => { p.remote = !!old[i].remote; p.away = old[i].away || null; });
    loop();
  },
  viewFor(seat) {
    const v = Object.assign({}, S); delete v.cards; v.rs = 0; v.deck = S.deck.map(() => -1); v.log = S.log.slice(-60);
    v.players = S.players.map(p => p.id === seat ? p : Object.assign({}, p, { hand: p.hand.map(() => -1) }));
    return v;
  },
  sendState(i) { const s = this.room.seats[i]; if (s && s.conn && s.conn.open) s.conn.send({ t: 'state', seat: i, ver: this.ver, hs: this.hs, lastAid: s.lastAid || 0, S: this.viewFor(i) }); },
  ver: 0,
  broadcastState() { if (!this.room) return; this.ver++; this.room.seats.forEach((s, i) => { if (s.kind === 'remote') this.sendState(i); }); },
  startHeartbeat() {
    clearInterval(this.hb);
    this.hb = setInterval(() => {
      if (this.mode === 'host' && this.room) this.room.seats.forEach(s => { if (s.conn) { if (s.conn.open) s.conn.send({ t: 'ping' }); if (Date.now() - (s.lastSeen || 0) > 25000) { const c = s.conn; c.close(); this.dropConn(c); } } });
      if (this.mode === 'client') {
        if (this.conn && this.conn.open) this.conn.send({ t: 'pong', ver: this.ver, hs: this.hs });
        if (this.conn && this.conn.open && Date.now() - this.lastHost > 14000) { this.conn.open = false; this.status('Lost contact with the host - reconnecting…', ''); if (S) toast('Reconnecting to host…'); this.knock(); }
        if (this.pendingAct && Date.now() - this.pendingAct.at > 5000 && this.conn && this.conn.open) { this.pendingAct.at = Date.now(); this.conn.send(this.pendingAct.msg); }
      }
    }, 3000);
  },
  // ----- client -----
  send(msg) {
    if (msg.t === 'act') { msg.aid = ++this.aid; this.pendingAct = { msg, at: Date.now() }; }
    if (this.conn && this.conn.open) this.conn.send(msg); else { toast('Not connected - reconnecting…'); this.knock(); }
  },
  join(code, name) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (code.length < 4) return toast('Enter the room code from the invite.');
    this.leave(); this.leaving = false; this.mode = 'client'; this.code = code; this.name = name; this.everJoined = false; this.aid = 0; this.pendingAct = null;
    const saved = JSON.parse(localStorage.getItem(CLIENT_KEY) || 'null');
    this.token = saved && saved.code === code ? saved.token : rid(12);
    this.cid = rid(12).toLowerCase();
    localStorage.setItem(CLIENT_KEY, JSON.stringify({ code, token: this.token, name }));
    this.showLobby(); this.renderLobby([], 0); this.status('Connecting to room ' + code + '…');
    this.retryUntil = Date.now() + 180000; this.knockStart = Date.now();
    const relay = new Relay(code, '/c/' + this.cid, (msg, bi) => this.onRelayClient(msg, bi), () => { if (this.relay !== relay || !relay.up()) return; if (!this.conn || !this.conn.open) this.knock(true); else this.conn.send({ t: 'sync' }); });
    relay.will = this.cid; this.relay = relay;
    this.conn = makeConn(relay, '/h', m => ({ f: this.cid, m })); this.conn.open = false;
    relay.start();
    this.startHeartbeat(); this.knock();
  },
  knock(now) {
    if (this.leaving || this.mode !== 'client' || !this.relay) return;
    clearTimeout(this._knock);
    if (this.conn && this.conn.open) return;
    const relay = this.relay, waited = Date.now() - this.knockStart;
    if (Date.now() > this.retryUntil) { this.status('Lost the host. Ask them to keep the game open, then tap Retry.', 'bad'); if (S) toast('Disconnected from host.'); return; }
    if (relay.up()) relay.ok.forEach((ok, i) => { if (ok) relay.send(i, '/h', { f: this.cid, m: { t: 'knock' } }); });
    if (!this.everJoined && !S) {
      if (!relay.up() && waited > 9000) this.status("Can't reach the online service. Check your internet connection, then tap Retry.", 'bad');
      else if (relay.up() && waited > 9000) this.status(`No open room ${this.code} found yet. Check the code - the host must keep the game open. Still trying…`, 'bad');
    }
    this._knock = setTimeout(() => this.knock(), now ? 1500 : 2500);
  },
  onRelayClient(msg, bi) {
    if (this.leaving || this.mode !== 'client') return;
    this.lastHost = Date.now(); this.retryUntil = Date.now() + 180000;
    if (msg.t === 'here' || msg.t === 'who') {
      if (this.conn.open && msg.t === 'here') return; // already talking to the host on another relay
      this.conn.broker = bi; this.conn.open = true; clearTimeout(this._knock);
      this.conn.send({ t: 'hello', name: this.name, token: this.token });
      if (this.everJoined) this.status('Reconnected.', 'good');
      return;
    }
    if (!this.conn.open) { this.conn.open = true; this.conn.broker = bi; }
    this.onClientMsg(msg);
  },
  onClientMsg(msg) {
    if (!msg) return;
    switch (msg.t) {
      case 'welcome': this.seat = msg.seat; this.everJoined = true; if (msg.lastAid > this.aid) this.aid = msg.lastAid; this.status(S ? 'Connected.' : 'Joined! Waiting for the host to start.', 'good'); if (this.pendingAct && this.pendingAct.msg.aid > (msg.lastAid || 0)) this.conn.send(this.pendingAct.msg); else this.pendingAct = null; if (S) this.conn.send({ t: 'sync' }); break;
      case 'lobby': this.seat = msg.seat; this._teams = !!msg.teams; if (!S) { this.showLobby(); this.renderLobby(msg.seats, msg.total); } break;
      case 'state': { if (this.pendingAct && (msg.lastAid || 0) >= this.pendingAct.msg.aid) this.pendingAct = null; if (msg.lastAid > this.aid) this.aid = msg.lastAid;
        if (S && msg.hs === this.hs && msg.ver < this.ver) break; this.hs = msg.hs;
        this.seat = msg.seat; this.ver = msg.ver; const prev = S; if (!playing && prev) shown = prev; S = msg.S; S.cards = DECK; viewer = msg.seat; if (!prev) lastSeq = S.evSeq || 0;
        if ($('game').classList.contains('hidden')) { $('lobby').classList.add('hidden'); $('setup').classList.add('hidden'); $('game').classList.remove('hidden'); }
        loop(); break; }
      case 'error': if (this.pendingAct && msg.aid === this.pendingAct.msg.aid) this.pendingAct = null; toast(msg.msg); break;
      case 'fatal': toast(msg.msg); localStorage.removeItem(CLIENT_KEY); this.leave(); backToSetup(); break;
    }
  },
};
// Phones suspend sockets in the background (e.g. while the host shares the invite); reconnect as soon as the app is visible again.
document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible' || !NET.relay) return; NET.relay.wake(); if (NET.mode === 'client') { if (NET.conn && NET.conn.open) NET.conn.send({ t: 'sync' }); else NET.knock(true); } });
window.addEventListener('online', () => { if (NET.relay) NET.relay.wake(); });
function log2(m) { if (S) { S.log.push(m); } toast(m); }
function setupOnline() {
  const nm = () => (setup.seats[0] && setup.seats[0].name || '').trim() || 'Player';
  $('hostBtn').onclick = () => openModal(sh => {
    sh.appendChild(el('h2', 'Host an online game'));
    sh.appendChild(el('p', 'You get a room code to send to friends. Computer players fill any empty seats when you start.'));
    const saved = JSON.parse(localStorage.getItem(CLIENT_KEY) || 'null');
    sh.appendChild(el('div', `<input id="hName" class="txt" maxlength="16" placeholder="Your name" value="${esc(nm() === 'You' ? ((saved && saved.name) || '') : nm())}">`, 'jform'));
    const go = el('button', 'Open room', 'primary big'); go.onclick = () => { const n = ($('hName').value.trim() || 'Host').slice(0, 16); closeModal(); NET.host(n, 4); };
    const x = el('button', 'Cancel', 'ghost big'); x.onclick = closeModal; sh.append(go, x);
  });
  $('joinBtn').onclick = () => openJoin('');
  $('rejoinBtn').onclick = () => { const c = JSON.parse(localStorage.getItem(CLIENT_KEY) || 'null'); if (c) NET.join(c.code, c.name); };
  $('lobbyCount').querySelectorAll('button').forEach(b => b.onclick = () => NET.setTotal(+b.dataset.n));
  $('lobbyTeams').querySelectorAll('button').forEach(b => b.onclick = () => NET.setTeams(b.dataset.t === '1'));
  $('lobbyStart').onclick = () => NET.start();
  $('lobbyInvite').onclick = () => NET.shareInvite();
  $('lobbyLeave').onclick = () => { NET.leave(); backToSetup(); };
  $('lobbyRetry').onclick = () => NET.retry();
  NET.refreshSetup();
  // deep link: citybeautiful://join/CODE
  const handleUrl = url => { const m = /join[\/=]([A-Za-z0-9]{4,8})/.exec(url || ''); if (m) openJoin(m[1].toUpperCase()); };
  const App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  if (App) { App.addListener('appUrlOpen', e => handleUrl(e.url)); App.getLaunchUrl && App.getLaunchUrl().then(r => r && handleUrl(r.url)).catch(() => {}); }
  handleUrl(location.hash);
}
function openJoin(code) {
  const c = JSON.parse(localStorage.getItem(CLIENT_KEY) || 'null');
  openModal(sh => {
    sh.appendChild(el('h2', 'Join an online game'));
    sh.appendChild(el('p', 'Enter the room code from the invite. The host needs the app open.'));
    const f = el('div', `<input id="jName" class="txt" maxlength="16" placeholder="Your name" value="${esc((c && c.name) || '')}"><input id="jCode" class="txt code" maxlength="6" placeholder="ROOM CODE" autocapitalize="characters" autocomplete="off" value="${esc(code)}">`, 'jform');
    sh.appendChild(f);
    const go = el('button', 'Join', 'primary big'); go.onclick = () => { const n = $('jName').value.trim() || 'Player'; const k = $('jCode').value; closeModal(); NET.join(k, n.slice(0, 16)); };
    const x = el('button', 'Cancel', 'ghost big'); x.onclick = closeModal; sh.append(go, x);
  });
}
setupOnline();

window.__cbd = { get state() { return S; }, get viewer() { return viewer; }, get net() { return NET; }, get playing() { return playing; }, act, loop, setDelay: d => { AI_DELAY = d; if (d < 100) speed = 'instant'; }, setSpeed: s => { speed = s; }, setGrace: g => { NET.grace = g; } };
initSetup();
})();
