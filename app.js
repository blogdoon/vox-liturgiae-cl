const $ = s => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const ROLE = { P: 'Priest', D: 'Deacon / Reader', R: 'People', A: 'All', V: 'Word' };
const NEW_PER_DAY = 10;
const day = (offset = 0) => new Date(Date.now() + offset * 864e5).toLocaleDateString('sv'); // YYYY-MM-DD

// ---------- data ----------
const LINES = MASS.flatMap(s => s.l.map(([r, la, en, n]) => ({ r, la, en, n, s: s.t })));
const key = la => stripAccents(la).toLowerCase().replace(/[^a-zæœ ]/g, '').trim();
const CARDS = new Map();
for (const l of LINES) if (!CARDS.has(key(l.la))) CARDS.set(key(l.la), { id: key(l.la), ...l });
for (const [la, en] of VOCAB) CARDS.set('v:' + la, { id: 'v:' + la, r: 'V', la, en });
const sayText = c => c.r === 'V' ? spoken(c.la) : c.la;

// ---------- state ----------
const S = Object.assign({ srs: {}, streak: { last: '', n: 0 }, newDay: { d: '', n: 0 },
  rate: 0.85, voice: '', deck: 'people', dir: 'la', speakI: 0, showEn: true, showNotes: false },
  JSON.parse(localStorage.vox || '{}'));
const save = () => { localStorage.vox = JSON.stringify(S); };

function tick() {
  if (S.streak.last === day()) return;
  S.streak.n = S.streak.last === day(-1) ? S.streak.n + 1 : 1;
  S.streak.last = day(); save(); showStreak();
}
function showStreak() {
  const alive = S.streak.last === day() || S.streak.last === day(-1);
  $('#streak').textContent = '🔥 ' + (alive ? S.streak.n : 0);
}

// ---------- speech out ----------
let voices = [];
function loadVoices() {
  voices = speechSynthesis.getVoices();
  const sel = $('#voice');
  sel.textContent = '';
  sel.append(new Option('Auto (Latin → Italian)', ''));
  voices.filter(v => /^(la|it)/i.test(v.lang)).concat(voices.filter(v => !/^(la|it)/i.test(v.lang)))
    .forEach(v => sel.append(new Option(`${v.name} (${v.lang})`, v.voiceURI)));
  sel.value = S.voice;
}
const pickVoice = () => voices.find(v => v.voiceURI === S.voice) || voices.find(v => /^la/i.test(v.lang)) || voices.find(v => /^it/i.test(v.lang));

function speak(text, rate = S.rate) {
  speechSynthesis.cancel();
  return new Promise(res => {
    const v = pickVoice(), latin = v && /^la/i.test(v.lang);
    const u = new SpeechSynthesisUtterance(latin ? text : ecclesiastical(text));
    if (v) u.voice = v;
    u.lang = v ? v.lang : 'it-IT';
    u.rate = rate;
    u.onend = u.onerror = res;
    speechSynthesis.speak(u);
  });
}

// ---------- speech in ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function listen() {
  return new Promise((res, rej) => {
    const r = new SR();
    r.lang = 'it-IT'; // no Latin recognizer exists; Italian is the closest phonetically
    r.maxAlternatives = 5;
    r.onresult = e => res([...e.results[0]].map(a => a.transcript));
    r.onerror = e => rej(e.error);
    r.onend = () => res([]);
    r.start();
  });
}

// ---------- navigation ----------
document.querySelectorAll('nav button').forEach(b => b.onclick = () => {
  stop();
  document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.view').forEach(v => v.hidden = v.id !== b.dataset.view);
  ({ cards: buildQueue, listen: lNew, speak: sRender, settings: showStats })[b.dataset.view]?.();
});

