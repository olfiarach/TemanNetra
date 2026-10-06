import test from 'node:test';
import assert from 'node:assert/strict';

class FakeUtterance {
  constructor(text) { this.text = text; }
}
function install(behavior) {
  const spoken = [];
  let current = null;
  globalThis.SpeechSynthesisUtterance = FakeUtterance;
  globalThis.speechSynthesis = {
    getVoices: () => [],
    cancel() {
      if (current) { const u = current; current = null; u.onerror?.({ error: 'interrupted' }); }
    },
    speak(u) { spoken.push(u.text); current = u; behavior(u); },
  };
  return spoken;
}
const load = () => import('./soundEffects.js?' + Math.random());

test('rejects when speech unsupported', async () => {
  delete globalThis.speechSynthesis; delete globalThis.SpeechSynthesisUtterance;
  const { speak } = await load();
  await assert.rejects(speak('x'), /speech-unsupported/);
});

test('rejects on blocked playback instead of succeeding', async () => {
  install((u) => queueMicrotask(() => u.onerror({ error: 'not-allowed' })));
  const { speak } = await load();
  await assert.rejects(speak('x'), /not-allowed/);
});

test('new speech interrupts the previous one; no overlap', async () => {
  let first;
  const spoken = install((u) => { if (u.text === 'a') first = u; else queueMicrotask(() => { u.onstart(); u.onend(); }); });
  const { speak, isSpeaking } = await load();
  const a = speak('a');
  const b = speak('b');
  assert.equal(await a, 'interrupted');
  assert.equal(await b, 'done');
  assert.deepEqual(spoken, ['a', 'b']);
  assert.equal(isSpeaking(), false);
  assert.ok(first);
});

test('rejects when speech never starts', async () => {
  install(() => {});
  const { speak } = await load();
  await assert.rejects(speak('x'), /speech-timeout/);
});
