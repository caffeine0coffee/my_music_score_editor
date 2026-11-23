import { describe, expect, it } from 'vitest';
import {
  diatonicToPitch,
  pitchToDiatonic,
  pitchToY,
  shiftPitchDiatonic,
  sortPitchesAscending,
  yToPitch,
} from '../pitch';

describe('pitch utilities', () => {
  it('converts between pitch and diatonic index round-trip', () => {
    const samples = [
      { step: 'C' as const, octave: 4 },
      { step: 'F' as const, octave: 5 },
      { step: 'A' as const, octave: 3 },
      { step: 'B' as const, octave: 2 },
    ];
    for (const p of samples) {
      expect(diatonicToPitch(pitchToDiatonic(p))).toEqual(p);
    }
  });

  it('maps Y coordinates accurately for treble clef', () => {
    const topLineY = 100;
    const lineSpacing = 10;
    // Line 0 = F5
    expect(yToPitch(100, topLineY, lineSpacing, 'treble').pitch).toEqual({ step: 'F', octave: 5 });
    // Middle line (line 2, y = 120) = B4
    expect(yToPitch(120, topLineY, lineSpacing, 'treble').pitch).toEqual({ step: 'B', octave: 4 });
    // Bottom line (line 4, y = 140) = E4
    expect(yToPitch(140, topLineY, lineSpacing, 'treble').pitch).toEqual({ step: 'E', octave: 4 });
    // First ledger line below (line 5, y = 150) = C4
    expect(yToPitch(150, topLineY, lineSpacing, 'treble').pitch).toEqual({ step: 'C', octave: 4 });
    expect(pitchToY({ step: 'C', octave: 4 }, topLineY, lineSpacing, 'treble')).toBe(150);
  });

  it('maps Y coordinates accurately for bass clef', () => {
    const topLineY = 100;
    const lineSpacing = 10;
    // Line 0 = A3
    expect(yToPitch(100, topLineY, lineSpacing, 'bass').pitch).toEqual({ step: 'A', octave: 3 });
    // Middle line (line 2, y = 120) = D3
    expect(yToPitch(120, topLineY, lineSpacing, 'bass').pitch).toEqual({ step: 'D', octave: 3 });
    // Bottom line (line 4, y = 140) = G2
    expect(yToPitch(140, topLineY, lineSpacing, 'bass').pitch).toEqual({ step: 'G', octave: 2 });
  });

  it('shifts pitch diatonically preserving accidental', () => {
    expect(shiftPitchDiatonic({ step: 'B', octave: 4, accidental: '#' }, 1)).toEqual({
      step: 'C',
      octave: 5,
      accidental: '#',
    });
    expect(shiftPitchDiatonic({ step: 'C', octave: 4 }, -1)).toEqual({
      step: 'B',
      octave: 3,
    });
  });

  it('sorts pitches low to high', () => {
    const sorted = sortPitchesAscending([
      { step: 'G', octave: 4 },
      { step: 'C', octave: 4 },
      { step: 'E', octave: 4 },
    ]);
    expect(sorted.map((p) => `${p.step}${p.octave}`)).toEqual(['C4', 'E4', 'G4']);
  });
});