// ---------- Mass ----------
let playTok = 0;
function stop() { playTok++; speechSynthesis.cancel(); document.querySelectorAll('.line.on').forEach(n => n.classList.remove('on')); }
async function playSeq(nodes) {
  stop();
  const t = playTok;
  for (const n of nodes) {
    if (t !== playTok) return;
    n.classList.add('on'); n.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await speak(n.dataset.la);
    n.classList.remove('on');
  }
}
function renderMass() {
  const list = $('#massList');
  for (const s of MASS) {
    const sec = el('div', 'sec'), h = el('h2', null, s.t), b = el('button', 'sm', '▶');
    b.onclick = () => playSeq([...sec.querySelectorAll('.line')]);
    h.append(b); sec.append(h);
    for (const [r, la, en, n] of s.l) {
      const d = el('div', 'line r' + r);
      d.dataset.la = la;
      d.append(el('span', 'role', ROLE[r]), el('div', 'la', la), el('div', 'en', en));
      if (n) d.append(el('div', 'note', n));
      d.onclick = () => playSeq([d]);
      sec.append(d);
    }
    list.append(sec);
  }
}
const applyMassToggles = () => { document.body.classList.toggle('noEn', !S.showEn); document.body.classList.toggle('noNotes', !S.showNotes); };
$('#showEn').checked = S.showEn; $('#showNotes').checked = S.showNotes;
$('#showEn').onchange = e => { S.showEn = e.target.checked; save(); applyMassToggles(); };
$('#showNotes').onchange = e => { S.showNotes = e.target.checked; save(); applyMassToggles(); };
$('#stop').onclick = stop;

// ---------- Flashcards (SM-2) ----------
let queue = [], cur = null, shown = false;
const inDeck = c => S.deck === 'all' || (S.deck === 'people' && 'RA'.includes(c.r)) || (S.deck === 'priest' && 'PD'.includes(c.r)) || (S.deck === 'vocab' && c.r === 'V');
function buildQueue() {
  if (S.newDay.d !== day()) S.newDay = { d: day(), n: 0 };
  const pool = [...CARDS.values()].filter(inDeck), now = Date.now();
  const due = pool.filter(c => S.srs[c.id] && S.srs[c.id].due <= now);
  const fresh = pool.filter(c => !S.srs[c.id]).slice(0, Math.max(0, NEW_PER_DAY - S.newDay.n));
  queue = [...shuffle(due), ...fresh]; // new cards stay in Mass order
  nextCard();
}
function nextCard() {
  shown = false; cur = queue.shift();
  $('#grades').hidden = true;
  const c = $('#card'); c.textContent = '';
  const learned = Object.keys(S.srs).length;
  $('#cardInfo').textContent = `${cur ? queue.length + 1 : 0} to review · ${learned} of ${CARDS.size} cards started`;
  if (!cur) { c.append(el('p', null, 'Done for today ✓ Come back tomorrow, or pick another deck.')); return; }
  const play = el('button', 'sm', '🔊');
  play.onclick = e => { e.stopPropagation(); speak(sayText(cur)); };
  c.append(el('div', 'role', ROLE[cur.r] + (cur.s ? ' · ' + cur.s : '')));
  if (S.dir === 'la') { c.append(el('div', 'la big', cur.la), play); speak(sayText(cur)); }
  else c.append(el('div', 'en big', cur.en));
  c.append(el('p', 'hint', 'Tap card to reveal'));
}
$('#card').onclick = () => {
  if (!cur || shown) return;
  shown = true;
  const c = $('#card');
  c.querySelector('.hint').remove();
  c.append(el('hr'));
  if (S.dir === 'la') c.append(el('div', 'en big', cur.en));
  else { const play = el('button', 'sm', '🔊'); play.onclick = e => { e.stopPropagation(); speak(sayText(cur)); }; c.append(el('div', 'la big', cur.la), play); speak(sayText(cur)); }
  if (cur.n) c.append(el('div', 'note', cur.n));
  $('#grades').hidden = false;
};
$('#grades').onclick = e => {
  const q = +e.target.dataset.q;
  if (!cur || isNaN(q)) return;
  if (!S.srs[cur.id]) S.newDay.n++;
  S.srs[cur.id] = sm2(S.srs[cur.id], q);
  if (q < 3) queue.push(cur);
  tick(); save(); nextCard();
};
$('#deck').value = S.deck; $('#dir').value = S.dir;
$('#deck').onchange = e => { S.deck = e.target.value; save(); buildQueue(); };
$('#dir').onchange = e => { S.dir = e.target.value; save(); if (cur) { queue.unshift(cur); nextCard(); } };

