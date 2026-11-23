import type { ClefType, Pitch, PitchStep } from '../types/score';

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
