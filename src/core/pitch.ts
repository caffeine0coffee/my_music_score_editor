import type { Accidental, ClefType, DynamicMark, Pitch, PitchStep } from '../types/score';

export const PITCH_STEPS: readonly PitchStep[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/**
 * Convert a Pitch to a linear diatonic step index (C0 = 0, D0 = 1, ..., C4 = 28, ...).
 */
export function pitchToDiatonic(pitch: Pick<Pitch, 'step' | 'octave'>): number {
  return pitch.octave * 7 + PITCH_STEPS.indexOf(pitch.step);
}

/**
 * Convert a diatonic step index back to { step, octave }.
 */
export function diatonicToPitch(index: number): { step: PitchStep; octave: number } {
  const octave = Math.floor(index / 7);
  const stepIdx = ((index % 7) + 7) % 7;
  return {
    step: PITCH_STEPS[stepIdx],
    octave,
  };
}

/**
 * Diatonic index of the top staff line (VexFlow line 0).
 * - Treble clef: F5 (5 * 7 + 3 = 38)
 * - Bass clef: A3 (3 * 7 + 5 = 26)
 */
export function getTopLineDiatonic(clef: ClefType): number {
  return clef === 'treble' ? pitchToDiatonic({ step: 'F', octave: 5 }) : pitchToDiatonic({ step: 'A', octave: 3 });
}

/**
 * Convert a Y coordinate on a staff to a Pitch and its snapped Y coordinate.
 * Half-steps from top line: 0 = line 0 (top), 1 = space below top, ..., 8 = line 4 (bottom).
 */
export function yToPitch(
  y: number,
  topLineY: number,
  lineSpacing: number,
  clef: ClefType,
): { pitch: Pitch; snappedY: number; halfStepsFromTop: number } {
  const rawHalfSteps = Math.round(((y - topLineY) / lineSpacing) * 2);
  // Clamp to reasonable ledger-line range: 4 ledger lines above (-8) to 4 ledger lines below (+16)
  const halfStepsFromTop = Math.max(-8, Math.min(16, rawHalfSteps));
  const diatonic = getTopLineDiatonic(clef) - halfStepsFromTop;
  const base = diatonicToPitch(diatonic);
  const snappedY = topLineY + (halfStepsFromTop * lineSpacing) / 2;
  return {
    pitch: base,
    snappedY,
    halfStepsFromTop,
  };
}

/**
 * Convert a Pitch to its Y coordinate on a staff.
 */
export function pitchToY(
  pitch: Pick<Pitch, 'step' | 'octave'>,
  topLineY: number,
  lineSpacing: number,
  clef: ClefType,
): number {
  const halfStepsFromTop = getTopLineDiatonic(clef) - pitchToDiatonic(pitch);
  return topLineY + (halfStepsFromTop * lineSpacing) / 2;
}

/**
 * Format a Pitch as a VexFlow key string, e.g. 'c/4', 'f#/5', 'bb/3'.
 * Note: VexFlow expects accidental in the key for pitch awareness, while the visual Accidental
 * modifier is added separately via addModifier(new Accidental(...)).
 */
export function pitchToVexKey(pitch: Pitch): string {
  const step = pitch.step.toLowerCase();
  return `${step}/${pitch.octave}`;
}

export function isSamePitchPosition(a: Pick<Pitch, 'step' | 'octave'>, b: Pick<Pitch, 'step' | 'octave'>): boolean {
  return a.step === b.step && a.octave === b.octave;
}

export function sortPitchesAscending(pitches: Pitch[]): Pitch[] {
  return [...pitches].sort((a, b) => pitchToDiatonic(a) - pitchToDiatonic(b));
}

export function shiftPitchDiatonic(pitch: Pitch, deltaSteps: number): Pitch {
  const next = diatonicToPitch(pitchToDiatonic(pitch) + deltaSteps);
  return {
    ...pitch,
    step: next.step,
    octave: next.octave,
  };
}

export function formatPitchLabel(pitch: Pitch): string {
  const acc = pitch.accidental === '#' ? '♯' : pitch.accidental === 'b' ? '♭' : pitch.accidental === 'n' ? '♮' : '';
  return `${pitch.step}${acc}${pitch.octave}`;
}

/**
 * Default rest position key for VexFlow so rests sit centered on the staff.
 */
export function getRestKeyForClef(clef: ClefType): string {
  return clef === 'treble' ? 'b/4' : 'd/3';
}

const STEP_SEMITONES: Record<PitchStep, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const SHARP_ORDER: PitchStep[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER: PitchStep[] = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

const KEY_SIGNATURE_COUNT: Record<string, number> = {
  C: 0,
  G: 1,
  D: 2,
  A: 3,
  E: 4,
  B: 5,
  'F#': 6,
  F: -1,
  Bb: -2,
  Eb: -3,
  Ab: -4,
  Db: -5,
  Gb: -6,
};

/**
 * Return the semitone offset (+1 for sharp, -1 for flat, 0 for natural) implied by a key signature for a given step.
 */
export function getKeySignatureOffset(keySignature: string, step: PitchStep): number {
  const count = KEY_SIGNATURE_COUNT[keySignature] ?? 0;
  if (count > 0) {
    return SHARP_ORDER.slice(0, count).includes(step) ? 1 : 0;
  }
  if (count < 0) {
    return FLAT_ORDER.slice(0, -count).includes(step) ? -1 : 0;
  }
  return 0;
}

export function isFlatKeySignature(keySignature: string): boolean {
  return (KEY_SIGNATURE_COUNT[keySignature] ?? 0) < 0;
}

/**
 * Convert a Pitch to a MIDI note number (C4 = 60), respecting key signature and optional
 * measure-local accidental state (keyed by `${step}${octave}`).
 */
export function pitchToMidi(
  pitch: Pitch,
  keySignature = 'C',
  measureAccidentals?: Map<string, number>,
): number {
  const key = `${pitch.step}${pitch.octave}`;
  let offset: number;
  if (pitch.accidental === '#') {
    offset = 1;
    measureAccidentals?.set(key, 1);
  } else if (pitch.accidental === 'b') {
    offset = -1;
    measureAccidentals?.set(key, -1);
  } else if (pitch.accidental === 'n') {
    offset = 0;
    measureAccidentals?.set(key, 0);
  } else if (measureAccidentals?.has(key)) {
    offset = measureAccidentals.get(key)!;
  } else {
    offset = getKeySignatureOffset(keySignature, pitch.step);
  }

  return (pitch.octave + 1) * 12 + STEP_SEMITONES[pitch.step] + offset;
}

const MIDI_TO_SHARP_PITCH: { step: PitchStep; accidental?: Accidental }[] = [
  { step: 'C' },
  { step: 'C', accidental: '#' },
  { step: 'D' },
  { step: 'D', accidental: '#' },
  { step: 'E' },
  { step: 'F' },
  { step: 'F', accidental: '#' },
  { step: 'G' },
  { step: 'G', accidental: '#' },
  { step: 'A' },
  { step: 'A', accidental: '#' },
  { step: 'B' },
];

const MIDI_TO_FLAT_PITCH: { step: PitchStep; accidental?: Accidental }[] = [
  { step: 'C' },
  { step: 'D', accidental: 'b' },
  { step: 'D' },
  { step: 'E', accidental: 'b' },
  { step: 'E' },
  { step: 'F' },
  { step: 'G', accidental: 'b' },
  { step: 'G' },
  { step: 'A', accidental: 'b' },
  { step: 'A' },
  { step: 'B', accidental: 'b' },
  { step: 'B' },
];

/**
 * Convert a MIDI note number (0..127) to a Pitch.
 */
export function midiToPitch(midi: number, preferFlats = false): Pitch {
  const clamped = Math.max(0, Math.min(127, Math.round(midi)));
  const octave = Math.floor(clamped / 12) - 1;
  const pc = ((clamped % 12) + 12) % 12;
  const table = preferFlats ? MIDI_TO_FLAT_PITCH : MIDI_TO_SHARP_PITCH;
  const entry = table[pc];
  return entry.accidental
    ? { step: entry.step, octave, accidental: entry.accidental }
    : { step: entry.step, octave };
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export const DYNAMIC_TO_VELOCITY: Record<DynamicMark, number> = {
  pp: 0.24,
  p: 0.38,
  mp: 0.52,
  mf: 0.66,
  f: 0.82,
  ff: 0.96,
};