// ---------- Listen ----------
const LPOOL = [...new Map([...CARDS.values()].filter(c => c.r !== 'V').map(c => [c.en, c])).values()];
let lq = null, lRight = 0, lTotal = 0;
function lNew() {
  lq = LPOOL[Math.random() * LPOOL.length | 0];
  $('#lLatin').textContent = '';
  const box = $('#lOpts'); box.textContent = '';
  for (const o of shuffle([lq, ...shuffle(LPOOL.filter(c => c !== lq)).slice(0, 3)])) {
    const b = el('button', null, o.en);
    b.onclick = () => {
      if (box.classList.contains('done')) return;
      box.classList.add('done');
      lTotal++; if (o === lq) { lRight++; tick(); }
      b.classList.add(o === lq ? 'right' : 'wrong');
      [...box.children].find(x => x.textContent === lq.en).classList.add('right');
      $('#lLatin').textContent = lq.la;
      $('#lScore').textContent = `${lRight}/${lTotal}`;
    };
    box.append(b);
  }
  box.classList.remove('done');
  speak(lq.la);
}
$('#lPlay').onclick = () => lq && speak(lq.la);
$('#lSlow').onclick = () => lq && speak(lq.la, 0.55);
$('#lNext').onclick = lNew;

// ---------- Speak (respond to the priest / recite your part) ----------
const TARGETS = LINES.map((l, i) => ({ ...l, prev: LINES[i - 1] })).filter(l => 'RA'.includes(l.r));
MASS.forEach(s => { const i = TARGETS.findIndex(t => t.s === s.t); if (i >= 0) $('#sSection').append(new Option(s.t, i)); });
function sRender() {
  S.speakI = Math.max(0, Math.min(TARGETS.length - 1, S.speakI)); save();
  const t = TARGETS[S.speakI], ctx = $('#sCtx');
  $('#sPos').textContent = `${S.speakI + 1}/${TARGETS.length}`;
  $('#sSection').value = [...$('#sSection').options].filter(o => +o.value <= S.speakI).pop().value;
  ctx.textContent = '';
  if (t.prev) {
    const b = el('button', 'sm', '🔊');
    b.onclick = () => speak(t.prev.la);
    ctx.append(el('div', 'role', ROLE[t.prev.r] + ' says'), el('div', 'la', t.prev.la), b);
    speak(t.prev.la);
  }
  $('#sEn').textContent = t.en;
  $('#sLa').textContent = t.la; $('#sLa').hidden = true;
  $('#sResult').textContent = '';
}
$('#sShow').onclick = () => { const t = TARGETS[S.speakI]; $('#sLa').hidden = false; speak(t.la); };
$('#sPrev').onclick = () => { S.speakI--; sRender(); };
$('#sNext').onclick = () => { S.speakI++; sRender(); };
$('#sSection').onchange = e => { S.speakI = +e.target.value; sRender(); };
$('#sMic').onclick = async () => {
  const t = TARGETS[S.speakI], out = $('#sResult'), btn = $('#sMic');
  speechSynthesis.cancel();
  btn.disabled = true; out.className = ''; out.textContent = 'Listening… speak now';
  try {
    const alts = await listen();
    if (!alts.length) { out.textContent = 'Heard nothing. Try again.'; return; }
    const [heard, score] = alts.map(a => [a, similarity(a, t.la)]).sort((a, b) => b[1] - a[1])[0];
    const v = score >= 80 ? ['good', 'Excellent!'] : score >= 60 ? ['ok', 'Close. Listen and try again.'] : ['bad', 'Not yet. Listen and try again.'];
    out.className = v[0];
    out.textContent = `${v[1]} ${score}% · heard: “${heard}”`;
    $('#sLa').hidden = false;
    if (score >= 60) tick();
  } catch (e) {
    out.textContent = e === 'not-allowed' ? 'Microphone permission denied.' : 'Mic error: ' + e;
  } finally { btn.disabled = false; }
};

// ---------- Settings ----------
$('#voice').onchange = e => { S.voice = e.target.value; save(); };
$('#rate').value = S.rate; $('#rateVal').textContent = S.rate;
$('#rate').oninput = e => { S.rate = +e.target.value; $('#rateVal').textContent = S.rate; save(); };
$('#testVoice').onclick = () => speak('Dóminus vobíscum. Et cum spíritu tuo.');
$('#reset').onclick = () => { if (confirm('Erase all progress?')) { localStorage.removeItem('vox'); location.reload(); } };
function showStats() {
  const now = Date.now(), st = Object.values(S.srs);
  $('#stats').textContent = `Cards started: ${st.length}/${CARDS.size} · mature (≥21 days): ${st.filter(s => s.iv >= 21).length} · due now: ${st.filter(s => s.due <= now).length}`;
}

// ---------- boot ----------
if (!SR) { $('#srWarn').hidden = false; $('#sMic').disabled = true; }
speechSynthesis.onvoiceschanged = loadVoices; loadVoices();
renderMass(); applyMassToggles(); showStreak();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
