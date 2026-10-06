// Pure scan logic: canonical denominations and the confirmation state machine.

export const NOMINAL_VALUES = {
  'Satu Ribu': 1000,
  'Dua Ribu': 2000,
  'Lima Ribu': 5000,
  'Sepuluh Ribu': 10000,
  'Dua Puluh Ribu': 20000,
  'Lima Puluh Ribu': 50000,
  'Seratus Ribu': 100000,
};

// Short spoken phrase, e.g. "Seratus ribu rupiah."
export const speechFor = (label) => `${label.charAt(0)}${label.slice(1).toLowerCase()} rupiah.`;

// ponytail: frame counts are unmeasured defaults (~750 ms/frame); tune on-device
// with held-out data. No single-frame shortcut by design.
export const CONFIRM_FRAMES = 3; // identical single-denomination frames needed to announce
export const CLEAR_FRAMES = 3; // empty frames before the confirmed note counts as removed
export const UNSURE_FRAMES = 6; // visible-but-unconfirmed frames before one "belum pasti" prompt

export const initialConfirmation = () => ({ candidate: null, count: 0, confirmed: null, absent: 0, unsure: 0 });

/**
 * Advance the state with one frame's detection labels (only canonical labels).
 * Returns { state, event } where event is null | {type:'confirmed', label} | {type:'cleared'} | {type:'uncertain'}.
 * Two or more distinct labels in one frame are uncertain: never guessed, never counted.
 */
export function stepConfirmation(prev, labels) {
  const distinct = [...new Set(labels.filter((l) => NOMINAL_VALUES[l]))];
  const s = { ...prev };

  if (distinct.length === 0) {
    s.candidate = null;
    s.count = 0;
    s.unsure = 0;
    s.absent += 1;
    if (s.confirmed && s.absent >= CLEAR_FRAMES) {
      s.confirmed = null;
      return { state: s, event: { type: 'cleared' } };
    }
    return { state: s, event: null };
  }

  s.absent = 0;
  const label = distinct.length === 1 && labels.length === 1 ? distinct[0] : null;

  if (label && label === s.confirmed) {
    // Same stationary note: no repeat announcement
    s.candidate = null;
    s.count = 0;
    s.unsure = 0;
    return { state: s, event: null };
  }

  if (label) {
    s.count = label === s.candidate ? s.count + 1 : 1;
    s.candidate = label;
    if (s.count >= CONFIRM_FRAMES) {
      s.confirmed = label;
      s.candidate = null;
      s.count = 0;
      s.unsure = 0;
      return { state: s, event: { type: 'confirmed', label } };
    }
  } else {
    s.candidate = null;
    s.count = 0;
  }

  s.unsure += 1;
  if (s.unsure >= UNSURE_FRAMES) {
    s.unsure = 0;
    return { state: s, event: { type: 'uncertain' } };
  }
  return { state: s, event: null };
}
