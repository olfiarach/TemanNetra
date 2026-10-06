// Audio helper for TemanNetra: serialized speech and synthesized sound cues

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    if (typeof AudioContext !== 'undefined') {
      audioCtx = new AudioContext();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Warm the voice list early so the first utterance can pick an Indonesian voice
globalThis.speechSynthesis?.getVoices?.();

let speechToken = 0;
let speaking = false;
const START_TIMEOUT_MS = 3000;

export const isSpeechSupported = () =>
  typeof globalThis.speechSynthesis !== 'undefined' && typeof globalThis.SpeechSynthesisUtterance !== 'undefined';

export const isSpeaking = () => speaking;

/**
 * Speak with the browser's SpeechSynthesis. Serialized: a new call cancels whatever is
 * still playing (obsolete prompts never overlap). Resolves 'done' | 'interrupted';
 * rejects (never silently succeeds) when speech is unsupported, blocked, errors, or never starts.
 */
export function speak(text) {
  const token = ++speechToken;
  globalThis.speechSynthesis?.cancel?.();
  player?.pause();
  if (typeof globalThis.Audio === 'undefined') return speakBrowser(text, token);
  // Pre-generated Indonesian gTTS clip; browser voice for other phrases or if that fails
  return playRemote(text, token).catch((err) =>
    token === speechToken ? speakBrowser(text, token) : 'interrupted'
  );
}

let player; // one reused element: once unlocked by a gesture, iOS keeps allowing playback
const ttsUrls = new Map(); // text -> Promise<objectURL>; phrases are few and fixed, so never evicted

// Must match slug() in backend/export_web.py, which pre-generates these files.
export const ttsSlug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const TTS_BASE = `${import.meta.env?.BASE_URL ?? '/'}tts/`;

function ttsUrl(text) {
  if (!ttsUrls.has(text)) {
    const p = fetch(`${TTS_BASE}${ttsSlug(text)}.mp3`, { signal: AbortSignal.timeout(4000) })
      .then((res) => { if (!res.ok) throw new Error('tts-unavailable'); return res.blob(); })
      .then((blob) => URL.createObjectURL(blob));
    p.catch(() => ttsUrls.delete(text)); // retry on next use (a missing clip just 404s again)
    ttsUrls.set(text, p);
  }
  return ttsUrls.get(text);
}

// Fetch audio ahead of time so announcements play instantly.
export const preloadSpeech = (texts) => texts.forEach((t) => ttsUrl(t).catch(() => {}));

async function playRemote(text, token) {
  const url = await ttsUrl(text);
  if (token !== speechToken) return 'interrupted';
  player ??= new globalThis.Audio();
  player.src = url;
  return new Promise((resolve, reject) => {
    const end = (fn) => { if (token === speechToken) speaking = false; fn(); };
    player.onplaying = () => { if (token === speechToken) speaking = true; };
    player.onended = () => end(() => resolve(token === speechToken ? 'done' : 'interrupted'));
    player.onerror = () => end(() => reject(new Error('audio-error')));
    player.play().catch((e) => end(() => reject(e)));
  });
}

function speakBrowser(text, token) {
  if (!isSpeechSupported()) return Promise.reject(new Error('speech-unsupported'));
  const synth = globalThis.speechSynthesis;
  synth.cancel();

  return new Promise((resolve, reject) => {
    const utterance = new globalThis.SpeechSynthesisUtterance(text);
    utterance.lang = 'id-ID';
    // Android Chrome reports 'in-ID'/'id_ID'; voices may be empty until 'voiceschanged' fires
    const voice = synth.getVoices?.().find((v) => /^(id|in)[-_]/i.test(v.lang || ''));
    if (voice) utterance.voice = voice;

    let started = false;
    const timer = setTimeout(() => {
      if (!started && token === speechToken) {
        speaking = false;
        reject(new Error('speech-timeout')); // settle first: cancel() fires 'interrupted'
        synth.cancel();
      }
    }, START_TIMEOUT_MS);
    const finish = (fn) => {
      clearTimeout(timer);
      if (token === speechToken) speaking = false;
      fn();
    };

    utterance.onstart = () => {
      started = true;
      if (token === speechToken) speaking = true;
    };
    utterance.onend = () => finish(() => resolve(token === speechToken ? 'done' : 'interrupted'));
    utterance.onerror = (e) =>
      finish(() =>
        e.error === 'interrupted' || e.error === 'canceled' ? resolve('interrupted') : reject(new Error(e.error || 'speech-error'))
      );

    try {
      synth.speak(utterance);
    } catch (err) {
      finish(() => reject(err));
    }
  });
}

/**
 * Synthesize distinct acoustic feedback tones using Web Audio API
 */
export function playChime(type = 'detected') {
  if (speaking) return; // cues never overlap speech
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'detected') {
      // Upbeat double-chime (Ding-Ding!)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880.00, now + 0.1); // A5
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'ready') {
      // Subtle, pleasant single ping indicating camera is ready for next note
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.15); // G5
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === 'click') {
      // Tactile button click feedback
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, now);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    }
  } catch (err) {
    console.warn("Error playing chime:", err);
  }
}

/**
 * Trigger vibration if supported on mobile device
 */
export function triggerHaptic(duration = 60) {
  if (navigator.vibrate) {
    try {
      navigator.vibrate(duration);
    } catch {
      // Ignored if browser denies permission
    }
  }
}
