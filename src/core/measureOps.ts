import type { Accidental, DynamicMark, NoteEvent, Pitch, TupletInfo, Voice } from '../types/score';
import { isSamePitchPosition, shiftPitchDiatonic, sortPitchesAscending } from './pitch';
import { largestFittingDuration } from './rhythm';

export interface PlaceNoteParams {
  startTick: number;
  durationTick: number;
  tuplet?: TupletInfo;
  pitch: Pitch;
  chordMode: boolean;
  measureTicks: number;
  generateId: () => string;
}

export interface PlaceNoteResult {
  notes: NoteEvent[];
  selectedNoteId: string | null;
}

/**
 * Place or modify a note in a measure's NoteEvent list (pure function).
 * - Single-note mode: overwrites pitch & duration at `startTick`.
 * - Chord mode: adds pitch to existing event at `startTick`, or removes it if already present.
 * - Resolves overlaps with earlier/later notes cleanly.
 */
export function placeNoteInMeasure(
  existingNotes: NoteEvent[],
  params: PlaceNoteParams,
): PlaceNoteResult {
  const { startTick, pitch, chordMode, measureTicks, generateId } = params;

  if (startTick < 0 || startTick >= measureTicks) {
    return { notes: existingNotes, selectedNoteId: null };
  }

  // Clamp duration if it exceeds the end of the measure
  const maxAvailable = measureTicks - startTick;
  let durationTick = params.durationTick;
  let tuplet = params.tuplet;
  if (durationTick > maxAvailable) {
    const fitted = largestFittingDuration(maxAvailable, Boolean(tuplet));
    if (!fitted) {
      return { notes: existingNotes, selectedNoteId: null };
    }
    durationTick = fitted.durationTick;
    tuplet = fitted.tuplet;
  }

  const existingAtTick = existingNotes.find((n) => n.startTick === startTick);

  // Chord mode on an existing note at the exact same tick
  if (chordMode && existingAtTick) {
    const alreadyExists = existingAtTick.pitches.some((p) => isSamePitchPosition(p, pitch));
    if (alreadyExists) {
      const remainingPitches = existingAtTick.pitches.filter((p) => !isSamePitchPosition(p, pitch));
      if (remainingPitches.length === 0) {
        // Delete the whole event
        return {
          notes: existingNotes.filter((n) => n.id !== existingAtTick.id),
          selectedNoteId: null,
        };
      }
      const updated = existingNotes.map((n) =>
        n.id === existingAtTick.id ? { ...n, pitches: sortPitchesAscending(remainingPitches) } : n,
      );
      return { notes: updated, selectedNoteId: existingAtTick.id };
    } else {
      const nextPitches = sortPitchesAscending([...existingAtTick.pitches, pitch]);
      const updated = existingNotes.map((n) =>
        n.id === existingAtTick.id ? { ...n, pitches: nextPitches } : n,
      );
      return { notes: updated, selectedNoteId: existingAtTick.id };
    }
  }

  // Single-note overwrite mode (or creating a new note at an empty tick)
  const targetId = existingAtTick ? existingAtTick.id : generateId();
  const newEvent: NoteEvent = {
    id: targetId,
    startTick,
    durationTick,
    ...(tuplet ? { tuplet } : {}),
    pitches: [pitch],
  };

  const endTick = startTick + durationTick;
  const result: NoteEvent[] = [];

  for (const note of existingNotes) {
    if (note.id === targetId) continue;

    // Note starts inside [startTick, endTick) -> overwritten
    if (note.startTick >= startTick && note.startTick < endTick) {
      continue;
    }

    // Earlier note overlaps into our new note -> truncate earlier note
    if (note.startTick < startTick && note.startTick + note.durationTick > startTick) {
      const availableForEarlier = startTick - note.startTick;
      const fitted = largestFittingDuration(availableForEarlier, Boolean(note.tuplet));
      if (fitted) {
        result.push({
          ...note,
          durationTick: fitted.durationTick,
          tuplet: fitted.tuplet,
        });
      }
      continue;
    }

    result.push(note);
  }

  result.push(newEvent);
  result.sort((a, b) => a.startTick - b.startTick);

  return {
    notes: result,
    selectedNoteId: targetId,
  };
}

export function deleteNoteFromMeasure(notes: NoteEvent[], noteId: string): NoteEvent[] {
  return notes.filter((n) => n.id !== noteId);
}

export function shiftNoteInMeasure(
  notes: NoteEvent[],
  noteId: string,
  deltaSteps: number,
): NoteEvent[] {
  return notes.map((n) => {
    if (n.id !== noteId) return n;
    return {
      ...n,
      pitches: sortPitchesAscending(n.pitches.map((p) => shiftPitchDiatonic(p, deltaSteps))),
    };
  });
}

