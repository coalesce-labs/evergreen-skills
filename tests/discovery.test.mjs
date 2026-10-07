import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = new URL('../scripts/discovery-eval.mjs', import.meta.url).pathname;
const cases = JSON.parse(readFileSync(new URL('../evals/natural-language/cases.json', import.meta.url))).cases;
const run = (...args) => execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', stdio: 'pipe' });
const root = mkdtempSync(join(tmpdir(), 'evergreen-discovery-grader-'));
let serial = 0;
function score(predictions) {
  const file = join(root, `${serial++}.json`); writeFileSync(file, JSON.stringify({ predictions }));
  return JSON.parse(run('score', file));
}
test('discovery prompt exposes catalog and requests but no expected labels', () => {
  const prompt = run('prompt');
  for (const c of cases) assert.ok(prompt.includes(c.prompt));
  assert.ok(prompt.includes('evergreen-context')); assert.equal(prompt.includes('"expected"'), false);
  const file = join(root, 'prompt.txt'); run('prompt', file);
  assert.equal(readFileSync(file, 'utf8'), prompt);
  assert.throws(() => run('prompt', file)); // Never overwrite an earlier model's input.
});
test('discovery scorer grades sets, false positives and misses rather than reasons', () => {
  const perfect = cases.map(c => ({ id: c.id, selected: [...c.expected].reverse(), reason: 'not used by grader' }));
  const value = score(perfect.reverse());
  assert.equal(value.correct, 24); assert.equal(value.positiveCorrect, 16);
  assert.equal(value.negativeTotal, 8); assert.equal(value.falsePositives, 0);
  const wrong = score(cases.map(c => ({ id: c.id, selected: c.expected.length ? [] : ['evergreen-context'], reason: 'correct' })));
  assert.equal(wrong.correct, 0); assert.equal(wrong.positiveCorrect, 0); assert.equal(wrong.falsePositives, 8);
});
test('discovery scorer refuses incomplete, duplicated and unknown predictions', () => {
  const valid = cases.map(c => ({ id: c.id, selected: c.expected }));
  assert.throws(() => score(valid.slice(1)));
  assert.throws(() => score([...valid.slice(1), valid[1]]));
  assert.throws(() => score([{ id: 'unknown', selected: [] }, ...valid.slice(1)]));
  assert.throws(() => score([{ ...valid[0], selected: ['unknown-skill'] }, ...valid.slice(1)]));
  assert.throws(() => score([{ ...valid[0], selected: ['evergreen-context', 'evergreen-context'] }, ...valid.slice(1)]));
  assert.throws(() => score([{ ...valid[0], selected: 'evergreen-context' }, ...valid.slice(1)]));
});
