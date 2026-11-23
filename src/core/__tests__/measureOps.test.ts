import { describe, expect, it } from 'vitest';
import { placeNoteInMeasure } from '../measureOps';
import type { NoteEvent } from '../../types/score';

let idCounter = 0;
const genId = () => `id-${++idCounter}`;

describe('measureOps.placeNoteInMeasure', () => {
  it('places a note in an empty measure', () => {
    const res = placeNoteInMeasure([], {
      startTick: 0,
      durationTick: 480,
      pitch: { step: 'C', octave: 4 },
      chordMode: false,
      measureTicks: 1920,
      generateId: genId,
    });
    expect(res.notes).toHaveLength(1);
    expect(res.notes[0].pitches).toEqual([{ step: 'C', octave: 4 }]);
  });

  it('overwrites pitch at the same tick in single-note mode', () => {
    const initial: NoteEvent[] = [
      { id: 'n1', startTick: 480, durationTick: 480, pitches: [{ step: 'C', octave: 4 }] },
    ];
    const res = placeNoteInMeasure(initial, {
      startTick: 480,
      durationTick: 480,
      pitch: { step: 'G', octave: 4 },
      chordMode: false,
      measureTicks: 1920,
      generateId: genId,
    });
    expect(res.notes).toHaveLength(1);
    expect(res.notes[0].id).toBe('n1');
    expect(res.notes[0].pitches).toEqual([{ step: 'G', octave: 4 }]);
  });

  it('adds and removes pitches at the same tick in chord mode', () => {
    const initial: NoteEvent[] = [
      { id: 'n1', startTick: 0, durationTick: 480, pitches: [{ step: 'C', octave: 4 }] },
    ];
    // Add E4
    const added = placeNoteInMeasure(initial, {
      startTick: 0,
      durationTick: 480,
      pitch: { step: 'E', octave: 4 },
      chordMode: true,
      measureTicks: 1920,
      generateId: genId,
    });
    expect(added.notes[0].pitches).toEqual([
      { step: 'C', octave: 4 },
      { step: 'E', octave: 4 },
    ]);

    // Toggle C4 off
    const removed = placeNoteInMeasure(added.notes, {
      startTick: 0,
      durationTick: 480,
      pitch: { step: 'C', octave: 4 },
      chordMode: true,
      measureTicks: 1920,
      generateId: genId,
    });
    expect(removed.notes[0].pitches).toEqual([{ step: 'E', octave: 4 }]);

    // Toggle last pitch E4 off -> deletes event
    const emptied = placeNoteInMeasure(removed.notes, {
      startTick: 0,
      durationTick: 480,
      pitch: { step: 'E', octave: 4 },
      chordMode: true,
      measureTicks: 1920,
      generateId: genId,
    });
    expect(emptied.notes).toHaveLength(0);
    expect(emptied.selectedNoteId).toBeNull();
  });

  it('truncates earlier overlapping note and removes covered later notes', () => {
    const initial: NoteEvent[] = [
      { id: 'n1', startTick: 0, durationTick: 960, pitches: [{ step: 'C', octave: 4 }] },
      { id: 'n2', startTick: 960, durationTick: 480, pitches: [{ step: 'D', octave: 4 }] },
    ];
    // Place half note at tick 480 -> truncates n1 to 480, removes n2 at 960? Wait: 480 + 960 = 1440, covers 960!
    const res = placeNoteInMeasure(initial, {
      startTick: 480,
      durationTick: 960,
      pitch: { step: 'E', octave: 4 },
      chordMode: false,
      measureTicks: 1920,
      generateId: genId,
    });
    expect(res.notes).toHaveLength(2);
    expect(res.notes[0]).toMatchObject({ id: 'n1', startTick: 0, durationTick: 480 });
    expect(res.notes[1]).toMatchObject({ startTick: 480, durationTick: 960 });
  });

  it('clamps duration when placing a long note near the end of the measure', () => {
    const res = placeNoteInMeasure([], {
      startTick: 1440,
      durationTick: 960,
      pitch: { step: 'A', octave: 4 },
      chordMode: false,
      measureTicks: 1920,
      generateId: genId,
    });
    expect(res.notes).toHaveLength(1);
    expect(res.notes[0].durationTick).toBe(480);
  });
});
