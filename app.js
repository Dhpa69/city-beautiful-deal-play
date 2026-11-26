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
function showGame() { $('setup').classList.add('hidden'); $('game').classList.remove('hidden'); passedTo = humans().length > 1 ? null : viewer; loop(); }
const humans = () => S.players.filter(p => !p.ai && !p.remote).map(p => p.id);
function save() { if (NET.mode === 'client') return; try { if (S.winner == null) localStorage.setItem(SAVE, JSON.stringify({ S, viewer, room: NET.mode === 'host' ? NET.roomSave() : null })); else localStorage.removeItem(SAVE); } catch (e) {} }

// ---------- main loop ----------
let passedTo = null;
function loop() {
  clearTimeout(aiTimer); closeModal();
  save(); render();
  if (NET.mode === 'host') NET.broadcastState();
  if (S.winner != null) return showWinner();
  const who = E.actorNow(S);
  if (NET.mode === 'client') { $('pass').classList.add('hidden'); if (who !== viewer) return; if (S.pending) return S.pending.stage === 'jsn' ? promptJSN() : S.pending.stage === 'boost' ? promptBoost() : promptPay(); if (S.phase === 'discard') return promptDiscard(); return; }
  const pl = S.players[who];
  if (pl.remote && !pl.ai) {
    if (!pl.away) return; // waiting for that phone
    const left = NET.grace - (Date.now() - pl.away);
    aiTimer = setTimeout(() => { if (E.actorNow(S) === who && S.players[who].away) act(AI.choose(S)); else loop(); }, Math.max(left, AI_DELAY)); return;
  }
  if (pl.ai) { aiTimer = setTimeout(() => { act(AI.choose(S)); }, S.pending ? AI_DELAY * 0.8 : AI_DELAY); return; }
  if (humans().length > 1 && passedTo !== who) return showPass(who);
  viewer = who; $('pass').classList.add('hidden'); render();
  if (S.pending) return S.pending.stage === 'jsn' ? promptJSN() : S.pending.stage === 'boost' ? promptBoost() : promptPay();
  if (S.phase === 'discard') return promptDiscard();
}
function act(a) {
  if (NET.mode === 'client') { closeModal(); NET.send({ t: 'act', a }); $('playsLeft').textContent = 'Sending…'; return; }
  try { E.apply(S, a); } catch (e) { toast(e.message); console.error(e); }
  loop();
}
function showPass(who) {
  const p = S.players[who];
  $('passTitle').textContent = 'Pass to ' + p.name;
  $('passMsg').textContent = S.pending ? (S.pending.stage === 'jsn' ? p.name + ' needs to decide on a Just Say No.' : p.name + ' needs to pay.') : (who === S.cur ? "It's " + p.name + "'s turn." : '');
  $('passBtn').textContent = "I'm " + p.name + ' - show my hand';
  $('pass').classList.remove('hidden');
  $('passBtn').onclick = () => { passedTo = who; viewer = who; loop(); };
}

