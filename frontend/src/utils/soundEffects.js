// Audio helper for TemanNetra: Base64 audio player and synthesized sound cues

let currentAudio = null;
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Play base64 MP3 audio stream returned by gTTS / FastAPI
 */
export function playBase64Audio(base64Data) {
  return new Promise((resolve, reject) => {
    try {
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
      }

      const audio = new Audio(`data:audio/mp3;base64,${base64Data}`);
      currentAudio = audio;

      audio.onended = () => resolve();
      audio.onerror = (e) => reject(e);

      audio.play().catch((err) => {
        console.warn("Autoplay blocked or audio play failed:", err);
        resolve();
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Synthesize distinct acoustic feedback tones using Web Audio API
 */
export function playChime(type = 'detected') {
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
