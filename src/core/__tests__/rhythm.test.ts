import { describe, expect, it } from 'vitest';
import type { NoteEvent, TimeSignature } from '../../types/score';
import {
  computeDurationSpec,
  decomposeGapToRests,
  fillMeasureWithRests,
  getMeasureTicks,
} from '../rhythm';

const TS_4_4: TimeSignature = { beats: 4, beatType: 4 };
const TS_3_4: TimeSignature = { beats: 3, beatType: 4 };
const TS_6_8: TimeSignature = { beats: 6, beatType: 8 };

describe('rhythm & auto-rest decomposition', () => {
  it('calculates measure ticks correctly', () => {
    expect(getMeasureTicks(TS_4_4)).toBe(1920);
    expect(getMeasureTicks(TS_3_4)).toBe(1440);
    expect(getMeasureTicks(TS_6_8)).toBe(1440);
  });

  it('computes dotted and triplet duration specs', () => {
    expect(computeDurationSpec('q', false, false)).toEqual({ durationTick: 480 });
    expect(computeDurationSpec('q', true, false)).toEqual({ durationTick: 720 });
    expect(computeDurationSpec('8', false, true)).toEqual({
      durationTick: 160,
      tuplet: { numNotes: 3, notesOccupied: 2 },
    });
    expect(computeDurationSpec('q', false, true)).toEqual({
      durationTick: 320,
      tuplet: { numNotes: 3, notesOccupied: 2 },
    });
  });

  it('returns whole measure rest for empty measure', () => {
    const items = fillMeasureWithRests([], 1920, TS_4_4);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: 'rest', startTick: 0, durationTick: 1920, isWholeMeasureRest: true });
  });

  it('respects half-measure boundary in 4/4 (quarter note on beat 1 -> quarter rest + half rest)', () => {
    const notes: NoteEvent[] = [
      { id: 'n1', startTick: 0, durationTick: 480, pitches: [{ step: 'C', octave: 4 }] },
    ];
    const items = fillMeasureWithRests(notes, 1920, TS_4_4);
    expect(items.map((i) => (i.type === 'note' ? `N:${i.note.durationTick}` : `R:${i.durationTick}`))).toEqual([
      'N:480',
      'R:480',
      'R:960',
    ]);
  });

  it('fills gap before beat 3 cleanly when note is on beat 2 in 4/4', () => {
    const notes: NoteEvent[] = [
      { id: 'n1', startTick: 480, durationTick: 480, pitches: [{ step: 'D', octave: 4 }] },
    ];
    const items = fillMeasureWithRests(notes, 1920, TS_4_4);
    expect(items.map((i) => (i.type === 'note' ? `N:${i.note.durationTick}` : `R:${i.durationTick}`))).toEqual([
      'R:480',
      'N:480',
      'R:960',
    ]);
  });

  it('decomposes 8th-note triplet gaps cleanly', () => {
    const notes: NoteEvent[] = [
      {
        id: 'n1',
        startTick: 0,
        durationTick: 160,
        tuplet: { numNotes: 3, notesOccupied: 2 },
        pitches: [{ step: 'E', octave: 4 }],
      },
    ];
    const items = fillMeasureWithRests(notes, 1920, TS_4_4);
    const total = items.reduce(
      (sum, item) => sum + (item.type === 'note' ? item.note.durationTick : item.durationTick),
      0,
    );
    expect(total).toBe(1920);
    expect(items.map((i) => (i.type === 'note' ? `N:${i.note.durationTick}` : `R:${i.durationTick}`))).toEqual([
      'N:160',
      'R:160',
      'R:160',
      'R:480',
      'R:960',
    ]);
  });

  it('decomposes 8th-note triplet on 2nd slot cleanly', () => {
    const notes: NoteEvent[] = [
      {
        id: 'n1',
        startTick: 160,
        durationTick: 160,
        tuplet: { numNotes: 3, notesOccupied: 2 },
        pitches: [{ step: 'E', octave: 4 }],
      },
    ];
    const items = fillMeasureWithRests(notes, 1920, TS_4_4);
    expect(items.map((i) => (i.type === 'note' ? `N:${i.note.durationTick}` : `R:${i.durationTick}`))).toEqual([
      'R:160',
      'N:160',
      'R:160',
      'R:480',
      'R:960',
    ]);
  });

  it('decomposes quarter-note triplet gaps cleanly', () => {
    const notes: NoteEvent[] = [
      {
        id: 'n1',
        startTick: 0,
        durationTick: 320,
        tuplet: { numNotes: 3, notesOccupied: 2 },
        pitches: [{ step: 'G', octave: 4 }],
      },
    ];
    const items = fillMeasureWithRests(notes, 1920, TS_4_4);
    expect(items.map((i) => (i.type === 'note' ? `N:${i.note.durationTick}` : `R:${i.durationTick}`))).toEqual([
      'N:320',
      'R:320',
      'R:320',
      'R:960',
    ]);
  });

  it('uses dotted quarter rest on compound beats in 6/8', () => {
    const rests = decomposeGapToRests(720, 1440, 1440, TS_6_8);
    expect(rests.map((r) => r.durationTick)).toEqual([720]);
  });
});
