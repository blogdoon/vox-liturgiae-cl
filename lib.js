// Pure helpers (no DOM) so test.js can run them under node.

const stripAccents = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Latin → spelling an Italian TTS voice reads with Ecclesiastical pronunciation.
function ecclesiastical(t) {
  return t
    .replace(/ǽ/g, 'é').replace(/[æœ]/g, 'e').replace(/[ÆŒ]/g, 'E')
    .replace(/j/g, 'i').replace(/J/g, 'I').replace(/y/g, 'i').replace(/ý/g, 'í')
    .replace(/([^stx])t([ií])(?=[aeiouáéíóú])/gi, '$1z$2') // gratia → grazia (ts)
    .replace(/xc(?=[eéií])/g, 'ksc')                         // excelsis → ek-shelsis
    .replace(/\bmihi\b/gi, 'miki').replace(/\bnihil\b/gi, 'nikil');
}

// What to read aloud for a vocab headword: "sanctus, -a, -um" → "sanctus".
const spoken = la => la.split(/[(+]/)[0].replace(/,\s*-\w+/g, '').replace(/\//g, ',').replace(/-/g, '').trim();

// Rough phonetic key so Latin text and an Italian speech transcript can be compared.
function phon(s) {
  return stripAccents(s).toLowerCase()
    .replace(/[æœ]/g, 'e').replace(/[jy]/g, 'i').replace(/ch/g, 'k').replace(/ph/g, 'f')
    .replace(/h/g, '').replace(/t(?=i[aeiou])/g, 'z').replace(/x/g, 'ks').replace(/qu/g, 'ku')
    .replace(/c(?![ei])/g, 'k').replace(/u/g, 'o') // Italian ASR often hears Latin u as o
    .replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
}

function lev(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

// 0..100
function similarity(heard, target) {
  const a = phon(heard), b = phon(target);
  if (!a || !b) return 0;
  return Math.round(100 * (1 - lev(a, b) / Math.max(a.length, b.length)));
}

// SM-2. s = {ef, iv (days), reps, due (ms)}; q: 0 again, 3 hard, 4 good, 5 easy.
function sm2(s, q, now = Date.now()) {
  s = Object.assign({ ef: 2.5, iv: 0, reps: 0, due: 0 }, s);
  s.ef = Math.max(1.3, s.ef + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (q < 3) { s.reps = 0; s.iv = 0; s.due = now; return s; }
  s.reps++;
  s.iv = s.reps === 1 ? 1 : s.reps === 2 ? 6 : Math.round(s.iv * s.ef);
  const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
  s.due = midnight.getTime() + s.iv * 864e5;
  return s;
}

if (typeof module !== 'undefined') module.exports = { ecclesiastical, spoken, phon, similarity, sm2, stripAccents };