export function setNoteAccidentalInMeasure(
  notes: NoteEvent[],
  noteId: string,
  accidental: Accidental | undefined,
): NoteEvent[] {
  return notes.map((n) => {
    if (n.id !== noteId) return n;
    return {
      ...n,
      pitches: n.pitches.map((p) => {
        if (accidental === undefined) {
          const { accidental: _removed, ...rest } = p;
          return rest;
        }
        return { ...p, accidental };
      }),
    };
  });
}

/**
 * Clamp all notes in a measure so they fit within a new `measureTicks` (e.g. after changing time signature).
 */
export function clampNotesToMeasureTicks(notes: NoteEvent[], measureTicks: number): NoteEvent[] {
  const result: NoteEvent[] = [];
  for (const note of notes) {
    if (note.startTick >= measureTicks) continue;
    if (note.startTick + note.durationTick <= measureTicks) {
      result.push(note);
    } else {
      const fitted = largestFittingDuration(measureTicks - note.startTick, Boolean(note.tuplet));
      if (fitted) {
        result.push({
          ...note,
          durationTick: fitted.durationTick,
          tuplet: fitted.tuplet,
        });
      }
    }
  }
  return result.sort((a, b) => a.startTick - b.startTick);
}

export function cloneNoteWithNewId(note: NoteEvent, generateId: () => string): NoteEvent {
  return {
    ...note,
    id: generateId(),
    pitches: note.pitches.map((p) => ({ ...p })),
    ...(note.tuplet ? { tuplet: { ...note.tuplet } } : {}),
  };
}

/**
 * Copy note lists for a range of measures [startMeasure, endMeasure] (inclusive).
 */
export function copyMeasuresFromVoice(
  voice: Voice,
  startMeasure: number,
  endMeasure: number,
): NoteEvent[][] {
  const from = Math.max(0, Math.min(startMeasure, endMeasure));
  const to = Math.min(voice.measures.length - 1, Math.max(startMeasure, endMeasure));
  const copied: NoteEvent[][] = [];
  for (let m = from; m <= to; m++) {
    const notes = voice.measures[m]?.notes ?? [];
    copied.push(
      notes.map((n) => ({
        ...n,
        pitches: n.pitches.map((p) => ({ ...p })),
        ...(n.tuplet ? { tuplet: { ...n.tuplet } } : {}),
      })),
    );
  }
  return copied;
}

/**
 * Paste copied measure note lists into a voice starting at `targetStartMeasure`.
 * Returns a new Voice (pure function).
 */
export function pasteMeasuresIntoVoice(
  voice: Voice,
  targetStartMeasure: number,
  copiedMeasures: NoteEvent[][],
  measureTicks: number,
  generateId: () => string,
): Voice {
  const nextMeasures = voice.measures.map((m) => ({ ...m, notes: m.notes }));
  for (let offset = 0; offset < copiedMeasures.length; offset++) {
    const destIdx = targetStartMeasure + offset;
    if (destIdx < 0 || destIdx >= nextMeasures.length) break;
    const cloned = copiedMeasures[offset].map((n) => cloneNoteWithNewId(n, generateId));
    nextMeasures[destIdx] = {
      measureIndex: destIdx,
      notes: clampNotesToMeasureTicks(cloned, measureTicks),
    };
  }
  return {
    ...voice,
    measures: nextMeasures,
  };
}

/**
 * Merge a set of pasted notes into an existing measure's notes, resolving overlaps cleanly.
 */
export function pasteNotesIntoMeasure(
  existingNotes: NoteEvent[],
  notesToPaste: NoteEvent[],
  measureTicks: number,
  generateId: () => string,
): { notes: NoteEvent[]; pastedNoteIds: string[] } {
  const pastedClones = clampNotesToMeasureTicks(
    notesToPaste.map((n) => cloneNoteWithNewId(n, generateId)),
    measureTicks,
  );
  if (pastedClones.length === 0) {
    return { notes: existingNotes, pastedNoteIds: [] };
  }

  let current = [...existingNotes];
  for (const incoming of pastedClones) {
    const endTick = incoming.startTick + incoming.durationTick;
    const next: NoteEvent[] = [];
    for (const note of current) {
      if (note.startTick >= incoming.startTick && note.startTick < endTick) {
        continue;
      }
      if (note.startTick < incoming.startTick && note.startTick + note.durationTick > incoming.startTick) {
        const available = incoming.startTick - note.startTick;
        const fitted = largestFittingDuration(available, Boolean(note.tuplet));
        if (fitted) {
          next.push({
            ...note,
            durationTick: fitted.durationTick,
            tuplet: fitted.tuplet,
          });
        }
        continue;
      }
      next.push(note);
    }
    next.push(incoming);
    current = next;
  }

  current.sort((a, b) => a.startTick - b.startTick);
  return {
    notes: current,
    pastedNoteIds: pastedClones.map((n) => n.id),
  };
}

