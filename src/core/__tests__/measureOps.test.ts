import { describe, expect, it } from 'vitest';
import {
  copyMeasuresFromVoice,
  findNextNoteInVoice,
  pasteMeasuresIntoVoice,
  pasteNotesIntoMeasure,
  placeNoteInMeasure,
  setNoteDynamicInMeasure,
  toggleNoteTieInMeasure,
  toggleSlurInVoice,
} from '../measureOps';
import type { NoteEvent, Voice } from '../../types/score';

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

function makeVoice(measuresNotes: NoteEvent[][]): Voice {
  return {
    id: 'v1',
    index: 0,
    color: '#1e3a8a',
    measures: measuresNotes.map((notes, i) => ({ measureIndex: i, notes })),
  };
}

describe('measureOps clipboard & notation helpers', () => {
  it('copies and pastes measures into another voice with fresh note IDs', () => {
    const src = makeVoice([
      [{ id: 'a1', startTick: 0, durationTick: 480, pitches: [{ step: 'C', octave: 4 }] }],
      [{ id: 'a2', startTick: 480, durationTick: 480, pitches: [{ step: 'D', octave: 4 }] }],
      [],
    ]);
    const dest = makeVoice([[], [], []]);

    const copied = copyMeasuresFromVoice(src, 0, 1);
    expect(copied).toHaveLength(2);

    const pasted = pasteMeasuresIntoVoice(dest, 1, copied, 1920, genId);
    expect(pasted.measures[0].notes).toHaveLength(0);
    expect(pasted.measures[1].notes).toHaveLength(1);
    expect(pasted.measures[1].notes[0].id).not.toBe('a1');
    expect(pasted.measures[1].notes[0].pitches).toEqual([{ step: 'C', octave: 4 }]);
    expect(pasted.measures[2].notes[0].pitches).toEqual([{ step: 'D', octave: 4 }]);
  });

  it('merges pasted notes into a measure and resolves overlaps', () => {
    const existing: NoteEvent[] = [
      { id: 'e1', startTick: 0, durationTick: 960, pitches: [{ step: 'C', octave: 4 }] },
      { id: 'e2', startTick: 1440, durationTick: 480, pitches: [{ step: 'G', octave: 4 }] },
    ];
    const incoming: NoteEvent[] = [
      { id: 'p1', startTick: 480, durationTick: 480, pitches: [{ step: 'E', octave: 4 }] },
    ];

    const res = pasteNotesIntoMeasure(existing, incoming, 1920, genId);
    expect(res.notes).toHaveLength(3);
    expect(res.notes[0]).toMatchObject({ id: 'e1', startTick: 0, durationTick: 480 });
    expect(res.notes[1]).toMatchObject({ startTick: 480, durationTick: 480 });
    expect(res.notes[2]).toMatchObject({ id: 'e2', startTick: 1440, durationTick: 480 });
  });

  it('toggles tie and dynamic marks on a note', () => {
    const notes: NoteEvent[] = [
      { id: 'n1', startTick: 0, durationTick: 480, pitches: [{ step: 'C', octave: 4 }] },
    ];
    const tied = toggleNoteTieInMeasure(notes, 'n1');
    expect(tied[0].tieToNext).toBe(true);
    const untied = toggleNoteTieInMeasure(tied, 'n1');
    expect(untied[0].tieToNext).toBe(false);

    const withMf = setNoteDynamicInMeasure(notes, 'n1', 'mf');
    expect(withMf[0].dynamic).toBe('mf');
    const toggledOff = setNoteDynamicInMeasure(withMf, 'n1', 'mf');
    expect(toggledOff[0].dynamic).toBeUndefined();
  });

  it('finds next note across measures and toggles slur across single or multiple notes', () => {
    const voice = makeVoice([
      [{ id: 'm0n0', startTick: 0, durationTick: 480, pitches: [{ step: 'C', octave: 4 }] }],
      [
        { id: 'm1n0', startTick: 0, durationTick: 480, pitches: [{ step: 'D', octave: 4 }] },
        { id: 'm1n1', startTick: 480, durationTick: 480, pitches: [{ step: 'E', octave: 4 }] },
      ],
    ]);

    const next = findNextNoteInVoice(voice, 0, 'm0n0');
    expect(next?.measureIndex).toBe(1);
    expect(next?.note.id).toBe('m1n0');

    // Single note selected -> slur to next note across measure boundary
    const slurredSingle = toggleSlurInVoice(voice, [{ measureIndex: 0, noteId: 'm0n0' }]);
    expect(slurredSingle.measures[0].notes[0].slurStart).toBe(true);
    expect(slurredSingle.measures[1].notes[0].slurEnd).toBe(true);

    // Toggle off
    const unslurred = toggleSlurInVoice(slurredSingle, [{ measureIndex: 0, noteId: 'm0n0' }]);
    expect(unslurred.measures[0].notes[0].slurStart).toBeUndefined();
    expect(unslurred.measures[1].notes[0].slurEnd).toBeUndefined();

    // Multi-note selection -> slur from earliest to latest
    const slurredMulti = toggleSlurInVoice(voice, [
      { measureIndex: 1, noteId: 'm1n1' },
      { measureIndex: 0, noteId: 'm0n0' },
    ]);
    expect(slurredMulti.measures[0].notes[0].slurStart).toBe(true);
    expect(slurredMulti.measures[1].notes[1].slurEnd).toBe(true);
  });
});
