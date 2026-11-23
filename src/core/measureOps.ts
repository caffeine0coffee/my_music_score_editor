import type { Accidental, NoteEvent, Pitch, TupletInfo } from '../types/score';
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
