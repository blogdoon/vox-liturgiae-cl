// node test.js — smallest checks that fail if the logic breaks.
const assert = require('assert');
const fs = require('fs');
const { ecclesiastical, spoken, similarity, sm2 } = require('./lib.js');
const { MASS, VOCAB } = new Function(fs.readFileSync(__dirname + '/data.js', 'utf8') + 'return { MASS, VOCAB };')();

// data integrity
for (const s of MASS) for (const l of s.l) {
  assert('PDRA'.includes(l[0]) && l[0].length === 1, 'bad role: ' + l);
  assert(l[1] && l[2], 'missing text: ' + l);
}
for (const v of VOCAB) assert(v.length === 2 && v[0] && v[1], 'bad vocab: ' + v);

// pronunciation
assert.strictEqual(ecclesiastical('grátias ágimus'), 'grázias ágimus');
assert.strictEqual(ecclesiastical('Christe'), 'Christe');               // no z after s
assert.strictEqual(ecclesiastical('cæli, sǽcula'), 'celi, sécula');
assert.strictEqual(ecclesiastical('excélsis'), 'ekscélsis');
assert.strictEqual(spoken('sanctus, -a, -um'), 'sanctus');
assert.strictEqual(spoken('cum (+ ablative)'), 'cum');

// speech scoring
assert.strictEqual(similarity('Et cum spíritu tuo', 'Et cum spíritu tuo.'), 100);
assert(similarity('e con spirito tuo', 'Et cum spíritu tuo.') >= 75, 'Italian-ish transcript should pass');
assert(similarity('buongiorno a tutti', 'Et cum spíritu tuo.') < 50, 'unrelated speech should fail');

// SM-2
const t0 = new Date(2025, 0, 1, 15).getTime();
let s = sm2(undefined, 4, t0);
assert.strictEqual(s.iv, 1); assert.strictEqual(s.due, new Date(2025, 0, 2).getTime());
s = sm2(s, 4, t0); assert.strictEqual(s.iv, 6);
s = sm2(s, 5, t0); assert.strictEqual(s.iv, Math.round(6 * s.ef));
s = sm2(s, 0, t0); assert.strictEqual(s.reps, 0); assert.strictEqual(s.due, t0);
assert(s.ef >= 1.3);

console.log('ok');
