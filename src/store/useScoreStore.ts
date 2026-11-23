import { create } from 'zustand';
import { produce } from 'immer';
import type {
  Accidental,
  BaseDuration,
  ClefType,
  Pitch,
  Score,
  TimeSignature,
} from '../types/score';
import { MAX_UNDO_HISTORY } from '../core/constants';
import {
  clampNotesToMeasureTicks,
  deleteNoteFromMeasure,
  placeNoteInMeasure,
  setNoteAccidentalInMeasure,
  shiftNoteInMeasure,
} from '../core/measureOps';
import { computeDurationSpec, getMeasureTicks } from '../core/rhythm';
import { createInitialScore, generateId } from '../core/scoreFactory';
import { localScoreRepository } from '../repository/LocalStorageScoreRepository';

export interface SelectedNoteRef {
  staffIndex: number;
  voiceIndex: number;
  measureIndex: number;
  noteId: string;
}

interface ScoreStoreState {
  score: Score;
  past: Score[];
  future: Score[];

  activeStaffIndex: number;
  activeVoiceIndex: number;

  selectedDuration: BaseDuration;
  dotted: boolean;
  triplet: boolean;
  selectedAccidental: Accidental | null;
  chordMode: boolean;

  selectedNote: SelectedNoteRef | null;

  // Tool actions
  setSelectedDuration: (duration: BaseDuration) => void;
  toggleDotted: () => void;
  toggleTriplet: () => void;
  toggleAccidental: (acc: Accidental) => void;
  toggleChordMode: () => void;
  setSelectedNote: (ref: SelectedNoteRef | null) => void;

  // Score editing actions (all undoable)
  placeNote: (measureIndex: number, startTick: number, pitch: Pitch, forceChordMode?: boolean) => void;
  deleteSelectedNote: () => void;
  deleteNoteAt: (measureIndex: number, noteId: string) => void;
  shiftSelectedNote: (deltaSteps: number) => void;

  setClef: (clef: ClefType) => void;
  setKeySignature: (keySignature: string) => void;
  setTimeSignature: (ts: TimeSignature) => void;
  setTempo: (tempo: number) => void;
  addMeasure: () => void;
  removeLastMeasure: () => void;
  resetScore: () => void;

  // History
  undo: () => void;
  redo: () => void;

  // Persistence
  hydrate: () => Promise<void>;
}

function pushHistory(past: Score[], current: Score): Score[] {
  const next = [...past, current];
  if (next.length > MAX_UNDO_HISTORY) {
    return next.slice(next.length - MAX_UNDO_HISTORY);
  }
  return next;
}

function persistScore(score: Score): void {
  void localScoreRepository.saveScore(score);
}

