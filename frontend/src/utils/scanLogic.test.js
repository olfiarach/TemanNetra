import test from 'node:test';
import assert from 'node:assert/strict';
import { initialConfirmation, stepConfirmation, speechFor, CONFIRM_FRAMES, CLEAR_FRAMES, UNSURE_FRAMES } from './scanLogic.js';

function run(frames) {
  let state = initialConfirmation();
  const events = [];
  for (const f of frames) {
    const r = stepConfirmation(state, f);
    state = r.state;
    if (r.event) events.push(r.event);
  }
  return events;
}
const rep = (labels, n) => Array.from({ length: n }, () => labels);
const A = ['Seratus Ribu'];
const B = ['Lima Ribu'];

test('speech phrase is short and canonical', () => {
  assert.equal(speechFor('Seratus Ribu'), 'Seratus ribu rupiah.');
  assert.equal(speechFor('Dua Puluh Ribu'), 'Dua puluh ribu rupiah.');
});

test('single frame never announces, even repeated flip-flop', () => {
  assert.deepEqual(run([A]), []);
  assert.deepEqual(run([A, B, A, B, A]).filter((e) => e.type === 'confirmed'), []);
});

test('stationary note is announced once', () => {
  const ev = run(rep(A, CONFIRM_FRAMES + 30));
  assert.deepEqual(ev, [{ type: 'confirmed', label: 'Seratus Ribu' }]);
});

test('remove and reinsert announces again; short gaps do not', () => {
  const gap = (n) => rep([], n);
  const shortGap = run([...rep(A, 3), ...gap(CLEAR_FRAMES - 1), ...rep(A, 3)]);
  assert.equal(shortGap.filter((e) => e.type === 'confirmed').length, 1);
  const full = run([...rep(A, 3), ...gap(CLEAR_FRAMES), ...rep(A, 3)]);
  assert.deepEqual(full.map((e) => e.type), ['confirmed', 'cleared', 'confirmed']);
});

test('changed denomination is confirmed after repeated frames', () => {
  const ev = run([...rep(A, 3), ...rep(B, 3)]);
  assert.deepEqual(ev.map((e) => e.label), ['Seratus Ribu', 'Lima Ribu']);
});

test('ambiguous (two denominations / two notes) never confirms and prompts once per window', () => {
  const ev = run(rep(['Seratus Ribu', 'Lima Ribu'], UNSURE_FRAMES * 2));
  assert.deepEqual(ev.map((e) => e.type), ['uncertain', 'uncertain']);
  assert.equal(run(rep(['Seratus Ribu', 'Seratus Ribu'], 10)).some((e) => e.type === 'confirmed'), false);
});

test('no note produces nothing; unknown labels are ignored', () => {
  assert.deepEqual(run(rep([], 20)), []);
  assert.deepEqual(run(rep(['person'], 20)), []);
});