// ---------- rendering ----------
function sw(color) { return `<span class="sw" style="background:${SETS[color].hex}"></span>`; }
function band(c) {
  if (c.kind === 'prop') return `<div class="band" style="background:${SETS[c.color].hex};color:${SETS[c.color].text}">${esc(SETS[c.color].label)}</div>`;
  if (c.kind === 'wild' || c.kind === 'rent') {
    const lbl = c.kind === 'rent' ? 'Rent' : 'Wild';
    if (c.any) return `<div class="band rainbow" style="color:#fff;text-shadow:0 1px 2px #000">${lbl} · any</div>`;
    const [a, b] = c.colors; return `<div class="band" style="background:linear-gradient(90deg,${SETS[a].hex} 50%,${SETS[b].hex} 50%);color:#fff;text-shadow:0 1px 2px #000">${lbl}</div>`;
  }
  if (c.kind === 'money') return `<div class="band" style="background:#5e9e3a;color:#fff">Money</div>`;
  return `<div class="band" style="background:#ffd166;color:#4a3000">Action</div>`;
}
function cardText(c) {
  if (c.kind === 'prop') return 'Rent ' + SETS[c.color].rent.join(' · ') + 'M<br>' + SETS[c.color].size + ' for a set';
  if (c.kind === 'wild') return c.any ? 'Use as any color. No money value.' : SETS[c.colors[0]].label + ' or ' + SETS[c.colors[1]].label;
  if (c.kind === 'rent') return c.any ? 'Charge one player rent for any of your sets.' : 'All players pay rent for ' + SETS[c.colors[0]].label + ' or ' + SETS[c.colors[1]].label + '.';
  if (c.kind === 'action') return E.ACTIONS[c.act].text;
  return '';
}
function cardHTML(id, cls) {
  const c = S.cards[id];
  return `<div class="card ${c.kind} ${cls || ''}" data-id="${id}">${band(c)}<div class="nm">${esc(c.kind === 'wild' ? (c.any ? 'Any-Set Wild' : 'Property Wild') : c.name)}</div><div class="tx">${cardText(c)}</div>${c.kind === 'money' ? '' : `<div class="val">${c.value}M</div>`}</div>`;
}
function miniHTML(id, color, extraCls) {
  const c = S.cards[id];
  const nm = c.kind === 'wild' ? (c.any ? 'Any-Set Wild' : 'Wild') : c.name;
  return `<div class="mini ${extraCls || ''}" data-id="${id}">${color ? sw(color) : ''}<span>${esc(nm)}</span><b style="margin-left:auto">${c.value}M</b></div>`;
}
function pileHTML(pl, mine) {
  const done = E.pileComplete(S, pl), st = SETS[pl.color];
  const canFlip = mine && S.cur === viewer && !S.pending && S.phase === 'play';
  let h = `<div class="pile ${done ? 'done' : ''}"><div class="ph">${sw(pl.color)}<span>${esc(st.label)}</span><span>${Math.min(pl.cards.length, st.size)}/${st.size}${done ? ' ✓' : ''}</span></div>`;
  pl.cards.forEach(id => { const w = S.cards[id].kind === 'wild'; h += miniHTML(id, pl.color, w && canFlip ? 'tap flip' : ''); });
  if (pl.house != null) h += `<div class="mini" data-id="${pl.house}">🏠 House <b style="margin-left:auto">3M</b></div>`;
  if (pl.hotel != null) h += `<div class="mini" data-id="${pl.hotel}">🏨 Hotel <b style="margin-left:auto">4M</b></div>`;
  return h + `<div style="font-size:11px;color:var(--muted)">Rent now: ${E.rentFor(S, { piles: [pl] }, pl.color)}M</div></div>`;
}
function render() {
  if (!S) return;
  const cur = S.players[S.cur];
  $('turnInfo').textContent = S.winner != null ? 'Game over' : `Turn ${S.turn}: ${cur.name}` + (S.pending ? ` · ${S.pending.label}` : '');
  // opponents
  $('opps').innerHTML = S.players.filter(p => p.id !== viewer).map(p => {
    const chips = p.piles.map(pl => { const st = SETS[pl.color]; const d = E.pileComplete(S, pl); return `<span class="chip ${d ? 'done' : ''}" style="background:${st.hex};color:${st.text}" title="${esc(pl.cards.map(id => S.cards[id].name).join(', '))}">${esc(st.label)} ${Math.min(pl.cards.length, st.size)}/${st.size}${pl.house != null ? ' 🏠' : ''}${pl.hotel != null ? '🏨' : ''}</span>`; }).join('');
    return `<div class="opp ${p.id === S.cur ? 'active' : ''}" data-p="${p.id}"><div class="nm"><span>${esc(p.name)}${p.ai ? ' 🤖' : ''}${p.remote && p.away ? ' 📵' : p.remote ? ' 📱' : ''}</span><span>${progLabel(p)}</span></div><div class="meta">${S.teams && p.team === S.players[viewer].team ? '<b>Teammate</b> · ' : ''}Hand ${p.hand.length} · Bank ${E.bankValue(S, p)}M</div><div class="chips">${chips || '<span style="font-size:12px;color:var(--muted)">No properties yet</span>'}</div></div>`;
  }).join('');
  $('opps').querySelectorAll('.opp').forEach(el => el.onclick = () => showPlayer(+el.dataset.p));
  // me
  const me = S.players[viewer];
  $('me').innerHTML = `<div class="mebox ${viewer === S.cur ? 'active' : ''}"><h3><span>${esc(me.name)}${/^you$/i.test(me.name) ? "" : " (you)"}</span><span>${progLabel(me)}</span></h3>
    <div class="sec">Bank · ${E.bankValue(S, me)}M</div><div class="bankrow">${me.bank.map(id => `<span class="coin">${esc(S.cards[id].kind === 'money' ? S.cards[id].name : S.cards[id].name + ' ' + S.cards[id].value + 'M')}</span>`).join('') || '<span style="font-size:12px;color:var(--muted)">Empty</span>'}</div>
    <div class="sec">Properties</div><div class="piles">${me.piles.map(pl => pileHTML(pl, true)).join('') || '<span style="font-size:12px;color:var(--muted)">None yet</span>'}</div></div>`;
  $('me').querySelectorAll('.mini.flip').forEach(el => el.onclick = () => flipWild(+el.dataset.id));
  // hand
  const myTurn = S.winner == null && viewer === S.cur && !S.pending && S.phase === 'play';
  $('handTitle').textContent = 'Your hand (' + me.hand.length + ')';
  $('playsLeft').textContent = myTurn ? `${3 - S.plays} play${3 - S.plays === 1 ? '' : 's'} left` : (S.winner != null ? '' : 'Waiting for ' + S.players[E.actorNow(S)].name + '…');
  $('endBtn').disabled = !myTurn;
  $('hand').innerHTML = me.hand.map(id => cardHTML(id, myTurn && S.plays < 3 ? '' : 'dim')).join('');
  $('hand').querySelectorAll('.card').forEach(el => el.onclick = () => { if (myTurn) handTap(+el.dataset.id); else showCardInfo(+el.dataset.id); });
  $('logList').innerHTML = S.log.slice().reverse().map(l => `<div>${esc(l)}</div>`).join('');
}