export const useScoreStore = create<ScoreStoreState>((set, get) => {
  const commit = (updater: (draft: Score) => void, nextSelectedNote?: SelectedNoteRef | null) => {
    const state = get();
    const nextScore = produce(state.score, (draft) => {
      updater(draft);
      draft.updatedAt = new Date().toISOString();
    });
    if (nextScore === state.score) return;

    set({
      score: nextScore,
      past: pushHistory(state.past, state.score),
      future: [],
      ...(nextSelectedNote !== undefined ? { selectedNote: nextSelectedNote } : {}),
    });
    persistScore(nextScore);
  };

  return {
    score: createInitialScore(),
    past: [],
    future: [],

    activeStaffIndex: 0,
    activeVoiceIndex: 0,

    selectedDuration: 'q',
    dotted: false,
    triplet: false,
    selectedAccidental: null,
    chordMode: false,

    selectedNote: null,

    setSelectedDuration: (duration) => {
      set((state) => ({
        selectedDuration: duration,
        // Whole note cannot be dotted or triplet
        dotted: duration === 'w' ? false : state.dotted,
        triplet: duration === 'w' ? false : state.triplet,
      }));
    },

    toggleDotted: () => {
      set((state) => {
        if (state.selectedDuration === 'w') return state;
        const nextDotted = !state.dotted;
        return {
          dotted: nextDotted,
          triplet: nextDotted ? false : state.triplet,
        };
      });
    },

    toggleTriplet: () => {
      set((state) => {
        if (state.selectedDuration === 'w') return state;
        const nextTriplet = !state.triplet;
        return {
          triplet: nextTriplet,
          dotted: nextTriplet ? false : state.dotted,
        };
      });
    },

    toggleAccidental: (acc) => {
      const state = get();
      const nextAcc = state.selectedAccidental === acc ? null : acc;
      set({ selectedAccidental: nextAcc });

      // If a note is currently selected, also update its accidental directly
      if (state.selectedNote) {
        const { staffIndex, voiceIndex, measureIndex, noteId } = state.selectedNote;
        commit((draft) => {
          const measure = draft.staves[staffIndex]?.voices[voiceIndex]?.measures[measureIndex];
          if (!measure) return;
          const target = measure.notes.find((n) => n.id === noteId);
          if (!target) return;
          // Toggle off if all pitches already have this accidental, else apply
          const allHave = target.pitches.every((p) => p.accidental === acc);
          measure.notes = setNoteAccidentalInMeasure(
            measure.notes,
            noteId,
            allHave ? undefined : acc,
          );
        });
      }
    },

    toggleChordMode: () => {
      set((state) => ({ chordMode: !state.chordMode }));
    },

    setSelectedNote: (ref) => {
      set({ selectedNote: ref });
    },

    placeNote: (measureIndex, startTick, pitch, forceChordMode) => {
      const state = get();
      const { activeStaffIndex, activeVoiceIndex, selectedDuration, dotted, triplet, selectedAccidental } = state;
      const chordMode = forceChordMode ?? state.chordMode;
      const measureTicks = getMeasureTicks(state.score.timeSignature);
      const { durationTick, tuplet } = computeDurationSpec(selectedDuration, dotted, triplet);

      const pitchWithAcc: Pitch = selectedAccidental
        ? { ...pitch, accidental: selectedAccidental }
        : { step: pitch.step, octave: pitch.octave };

      let placedId: string | null = null;
      commit((draft) => {
        const measure = draft.staves[activeStaffIndex]?.voices[activeVoiceIndex]?.measures[measureIndex];
        if (!measure) return;
        const result = placeNoteInMeasure(measure.notes, {
          startTick,
          durationTick,
          tuplet,
          pitch: pitchWithAcc,
          chordMode,
          measureTicks,
          generateId: () => generateId('note'),
        });
        measure.notes = result.notes;
        placedId = result.selectedNoteId;
      });

      set({
        selectedNote: placedId
          ? {
              staffIndex: activeStaffIndex,
              voiceIndex: activeVoiceIndex,
              measureIndex,
              noteId: placedId,
            }
          : null,
      });
    },

    deleteSelectedNote: () => {
      const state = get();
      if (!state.selectedNote) return;
      const { staffIndex, voiceIndex, measureIndex, noteId } = state.selectedNote;
      commit(
        (draft) => {
          const measure = draft.staves[staffIndex]?.voices[voiceIndex]?.measures[measureIndex];
          if (!measure) return;
          measure.notes = deleteNoteFromMeasure(measure.notes, noteId);
        },
        null,
      );
    },

    deleteNoteAt: (measureIndex, noteId) => {
      const state = get();
      const { activeStaffIndex, activeVoiceIndex } = state;
      const shouldClearSelection = state.selectedNote?.noteId === noteId;
      commit(
        (draft) => {
          const measure = draft.staves[activeStaffIndex]?.voices[activeVoiceIndex]?.measures[measureIndex];
          if (!measure) return;
          measure.notes = deleteNoteFromMeasure(measure.notes, noteId);
        },
        shouldClearSelection ? null : undefined,
      );
    },

    shiftSelectedNote: (deltaSteps) => {
      const state = get();
      if (!state.selectedNote) return;
      const { staffIndex, voiceIndex, measureIndex, noteId } = state.selectedNote;
      commit((draft) => {
        const measure = draft.staves[staffIndex]?.voices[voiceIndex]?.measures[measureIndex];
        if (!measure) return;
        measure.notes = shiftNoteInMeasure(measure.notes, noteId, deltaSteps);
      });
    },

    setClef: (clef) => {
      const { activeStaffIndex } = get();
      commit((draft) => {
        const staff = draft.staves[activeStaffIndex];
        if (staff) {
          staff.clef = clef;
        }
      });
    },

    setKeySignature: (keySignature) => {
      commit((draft) => {
        draft.keySignature = keySignature;
      });
    },

    setTimeSignature: (ts) => {
      const newMeasureTicks = getMeasureTicks(ts);
      commit((draft) => {
        draft.timeSignature = { ...ts };
        for (const staff of draft.staves) {
          for (const voice of staff.voices) {
            for (const m of voice.measures) {
              m.notes = clampNotesToMeasureTicks(m.notes, newMeasureTicks);
            }
          }
        }
      });
    },

    setTempo: (tempo) => {
      const clamped = Math.max(20, Math.min(300, Math.round(tempo)));
      commit((draft) => {
        draft.tempo = clamped;
      });
    },

    addMeasure: () => {
      commit((draft) => {
        const nextIndex = draft.measureMeta.length;
        draft.measureMeta.push({ index: nextIndex });
        for (const staff of draft.staves) {
          for (const voice of staff.voices) {
            voice.measures.push({ measureIndex: nextIndex, notes: [] });
          }
        }
      });
    },

    removeLastMeasure: () => {
      const state = get();
      if (state.score.measureMeta.length <= 1) return;
      const removedIndex = state.score.measureMeta.length - 1;
      const clearSelection = state.selectedNote?.measureIndex === removedIndex;
      commit(
        (draft) => {
          draft.measureMeta.pop();
          for (const staff of draft.staves) {
            for (const voice of staff.voices) {
              voice.measures.pop();
            }
          }
        },
        clearSelection ? null : undefined,
      );
    },

    resetScore: () => {
      const fresh = createInitialScore();
      const state = get();
      set({
        score: fresh,
        past: pushHistory(state.past, state.score),
        future: [],
        selectedNote: null,
      });
      persistScore(fresh);
    },

    undo: () => {
      const state = get();
      if (state.past.length === 0) return;
      const previous = state.past[state.past.length - 1];
      const nextPast = state.past.slice(0, -1);
      set({
        score: previous,
        past: nextPast,
        future: [state.score, ...state.future],
        selectedNote: null,
      });
      persistScore(previous);
    },

    redo: () => {
      const state = get();
      if (state.future.length === 0) return;
      const next = state.future[0];
      const nextFuture = state.future.slice(1);
      set({
        score: next,
        past: pushHistory(state.past, state.score),
        future: nextFuture,
        selectedNote: null,
      });
      persistScore(next);
    },

    hydrate: async () => {
      const saved = await localScoreRepository.getScore('local-default-score');
      if (saved && saved.staves?.length > 0 && saved.measureMeta?.length > 0) {
        set({ score: saved });
      }
    },
  };
});