export function toggleNoteTieInMeasure(notes: NoteEvent[], noteId: string): NoteEvent[] {
  return notes.map((n) => {
    if (n.id !== noteId) return n;
    return {
      ...n,
      tieToNext: !n.tieToNext,
    };
  });
}

export function setNoteDynamicInMeasure(
  notes: NoteEvent[],
  noteId: string,
  dynamic: DynamicMark | null,
): NoteEvent[] {
  return notes.map((n) => {
    if (n.id !== noteId) return n;
    if (dynamic === null || n.dynamic === dynamic) {
      const { dynamic: _removed, ...rest } = n;
      return rest;
    }
    return { ...n, dynamic };
  });
}

export interface VoiceNoteLocation {
  measureIndex: number;
  noteIndex: number;
  note: NoteEvent;
}

/**
 * Find the immediately following note in the same voice (same measure or subsequent measures).
 */
export function findNextNoteInVoice(
  voice: Voice,
  measureIndex: number,
  noteId: string,
): VoiceNoteLocation | null {
  const m = voice.measures[measureIndex];
  if (!m) return null;
  const idx = m.notes.findIndex((n) => n.id === noteId);
  if (idx === -1) return null;

  if (idx + 1 < m.notes.length) {
    return { measureIndex, noteIndex: idx + 1, note: m.notes[idx + 1] };
  }

  for (let nextM = measureIndex + 1; nextM < voice.measures.length; nextM++) {
    const nextNotes = voice.measures[nextM]?.notes ?? [];
    if (nextNotes.length > 0) {
      return { measureIndex: nextM, noteIndex: 0, note: nextNotes[0] };
    }
  }
  return null;
}

/**
 * Toggle slur on selected note(s) within a voice.
 * - Single note selected: toggles slur from this note to the next note in the voice.
 * - Multiple notes selected: toggles slur from earliest selected note to latest selected note.
 */
export function toggleSlurInVoice(
  voice: Voice,
  targets: { measureIndex: number; noteId: string }[],
): Voice {
  if (targets.length === 0) return voice;

  const resolved: { measureIndex: number; startTick: number; noteId: string; note: NoteEvent }[] = [];
  for (const t of targets) {
    const m = voice.measures[t.measureIndex];
    const note = m?.notes.find((n) => n.id === t.noteId);
    if (note) {
      resolved.push({
        measureIndex: t.measureIndex,
        startTick: note.startTick,
        noteId: note.id,
        note,
      });
    }
  }
  if (resolved.length === 0) return voice;

  resolved.sort((a, b) =>
    a.measureIndex !== b.measureIndex ? a.measureIndex - b.measureIndex : a.startTick - b.startTick,
  );

  let startRef = { measureIndex: resolved[0].measureIndex, noteId: resolved[0].noteId };
  let endRef: { measureIndex: number; noteId: string } | null = null;
  let shouldClear = false;

  if (resolved.length === 1) {
    const single = resolved[0];
    if (single.note.slurStart) {
      shouldClear = true;
      // Also find the next slurEnd to clear it cleanly
      const next = findNextNoteInVoice(voice, single.measureIndex, single.noteId);
      if (next?.note.slurEnd) {
        endRef = { measureIndex: next.measureIndex, noteId: next.note.id };
      }
    } else {
      const next = findNextNoteInVoice(voice, single.measureIndex, single.noteId);
      if (!next) return voice;
      endRef = { measureIndex: next.measureIndex, noteId: next.note.id };
    }
  } else {
    const first = resolved[0];
    const last = resolved[resolved.length - 1];
    endRef = { measureIndex: last.measureIndex, noteId: last.noteId };
    if (first.note.slurStart && last.note.slurEnd) {
      shouldClear = true;
    }
  }

  return {
    ...voice,
    measures: voice.measures.map((m) => {
      const touchesStart = m.measureIndex === startRef.measureIndex;
      const touchesEnd = endRef !== null && m.measureIndex === endRef.measureIndex;
      if (!touchesStart && !touchesEnd) return m;

      return {
        ...m,
        notes: m.notes.map((n) => {
          let nextNote = n;
          if (touchesStart && n.id === startRef.noteId) {
            if (shouldClear) {
              const { slurStart: _s, ...rest } = nextNote;
              nextNote = rest;
            } else {
              nextNote = { ...nextNote, slurStart: true };
            }
          }
          if (touchesEnd && endRef && n.id === endRef.noteId) {
            if (shouldClear) {
              const { slurEnd: _e, ...rest } = nextNote;
              nextNote = rest;
            } else {
              nextNote = { ...nextNote, slurEnd: true };
            }
          }
          return nextNote;
        }),
      };
    }),
  };
}