// ---------- modal helpers ----------
function openModal(build) { const sh = $('sheet'); sh.innerHTML = ''; build(sh); $('modal').classList.remove('hidden'); }
function closeModal() { $('modal').classList.add('hidden'); }
function el(tag, html, cls) { const e = document.createElement(tag); if (html != null) e.innerHTML = html; if (cls) e.className = cls; return e; }
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.add('hidden'), 2600); }
function showCardInfo(id) {
  openModal(sh => { sh.appendChild(el('div', cardHTML(id), 'pick')); sh.appendChild(el('p', cardText(S.cards[id]))); const b = el('button', 'Close', 'ghost big'); b.onclick = closeModal; sh.appendChild(b); });
}
function showPlayer(i) {
  const p = S.players[i];
  openModal(sh => {
    sh.appendChild(el('h2', esc(p.name)));
    sh.appendChild(el('p', `Hand ${p.hand.length} cards · Bank ${E.bankValue(S, p)}M (${p.bank.map(id => S.cards[id].value + 'M').join(', ') || 'empty'})`));
    sh.appendChild(el('div', p.piles.map(pl => pileHTML(pl, false)).join('') || '<p>No properties yet.</p>', 'piles'));
    const b = el('button', 'Close', 'ghost big'); b.onclick = closeModal; sh.appendChild(b);
  });
}

// ---------- playing a card (step-by-step wizard over legal actions) ----------
const FIELDS = ['t', 'color', 'target', 'pile', 'take', 'give', 'nd'];
function sameCard(a, b) { if (a === b) return true; const x = S.cards[a], y = S.cards[b]; return x.kind !== 'prop' && x.kind === y.kind && x.act === y.act && x.value === y.value && x.name === y.name; }
function handTap(id) {
  if (S.plays >= 3) { toast('No plays left - end your turn.'); return showCardInfo(id); }
  const opts = E.legalActions(S).filter(a => a.card != null && a.t !== 'move' && sameCard(a.card, id)).map(a => Object.assign({}, a, { card: id, nd: a.doubles ? a.doubles.length : undefined }));
  wizard(id, opts, {});
}
function fieldLabel(f, v, a, id) {
  const c = S.cards[id], me = S.players[viewer];
  switch (f) {
    case 't': return v === 'bank' ? `💵 Put in bank as ${c.value}M` : v === 'prop' ? '🏡 Play as property' : '▶️ Play ' + esc(c.name);
    case 'color': return sw(v) + esc(SETS[v].label) + (a.t === 'rent' ? ` - rent ${E.rentFor(S, me, v)}M` : '');
    case 'target': return v === 'all' ? 'Everyone' : esc(S.players[v].name) + ` (has ${E.tableValue(S, S.players[v])}M on table)`;
    case 'pile': { const owner = a.t === 'dealbreaker' ? S.players[a.target] : me; const pl = owner.piles.find(x => x.id === v); return sw(pl.color) + esc(SETS[pl.color].label + ': ' + pl.cards.map(x => S.cards[x].kind === 'wild' ? 'Wild' : S.cards[x].name).join(', ')); }
    case 'take': { const pl = E.findPile(S.players[a.target], v); return sw(pl.color) + 'Take ' + esc(S.cards[v].kind === 'wild' ? SETS[pl.color].label + ' Wild' : S.cards[v].name); }
    case 'give': { const pl = E.findPile(me, v); return sw(pl.color) + 'Give your ' + esc(S.cards[v].kind === 'wild' ? SETS[pl.color].label + ' Wild' : S.cards[v].name); }
    case 'nd': return v === 0 ? 'No Double The Rent' : v === 1 ? 'Add 1 Double The Rent (x2, uses a play)' : 'Add 2 Double The Rent (x4, uses 2 plays)';
  }
}
const QUESTIONS = { t: 'What do you want to do?', color: 'Which set?', target: 'Who do you target?', pile: 'Which set?', take: 'Which property do you take?', give: 'Which of yours do you give?', nd: 'Double the rent?' };
function wizard(id, opts, chosen) {
  if (!opts.length) return showCardInfo(id);
  for (const f of FIELDS) {
    const vals = [...new Set(opts.map(a => a[f]).filter(v => v !== undefined))];
    if (vals.length > 1 && !(f in chosen)) {
      return openModal(sh => {
        sh.appendChild(el('div', cardHTML(id), 'pick'));
        sh.appendChild(el('h2', QUESTIONS[f]));
        const box = el('div', null, 'opts');
        vals.forEach(v => { const b = el('button', fieldLabel(f, v, opts.find(a => a[f] === v), id)); b.onclick = () => { const nc = Object.assign({}, chosen, { [f]: v }); wizard(id, opts.filter(a => a[f] === v), nc); }; box.appendChild(b); });
        sh.appendChild(box);
        const cancel = el('button', 'Cancel', 'ghost big'); cancel.onclick = closeModal; sh.appendChild(cancel);
      });
    }
  }
  const a = Object.assign({}, opts[0]); delete a.nd;
  if (a.t === 'rent') { const me = S.players[viewer]; a.doubles = me.hand.filter(x => S.cards[x].act === 'double').slice(0, opts[0].nd); }
  closeModal(); act(a);
}
function flipWild(id) {
  const c = S.cards[id], pl = E.findPile(S.players[viewer], id);
  openModal(sh => {
    sh.appendChild(el('h2', 'Move this wild to…')); sh.appendChild(el('p', 'Flipping a wild is free and does not use a play.'));
    const box = el('div', null, 'opts');
    c.colors.filter(x => x !== pl.color).forEach(col => { const b = el('button', sw(col) + esc(SETS[col].label)); b.onclick = () => { closeModal(); act({ t: 'move', card: id, color: col }); }; box.appendChild(b); });
    sh.appendChild(box); const x = el('button', 'Cancel', 'ghost big'); x.onclick = closeModal; sh.appendChild(x);
  });
}

// ---------- prompts ----------
function describePending(pd) {
  const from = S.players[pd.from].name;
  if (pd.kind === 'pay') return `${esc(from)} wants ${pd.amount}M from you (${esc(pd.label)}).`;
  if (pd.kind === 'sly') return `${esc(from)} wants to take your ${esc(S.cards[pd.take].name)} (Sly Deal).`;
  if (pd.kind === 'forced') return `${esc(from)} wants to swap their ${esc(S.cards[pd.give].name)} for your ${esc(S.cards[pd.take].name)} (Forced Deal).`;
  const pl = S.players[pd.target].piles.find(x => x.id === pd.pile); return `${esc(from)} wants your complete ${esc(SETS[pl.color].label)} set (Deal Breaker).`;
}
function promptJSN() {
  const pd = S.pending, attacking = pd.chain % 2 === 1, forPartner = attacking ? viewer !== pd.from : viewer !== pd.target;
  const fromN = esc(S.players[pd.from].name), tgN = esc(S.players[pd.target].name);
  openModal(sh => {
    sh.appendChild(el('h2', attacking ? 'Your side was told No!' : forPartner ? 'Your teammate is under attack' : 'Incoming action'));
    let msg;
    if (attacking) msg = (forPartner ? `${fromN}'s ` : 'Your ') + `${esc(pd.label)} against ${tgN} was blocked with Just Say No. Counter with your Just Say No to make it go through?`;
    else msg = (forPartner ? describePending(pd).replace(/from you|your /g, m => m === 'from you' ? 'from ' + tgN : tgN + "'s ") + ' Use your Just Say No to protect your teammate?' : describePending(pd)) + (pd.chain ? ' (A Just Say No was countered.)' : '');
    sh.appendChild(el('p', msg));
    const box = el('div', null, 'opts');
    const y = el('button', '🛑 Play Just Say No', 'primary'); y.onclick = () => act({ t: 'jsn', use: true });
    const n = el('button', attacking ? 'Let it be cancelled' : forPartner ? "Don't use it" : 'Accept'); n.onclick = () => act({ t: 'jsn', use: false });
    box.append(y, n); sh.appendChild(box);
  });
}
function promptBoost() {
  const pd = S.pending, k = E.countDoubles(S, viewer);
  openModal(sh => {
    sh.appendChild(el('h2', 'Stack Double The Rent?'));
    sh.appendChild(el('p', `Your teammate ${esc(S.players[pd.from].name)} is charging ${pd.amount}M ${esc(pd.label)} to ${pd.queue.map(i => esc(S.players[i].name)).join(' and ')}. Add your Double The Rent to multiply it. This doesn't use a play.`));
    const box = el('div', null, 'opts');
    for (let n = 0; n <= k; n++) { const b = el('button', n === 0 ? 'No thanks' : `Add ${n} (rent becomes ${pd.amount * Math.pow(2, n)}M)`, n ? 'primary' : ''); b.onclick = () => act({ t: 'boost', n }); box.appendChild(b); }
    sh.appendChild(box);
  });
}
function promptPay() {
  const pd = S.pending, me = S.players[viewer], assets = E.payable(S, me), sel = new Set();
  openModal(sh => {
    sh.appendChild(el('h2', `Pay ${pd.amount}M to ${esc(S.players[pd.from].name)}`));
    sh.appendChild(el('p', describePending(pd) + ' No change is given. Properties you hand over go to their table.'));
    const list = el('div', null, 'pick');
    assets.forEach(id => { const pl = E.findPile(me, id); const m = el('div', null); m.innerHTML = miniHTML(id, pl ? pl.color : null, ''); const node = m.firstChild; if (!pl) node.querySelector('span').textContent = 'Bank: ' + S.cards[id].name;
      if (pl && (pl.house === id || pl.hotel === id)) node.querySelector('span').textContent = (pl.house === id ? 'House' : 'Hotel') + ' on ' + SETS[pl.color].label;
      node.style.cursor = 'pointer'; node.onclick = () => { sel.has(id) ? sel.delete(id) : sel.add(id); node.classList.toggle('sel'); upd(); }; list.appendChild(node); });
    sh.appendChild(list);
    const line = el('div', null, 'payline'); const btn = el('button', 'Pay', 'primary');
    const upd = () => { const v = E.sumVal(S, [...sel]); line.firstChild.textContent = `Selected ${v}M of ${pd.amount}M`; btn.disabled = !(v >= pd.amount || sel.size === assets.length); };
    line.append(el('span', ''), btn); sh.appendChild(line);
    const auto = el('button', 'Suggest payment', 'ghost'); auto.onclick = () => { sel.clear(); AI.choosePayment(S, viewer, pd.amount).forEach(x => sel.add(x)); list.querySelectorAll('.mini').forEach(n => n.classList.toggle('sel', sel.has(+n.dataset.id))); upd(); };
    sh.appendChild(auto);
    btn.onclick = () => act({ t: 'pay', cards: [...sel] }); upd();
  });
}
function promptDiscard() {
  const me = S.players[viewer], need = me.hand.length - 7, sel = new Set();
  openModal(sh => {
    sh.appendChild(el('h2', `Discard ${need} card${need > 1 ? 's' : ''}`)); sh.appendChild(el('p', 'You can keep at most 7 cards at the end of your turn.'));
    const list = el('div', me.hand.map(id => cardHTML(id)).join(''), 'pick'); sh.appendChild(list);
    const btn = el('button', 'Discard', 'primary big'); btn.disabled = true;
    list.querySelectorAll('.card').forEach(n => n.onclick = () => { const id = +n.dataset.id; if (sel.has(id)) sel.delete(id); else if (sel.size < need) sel.add(id); n.classList.toggle('sel', sel.has(id)); btn.disabled = sel.size !== need; });
    btn.onclick = () => act({ t: 'discard', cards: [...sel] }); sh.appendChild(btn);
  });
}
function showWinner() {
  localStorage.removeItem(SAVE);
  const w = S.winner >= 0 ? S.players[S.winner] : null;
  $('pass').classList.add('hidden');
  openModal(sh => {
    sh.appendChild(el('div', '<div class="sun"></div>'));
    if (w && S.teams) {
      const mates = S.players.filter(p => p.team === S.winnerTeam);
      sh.appendChild(el('h2', `🎉 ${esc(E.TEAM_NAMES[S.winnerTeam])} wins! (${mates.map(p => esc(p.name)).join(' & ')})`));
      sh.appendChild(el('div', mates.map(m => m.piles.filter(pl => E.pileComplete(S, pl)).map(pl => pileHTML(pl, false)).join('')).join(''), 'piles'));
    } else {
    sh.appendChild(el('h2', w ? `🎉 ${esc(w.name)} wins!` : 'Game drawn'));
    if (w) sh.appendChild(el('div', w.piles.filter(pl => E.pileComplete(S, pl)).map(pl => pileHTML(pl, false)).join(''), 'piles'));
    }
    if (NET.mode === 'host') { const rm = el('button', 'Rematch with this room', 'primary big'); rm.onclick = () => { closeModal(); NET.rematch(); }; sh.appendChild(rm); }
    if (NET.mode === 'client') sh.appendChild(el('p', 'The host can start a rematch.'));
    const again = el('button', NET.mode === 'local' ? 'New game' : 'Leave room', NET.mode === 'local' ? 'primary big' : 'ghost big'); again.onclick = () => { closeModal(); NET.leave(); backToSetup(); }; sh.appendChild(again);
    const look = el('button', 'Look at the table', 'ghost big'); look.onclick = closeModal; sh.appendChild(look);
  });
}
function backToSetup() { clearTimeout(aiTimer); S = null; $('lobby').classList.add('hidden'); NET.refreshSetup(); $('game').classList.add('hidden'); $('pass').classList.add('hidden'); $('setup').classList.remove('hidden'); $('resumeBtn').classList.toggle('hidden', !localStorage.getItem(SAVE)); }

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
$('menuBtn').onclick = () => openModal(sh => {
  sh.appendChild(el('h2', 'Menu'));
  const box = el('div', null, 'opts');
  const sp = el('button', 'Computer speed: ' + (AI_DELAY > 400 ? 'Normal' : 'Fast')); sp.onclick = () => { AI_DELAY = AI_DELAY > 400 ? 250 : 700; closeModal(); loop(); };
  const q = el('button', NET.mode === 'client' ? 'Leave online game' : NET.mode === 'host' ? 'End online game for everyone' : 'Quit to main menu (game is saved)');
  q.onclick = () => { closeModal(); if (NET.mode === 'host') { localStorage.removeItem(SAVE); NET.leave(); } else if (NET.mode === 'client') NET.leave(); else save(); backToSetup(); };
  if (NET.mode === 'host') { const inv = el('button', '📨 Room ' + NET.code + ' - share invite again'); inv.onclick = () => NET.shareInvite(); box.append(inv); }
  const r = el('button', 'Resume'); r.onclick = () => { closeModal(); loop(); };
  box.append(r, sp, q); sh.appendChild(box);
});
// ---------- online play: host-authoritative peer-to-peer (PeerJS public broker, no accounts) ----------
const DECK = E.buildDeck();
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PEER_OPTS = { debug: (window.__cbdDebug || 1), config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] } };
const CLIENT_KEY = 'cbd-online-client';
const rid = n => Array.from({ length: n }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const NET = {
  mode: 'local', peer: null, code: null, grace: 30000, room: null, conns: {}, conn: null, seat: null, token: null, name: '', leaving: false, hb: null, lastHost: 0, retryUntil: 0,
  // ----- shared -----
  status(msg) { $('lobbyStatus').textContent = msg || ''; },
  leave() {
    this.leaving = true; clearInterval(this.hb);
    try { if (this.mode === 'client' && this.conn && this.conn.open) this.conn.send({ t: 'bye' }); } catch (e) {}
    try { this.peer && this.peer.destroy(); } catch (e) {}
    if (this.mode === 'client') localStorage.removeItem(CLIENT_KEY);
    this.mode = 'local'; this.peer = null; this.conn = null; this.conns = {}; this.room = null; this.code = null;
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
  // ----- host -----
  host(name, total) {
    this.leave(); this.leaving = false; this.mode = 'host'; this.name = name;
    this.room = { total, teams: false, seats: [{ kind: 'host', name, connected: true, team: 0 }].concat([1, 2, 3].map(i => ({ kind: 'open', name: '', team: i % 2 }))), started: false };
    this.openPeer(rid(5), 0);
  },
  roomSave() { return { code: this.code, total: this.room.total, teams: this.room.teams, seats: this.room.seats.map(s => ({ kind: s.kind, name: s.name, token: s.token, team: s.team })), started: this.room.started }; },
  resumeHost(r) {
    this.leave(); this.leaving = false; this.mode = 'host'; this.room = { total: r.total, teams: r.teams, seats: r.seats.map(s => Object.assign({}, s, { connected: s.kind === 'host' })), started: true };
    S.players.forEach(p => { if (p.remote) p.away = p.away || Date.now(); });
    this.openPeer(r.code, 0, true); showGame();
  },
  openPeer(code, tries, resuming) {
    this.code = code; if (!resuming) { this.showLobby(); this.status('Opening room…'); }
    const peer = new Peer('cbd-' + code, PEER_OPTS); this.peer = peer;
    peer.on('open', () => { this.status('Room open. Share the invite, then tap Start.'); if (!resuming) this.renderLobby(); else toast('Room ' + code + ' reopened - players can rejoin.'); this.startHeartbeat(); });
    peer.on('connection', conn => this.onConn(conn));
    peer.on('disconnected', () => { if (!this.leaving && this.peer === peer) setTimeout(() => { try { peer.reconnect(); } catch (e) {} }, 2000); });
    peer.on('error', err => {
      if (this.peer !== peer || this.leaving) return;
      if (err.type === 'unavailable-id') { try { peer.destroy(); } catch (e) {} if (resuming && tries < 20) return setTimeout(() => this.openPeer(code, tries + 1, true), 3000); return this.openPeer(rid(5), tries + 1, resuming); }
      if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error' || err.type === 'socket-closed') { this.status('Connection problem - retrying…'); return; }
      if (err.type === 'browser-incompatible') { this.status('This device does not support online play.'); return; }
      console.warn('peer error', err.type, err);
    });
  },
  onConn(conn) {
    conn.on('data', msg => this.onHostMsg(conn, msg));
    conn.on('close', () => this.dropConn(conn));
    conn.on('error', () => this.dropConn(conn));
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
    const room = this.room; let i = this.seatOfConn(conn);
    if (i >= 0) room.seats[i].lastSeen = Date.now();
    if (msg.t === 'hello') {
      const token = String(msg.token || '').slice(0, 40), name = String(msg.name || 'Player').trim().slice(0, 16) || 'Player';
      i = room.seats.findIndex(s => s.kind === 'remote' && s.token === token);
      if (i < 0) {
        if (room.started) { conn.send({ t: 'fatal', msg: 'That game has already started.' }); return setTimeout(() => conn.close(), 500); }
        i = room.seats.findIndex((s, k) => k < room.total && s.kind === 'open');
        if (i < 0) { conn.send({ t: 'fatal', msg: 'That room is full.' }); return setTimeout(() => conn.close(), 500); }
        room.seats[i] = { kind: 'remote', name, token, team: room.seats[i].team };
      }
      const s = room.seats[i]; if (s.conn && s.conn !== conn) { try { s.conn.close(); } catch (e) {} }
      s.conn = conn; s.connected = true; s.lastSeen = Date.now();
      conn.send({ t: 'welcome', seat: i, code: this.code });
      if (room.started && S) { if (S.players[i].away) { S.players[i].away = null; log2(S.players[i].name + ' is back.'); } loop(); }
      else this.broadcastLobby();
      return;
    }
    if (i < 0) return;
    if (msg.t === 'act') {
      if (!S || S.winner != null || E.actorNow(S) !== i) { conn.send({ t: 'error', msg: 'Not your move right now.' }); return this.sendState(i); }
      try { E.apply(S, msg.a); } catch (e) { conn.send({ t: 'error', msg: e.message }); return this.sendState(i); }
      loop();
    } else if (msg.t === 'bye') { this.dropConn(conn); }
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
    const v = Object.assign({}, S); delete v.cards; v.rs = 0; v.deck = S.deck.map(() => -1);
    v.players = S.players.map(p => p.id === seat ? p : Object.assign({}, p, { hand: p.hand.map(() => -1) }));
    return v;
  },
  sendState(i) { const s = this.room.seats[i]; if (s && s.conn && s.conn.open) s.conn.send({ t: 'state', seat: i, ver: this.ver, S: this.viewFor(i) }); },
  ver: 0,
  broadcastState() { if (!this.room) return; this.ver++; this.room.seats.forEach((s, i) => { if (s.kind === 'remote') this.sendState(i); }); },
  startHeartbeat() {
    clearInterval(this.hb);
    this.hb = setInterval(() => {
      if (this.mode === 'host' && this.room) this.room.seats.forEach(s => { if (s.conn) { if (s.conn.open) s.conn.send({ t: 'ping' }); if (Date.now() - (s.lastSeen || 0) > 20000) { const c = s.conn; try { c.close(); } catch (e) {} this.dropConn(c); } } });
      if (this.mode === 'client') { if (this.conn && this.conn.open) this.conn.send({ t: 'pong' }); if (this.conn && Date.now() - this.lastHost > 15000) { const c = this.conn; this.conn = null; try { c.close(); } catch (e) {} this.reconnect(); } }
    }, 4000);
  },
  // ----- client -----
  send(msg) { if (this.conn && this.conn.open) this.conn.send(msg); else { toast('Not connected - reconnecting…'); this.reconnect(); } },
  join(code, name) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (code.length < 4) return toast('Enter the room code from the invite.');
    this.leave(); this.leaving = false; this.mode = 'client'; this.code = code; this.name = name;
    const saved = JSON.parse(localStorage.getItem(CLIENT_KEY) || 'null');
    this.token = saved && saved.code === code ? saved.token : rid(12);
    localStorage.setItem(CLIENT_KEY, JSON.stringify({ code, token: this.token, name }));
    this.showLobby(); this.renderLobby([], 0); this.status('Connecting to room ' + code + '…');
    this.retryUntil = Date.now() + 180000;
    const peer = new Peer(PEER_OPTS); this.peer = peer;
    peer.on('open', () => this.connect());
    peer.on('disconnected', () => { if (!this.leaving && this.peer === peer) setTimeout(() => { try { peer.reconnect(); } catch (e) {} }, 2000); });
    peer.on('error', err => {
      if (this.peer !== peer || this.leaving) return;
      if (err.type === 'peer-unavailable') { if (!S && !this.everJoined) { this.status('No open room ' + code + ' found. Check the code; the host must keep the app open.'); } return this.reconnect(); }
      if (err.type === 'browser-incompatible') return this.status('This device does not support online play.');
      this.reconnect();
    });
    this.startHeartbeat();
  },
  connect() {
    if (this.leaving || !this.peer || this.peer.destroyed) return;
    const conn = this.peer.connect('cbd-' + this.code, { reliable: true, serialization: 'json' }); this.conn = conn;
    const t = setTimeout(() => { if (this.conn === conn && !conn.open) { try { conn.close(); } catch (e) {} this.conn = null; this.reconnect(); } }, 12000);
    conn.on('open', () => { clearTimeout(t); this.lastHost = Date.now(); conn.send({ t: 'hello', name: this.name, token: this.token }); });
    conn.on('data', msg => this.onClientMsg(msg));
    conn.on('close', () => { if (this.conn === conn) { this.conn = null; this.reconnect(); } });
    conn.on('error', () => { if (this.conn === conn) { this.conn = null; this.reconnect(); } });
  },
  reconnect() {
    if (this.leaving || this.mode !== 'client' || this._rt) return;
    if (Date.now() > this.retryUntil) { this.status('Lost the host. Ask them to keep the app open, then rejoin.'); toast('Disconnected from host.'); return; }
    if (S) toast('Reconnecting to host…'); else if (this.everJoined) this.status('Reconnecting…');
    this._rt = setTimeout(() => { this._rt = null; if (this.peer && this.peer.disconnected && !this.peer.destroyed) { try { this.peer.reconnect(); } catch (e) {} } if (this.peer && this.peer.open) this.connect(); else this.reconnect(); }, 3000);
  },
  onClientMsg(msg) {
    if (!msg) return; this.lastHost = Date.now(); this.retryUntil = Date.now() + 180000;
    switch (msg.t) {
      case 'welcome': this.seat = msg.seat; this.everJoined = true; this.status('Joined! Waiting for the host to start.'); break;
      case 'lobby': this.seat = msg.seat; this._teams = !!msg.teams; if (!S) { this.showLobby(); this.renderLobby(msg.seats, msg.total); } break;
      case 'state': { this.seat = msg.seat; this.ver = msg.ver; S = msg.S; S.cards = DECK; viewer = msg.seat;
        if ($('game').classList.contains('hidden')) { $('lobby').classList.add('hidden'); $('setup').classList.add('hidden'); $('game').classList.remove('hidden'); }
        loop(); break; }
      case 'error': toast(msg.msg); break;
      case 'fatal': toast(msg.msg); localStorage.removeItem(CLIENT_KEY); this.leave(); backToSetup(); break;
    }
  },
};
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

window.__cbd = { get state() { return S; }, get viewer() { return viewer; }, get net() { return NET; }, act, loop, setDelay: d => { AI_DELAY = d; }, setGrace: g => { NET.grace = g; } };
initSetup();
})();
