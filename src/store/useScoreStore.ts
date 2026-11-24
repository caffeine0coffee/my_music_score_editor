import { create } from 'zustand';
import { produce } from 'immer';
import type {
  Accidental,
  BaseDuration,
  ClefType,
  DynamicMark,
  NoteEvent,
  Pitch,
  Score,
  TimeSignature,
} from '../types/score';
import {
  MAX_STAVES,
  MAX_UNDO_HISTORY,
  MAX_VOICES_PER_STAFF,
  MAX_ZOOM,
  MIN_ZOOM,
} from '../core/constants';
import {
  clampNotesToMeasureTicks,
  copyMeasuresFromVoice,
  deleteNoteFromMeasure,
  pasteMeasuresIntoVoice,
  pasteNotesIntoMeasure,
  placeNoteInMeasure,
  setNoteAccidentalInMeasure,
  setNoteDynamicInMeasure,
  shiftNoteInMeasure,
  toggleNoteTieInMeasure,
  toggleSlurInVoice,
} from '../core/measureOps';
import { computeDurationSpec, getMeasureTicks } from '../core/rhythm';
import { createInitialScore, createStaff, createVoice, generateId } from '../core/scoreFactory';
import {
  getLastOpenedScoreId,
  localScoreRepository,
  setLastOpenedScoreId,
} from '../repository/LocalStorageScoreRepository';
import type { ScoreRepository } from '../repository/ScoreRepository';
import { createNewScoreData } from '../repository/scoreClone';
import { pianoPlayer, type PlayheadPosition } from '../audio/pianoPlayer';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
export type StorageMode = 'local' | 'cloud';

export interface SelectedNoteRef {
  staffIndex: number;
  voiceIndex: number;
  measureIndex: number;
  noteId: string;
}

export interface MeasureSelection {
  staffIndex: number;
  voiceIndex: number;
  startMeasure: number;
  endMeasure: number;
}

export type InteractionMode = 'input' | 'select';

export type ClipboardData =
  | {
      type: 'measures';
      measures: NoteEvent[][];
    }
  | {
      type: 'notes';
      originMeasure: number;
      items: { measureOffset: number; note: NoteEvent }[];
    };

interface ScoreStoreState {
  score: Score;
  past: Score[];
  future: Score[];

  activeStaffIndex: number;
  activeVoiceIndex: number;
  interactionMode: InteractionMode;

  selectedDuration: BaseDuration;
  dotted: boolean;
  triplet: boolean;
  selectedAccidental: Accidental | null;
  chordMode: boolean;

  selectedNote: SelectedNoteRef | null;
  selectedNotes: SelectedNoteRef[];
  selectedMeasureRange: MeasureSelection | null;
  clipboard: ClipboardData | null;

  zoom: number;

  // Playback state (transient, not in undo history)
  isPlaying: boolean;
  playhead: PlayheadPosition | null;

  // Persistence & repository state (transient)
  repository: ScoreRepository;
  storageMode: StorageMode;
  saveStatus: SaveStatus;
  saveError: string | null;
  lastSavedAt: string | null;

  // Navigation / mode actions
  setActiveStaff: (staffIndex: number) => void;
  setActiveVoice: (voiceIndex: number) => void;
  setActiveStaffAndVoice: (staffIndex: number, voiceIndex: number) => void;
  setInteractionMode: (mode: InteractionMode) => void;
  setZoom: (zoom: number) => void;
  resetZoom: () => void;

  // Tool actions
  setSelectedDuration: (duration: BaseDuration) => void;
  toggleDotted: () => void;
  toggleTriplet: () => void;
  toggleAccidental: (acc: Accidental) => void;
  toggleChordMode: () => void;

  // Selection actions
  setSelectedNote: (ref: SelectedNoteRef | null) => void;
  setSelectedNotes: (refs: SelectedNoteRef[]) => void;
  selectMeasure: (measureIndex: number, staffIndex?: number, extend?: boolean) => void;
  clearSelection: () => void;

  // Clipboard & duplication
  copySelection: () => void;
  pasteToActiveVoice: (targetMeasureIndex?: number) => void;
  duplicateSelectionToVoice: (targetVoiceIndex: number) => void;

  // Staff & Voice structure (undoable)
  addStaff: (clef?: ClefType) => void;
  removeStaff: (staffIndex: number) => void;
  setStaffName: (staffIndex: number, name: string) => void;
  addVoice: (staffIndex?: number) => void;
  removeVoice: (staffIndex: number, voiceIndex: number) => void;
  toggleVoiceMute: (staffIndex: number, voiceIndex: number) => void;
  toggleVoiceSolo: (staffIndex: number, voiceIndex: number) => void;

  // Playback & Import
  startPlayback: (fromSelection?: boolean) => void;
  stopPlayback: () => void;
  togglePlayback: () => void;
  replaceScore: (nextScore: Score) => void;

  // Score editing actions (all undoable)
  placeNote: (
    measureIndex: number,
    startTick: number,
    pitch: Pitch,
    forceChordMode?: boolean,
    targetStaffIndex?: number,
  ) => void;
  deleteSelectedNote: () => void;
  deleteNoteAt: (measureIndex: number, noteId: string, targetStaffIndex?: number) => void;
  shiftSelectedNote: (deltaSteps: number) => void;

  // Notation enrichment (undoable)
  toggleTieOnSelected: () => void;
  toggleSlurOnSelected: () => void;
  setDynamicOnSelected: (dynamic: DynamicMark | null) => void;
  toggleRepeatStart: (measureIndex?: number) => void;
  toggleRepeatEnd: (measureIndex?: number) => void;
  setScoreMetadata: (patch: { title?: string; subtitle?: string; composer?: string }) => void;

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

  // Persistence & score management
  setRepository: (repo: ScoreRepository, mode: StorageMode) => Promise<void>;
  loadScore: (score: Score) => void;
  createNewScore: () => Promise<Score>;
  flushSave: () => Promise<void>;
  hydrate: () => Promise<void>;
}

function pushHistory(past: Score[], current: Score): Score[] {
  const next = [...past, current];
  if (next.length > MAX_UNDO_HISTORY) {
    return next.slice(next.length - MAX_UNDO_HISTORY);
  }
  return next;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingScore: Score | null = null;
let persistSeq = 0;

function clampActiveIndices(
  score: Score,
  staffIndex: number,
  voiceIndex: number,
): { activeStaffIndex: number; activeVoiceIndex: number } {
  const safeStaff = Math.max(0, Math.min(score.staves.length - 1, staffIndex));
  const staff = score.staves[safeStaff];
  const safeVoice = staff ? Math.max(0, Math.min(staff.voices.length - 1, voiceIndex)) : 0;
  return { activeStaffIndex: safeStaff, activeVoiceIndex: safeVoice };
}

export const useScoreStore = create<ScoreStoreState>((set, get) => {
  const executeSave = async (scoreToSave: Score): Promise<void> => {
    const seq = ++persistSeq;
    const { repository, storageMode } = get();
    set({ saveStatus: 'saving', saveError: null });
    try {
      await repository.saveScore(scoreToSave);
      setLastOpenedScoreId(scoreToSave.id, storageMode);
      if (seq === persistSeq) {
        set({
          saveStatus: 'saved',
          saveError: null,
          lastSavedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      if (seq === persistSeq) {
        const message = err instanceof Error ? err.message : '保存に失敗しました';
        set({ saveStatus: 'error', saveError: message });
      }
    }
  };

  const persistScore = (score: Score): void => {
    pendingScore = score;
    if (persistTimer) {
      clearTimeout(persistTimer);
    }
    const delay = get().storageMode === 'cloud' ? 800 : 150;
    set({ saveStatus: 'saving', saveError: null });
    persistTimer = setTimeout(() => {
      persistTimer = null;
      const target = pendingScore;
      pendingScore = null;
      if (target) {
        void executeSave(target);
      }
    }, delay);
  };

  const commit = (
    updater: (draft: Score) => void,
    extraPatch?: Partial<
      Pick<
        ScoreStoreState,
        | 'selectedNote'
        | 'selectedNotes'
        | 'selectedMeasureRange'
        | 'activeStaffIndex'
        | 'activeVoiceIndex'
      >
    >,
  ) => {
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
      ...(extraPatch ?? {}),
    });
    persistScore(nextScore);
  };

  return {
    score: createInitialScore(),
    past: [],
    future: [],

    activeStaffIndex: 0,
    activeVoiceIndex: 0,
    interactionMode: 'input',

    selectedDuration: 'q',
    dotted: false,
    triplet: false,
    selectedAccidental: null,
    chordMode: false,

    selectedNote: null,
    selectedNotes: [],
    selectedMeasureRange: null,
    clipboard: null,

    zoom: 1,

    isPlaying: false,
    playhead: null,

    repository: localScoreRepository,
    storageMode: 'local',
    saveStatus: 'idle',
    saveError: null,
    lastSavedAt: null,

    setActiveStaff: (staffIndex) => {
      const state = get();
      const clamped = clampActiveIndices(state.score, staffIndex, state.activeVoiceIndex);
      set({
        ...clamped,
        selectedNote: null,
        selectedNotes: [],
        selectedMeasureRange: null,
      });
    },

    setActiveVoice: (voiceIndex) => {
      const state = get();
      const staff = state.score.staves[state.activeStaffIndex];
      if (!staff || voiceIndex < 0 || voiceIndex >= staff.voices.length) return;
      set({
        activeVoiceIndex: voiceIndex,
        selectedNote: null,
        selectedNotes: [],
        selectedMeasureRange: null,
      });
    },

    setActiveStaffAndVoice: (staffIndex, voiceIndex) => {
      const state = get();
      const clamped = clampActiveIndices(state.score, staffIndex, voiceIndex);
      set({
        ...clamped,
        selectedNote: null,
        selectedNotes: [],
        selectedMeasureRange: null,
      });
    },

    setInteractionMode: (mode) => {
      set({ interactionMode: mode });
    },

    setZoom: (zoom) => {
      const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(zoom * 100) / 100));
      set({ zoom: clamped });
    },

    resetZoom: () => {
      set({ zoom: 1 });
    },

    setSelectedDuration: (duration) => {
      set((state) => ({
        selectedDuration: duration,
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

      const targets =
        state.selectedNotes.length > 0
          ? state.selectedNotes
          : state.selectedNote
            ? [state.selectedNote]
            : [];

      if (targets.length > 0) {
        commit((draft) => {
          for (const ref of targets) {
            const measure = draft.staves[ref.staffIndex]?.voices[ref.voiceIndex]?.measures[ref.measureIndex];
            if (!measure) continue;
            const target = measure.notes.find((n) => n.id === ref.noteId);
            if (!target) continue;
            const allHave = target.pitches.every((p) => p.accidental === acc);
            measure.notes = setNoteAccidentalInMeasure(
              measure.notes,
              ref.noteId,
              allHave ? undefined : acc,
            );
          }
        });
      }
    },

    toggleChordMode: () => {
      set((state) => ({ chordMode: !state.chordMode }));
    },

    setSelectedNote: (ref) => {
      set({
        selectedNote: ref,
        selectedNotes: ref ? [ref] : [],
        selectedMeasureRange: null,
      });
    },

    setSelectedNotes: (refs) => {
      set({
        selectedNote: refs[0] ?? null,
        selectedNotes: refs,
        selectedMeasureRange: null,
      });
    },

    selectMeasure: (measureIndex, staffIndex, extend = false) => {
      const state = get();
      const targetStaff = staffIndex ?? state.activeStaffIndex;
      const clamped = clampActiveIndices(state.score, targetStaff, state.activeVoiceIndex);
      const safeMeasure = Math.max(0, Math.min(state.score.measureMeta.length - 1, measureIndex));

      let startMeasure = safeMeasure;
      let endMeasure = safeMeasure;
      if (
        extend &&
        state.selectedMeasureRange &&
        state.selectedMeasureRange.staffIndex === clamped.activeStaffIndex &&
        state.selectedMeasureRange.voiceIndex === clamped.activeVoiceIndex
      ) {
        startMeasure = Math.min(state.selectedMeasureRange.startMeasure, safeMeasure);
        endMeasure = Math.max(state.selectedMeasureRange.endMeasure, safeMeasure);
      }

      set({
        ...clamped,
        selectedNote: null,
        selectedNotes: [],
        selectedMeasureRange: {
          staffIndex: clamped.activeStaffIndex,
          voiceIndex: clamped.activeVoiceIndex,
          startMeasure,
          endMeasure,
        },
      });
    },

    clearSelection: () => {
      set({
        selectedNote: null,
        selectedNotes: [],
        selectedMeasureRange: null,
      });
    },

    copySelection: () => {
      const state = get();
      if (state.selectedMeasureRange) {
        const { staffIndex, voiceIndex, startMeasure, endMeasure } = state.selectedMeasureRange;
        const voice = state.score.staves[staffIndex]?.voices[voiceIndex];
        if (!voice) return;
        const measures = copyMeasuresFromVoice(voice, startMeasure, endMeasure);
        set({ clipboard: { type: 'measures', measures } });
        return;
      }

      const targets =
        state.selectedNotes.length > 0
          ? state.selectedNotes
          : state.selectedNote
            ? [state.selectedNote]
            : [];
      if (targets.length === 0) return;

      const minMeasure = Math.min(...targets.map((t) => t.measureIndex));
      const items: { measureOffset: number; note: NoteEvent }[] = [];
      for (const ref of targets) {
        const note = state.score.staves[ref.staffIndex]?.voices[ref.voiceIndex]?.measures[
          ref.measureIndex
        ]?.notes.find((n) => n.id === ref.noteId);
        if (note) {
          items.push({
            measureOffset: ref.measureIndex - minMeasure,
            note: {
              ...note,
              pitches: note.pitches.map((p) => ({ ...p })),
              ...(note.tuplet ? { tuplet: { ...note.tuplet } } : {}),
            },
          });
        }
      }
      if (items.length > 0) {
        set({
          clipboard: {
            type: 'notes',
            originMeasure: minMeasure,
            items,
          },
        });
      }
    },

    pasteToActiveVoice: (targetMeasureIndex) => {
      const state = get();
      if (!state.clipboard) return;
      const { activeStaffIndex, activeVoiceIndex } = state;
      const measureTicks = getMeasureTicks(state.score.timeSignature);

      const fallbackMeasure =
        targetMeasureIndex ??
        state.selectedMeasureRange?.startMeasure ??
        state.selectedNote?.measureIndex ??
        (state.clipboard.type === 'notes' ? state.clipboard.originMeasure : 0);

      if (state.clipboard.type === 'measures') {
        const copiedMeasures = state.clipboard.measures;
        commit((draft) => {
          const voice = draft.staves[activeStaffIndex]?.voices[activeVoiceIndex];
          if (!voice) return;
          const updated = pasteMeasuresIntoVoice(
            voice,
            fallbackMeasure,
            copiedMeasures,
            measureTicks,
            () => generateId('note'),
          );
          draft.staves[activeStaffIndex].voices[activeVoiceIndex] = updated;
        });
        return;
      }

      // Notes paste
      const { items } = state.clipboard;
      const newRefs: SelectedNoteRef[] = [];
      commit((draft) => {
        const voice = draft.staves[activeStaffIndex]?.voices[activeVoiceIndex];
        if (!voice) return;
        const grouped = new Map<number, NoteEvent[]>();
        for (const item of items) {
          const destMeasure = fallbackMeasure + item.measureOffset;
          if (destMeasure < 0 || destMeasure >= voice.measures.length) continue;
          const list = grouped.get(destMeasure) ?? [];
          list.push(item.note);
          grouped.set(destMeasure, list);
        }
        for (const [mIdx, notesToPaste] of grouped.entries()) {
          const m = voice.measures[mIdx];
          if (!m) continue;
          const res = pasteNotesIntoMeasure(m.notes, notesToPaste, measureTicks, () =>
            generateId('note'),
          );
          m.notes = res.notes;
          for (const id of res.pastedNoteIds) {
            newRefs.push({
              staffIndex: activeStaffIndex,
              voiceIndex: activeVoiceIndex,
              measureIndex: mIdx,
              noteId: id,
            });
          }
        }
      });

      if (newRefs.length > 0) {
        set({
          selectedNote: newRefs[0],
          selectedNotes: newRefs,
          selectedMeasureRange: null,
        });
      }
    },

    duplicateSelectionToVoice: (targetVoiceIndex) => {
      const state = get();
      if (targetVoiceIndex < 0 || targetVoiceIndex >= MAX_VOICES_PER_STAFF) return;
      const staff = state.score.staves[state.activeStaffIndex];
      if (!staff) return;

      const measureTicks = getMeasureTicks(state.score.timeSignature);
      const measureCount = state.score.measureMeta.length;

      if (state.selectedMeasureRange) {
        const { staffIndex, voiceIndex, startMeasure, endMeasure } = state.selectedMeasureRange;
        const srcVoice = state.score.staves[staffIndex]?.voices[voiceIndex];
        if (!srcVoice) return;
        const copied = copyMeasuresFromVoice(srcVoice, startMeasure, endMeasure);

        commit(
          (draft) => {
            const targetStaff = draft.staves[staffIndex];
            if (!targetStaff) return;
            while (targetStaff.voices.length <= targetVoiceIndex) {
              targetStaff.voices.push(createVoice(targetStaff.voices.length, measureCount));
            }
            const destVoice = targetStaff.voices[targetVoiceIndex];
            targetStaff.voices[targetVoiceIndex] = pasteMeasuresIntoVoice(
              destVoice,
              startMeasure,
              copied,
              measureTicks,
              () => generateId('note'),
            );
          },
          {
            activeStaffIndex: staffIndex,
            activeVoiceIndex: targetVoiceIndex,
            selectedMeasureRange: {
              staffIndex,
              voiceIndex: targetVoiceIndex,
              startMeasure,
              endMeasure,
            },
          },
        );
        return;
      }

      const targets =
        state.selectedNotes.length > 0
          ? state.selectedNotes
          : state.selectedNote
            ? [state.selectedNote]
            : [];
      if (targets.length === 0) return;

      const srcStaffIndex = targets[0].staffIndex;
      const grouped = new Map<number, NoteEvent[]>();
      for (const ref of targets) {
        const note = state.score.staves[ref.staffIndex]?.voices[ref.voiceIndex]?.measures[
          ref.measureIndex
        ]?.notes.find((n) => n.id === ref.noteId);
        if (note) {
          const list = grouped.get(ref.measureIndex) ?? [];
          list.push(note);
          grouped.set(ref.measureIndex, list);
        }
      }
      if (grouped.size === 0) return;

      const newRefs: SelectedNoteRef[] = [];
      commit(
        (draft) => {
          const targetStaff = draft.staves[srcStaffIndex];
          if (!targetStaff) return;
          while (targetStaff.voices.length <= targetVoiceIndex) {
            targetStaff.voices.push(createVoice(targetStaff.voices.length, measureCount));
          }
          const destVoice = targetStaff.voices[targetVoiceIndex];
          for (const [mIdx, notesToPaste] of grouped.entries()) {
            const m = destVoice.measures[mIdx];
            if (!m) continue;
            const res = pasteNotesIntoMeasure(m.notes, notesToPaste, measureTicks, () =>
              generateId('note'),
            );
            m.notes = res.notes;
            for (const id of res.pastedNoteIds) {
              newRefs.push({
                staffIndex: srcStaffIndex,
                voiceIndex: targetVoiceIndex,
                measureIndex: mIdx,
                noteId: id,
              });
            }
          }
        },
        {
          activeStaffIndex: srcStaffIndex,
          activeVoiceIndex: targetVoiceIndex,
          selectedNote: newRefs[0] ?? null,
          selectedNotes: newRefs,
          selectedMeasureRange: null,
        },
      );
    },

    addStaff: (clef) => {
      const state = get();
      if (state.score.staves.length >= MAX_STAVES) return;
      const nextClef: ClefType =
        clef ?? (state.score.staves.length === 1 && state.score.staves[0].clef === 'treble' ? 'bass' : 'treble');
      const nextStaffIndex = state.score.staves.length;
      const measureCount = state.score.measureMeta.length;

      commit(
        (draft) => {
          draft.staves.push(createStaff(nextClef, measureCount));
        },
        {
          activeStaffIndex: nextStaffIndex,
          activeVoiceIndex: 0,
          selectedNote: null,
          selectedNotes: [],
          selectedMeasureRange: null,
        },
      );
    },

    removeStaff: (staffIndex) => {
      const state = get();
      if (state.score.staves.length <= 1) return;
      if (staffIndex < 0 || staffIndex >= state.score.staves.length) return;
      const nextStaffIndex = Math.min(state.activeStaffIndex, state.score.staves.length - 2);
      const nextVoiceCount = state.score.staves[nextStaffIndex === staffIndex ? Math.max(0, staffIndex - 1) : nextStaffIndex]?.voices.length ?? 1;

      commit(
        (draft) => {
          draft.staves.splice(staffIndex, 1);
        },
        {
          activeStaffIndex: nextStaffIndex,
          activeVoiceIndex: Math.min(state.activeVoiceIndex, nextVoiceCount - 1),
          selectedNote: null,
          selectedNotes: [],
          selectedMeasureRange: null,
        },
      );
    },

    setStaffName: (staffIndex, name) => {
      commit((draft) => {
        const staff = draft.staves[staffIndex];
        if (staff) {
          staff.name = name;
        }
      });
    },

    addVoice: (staffIndex) => {
      const state = get();
      const sIdx = staffIndex ?? state.activeStaffIndex;
      const staff = state.score.staves[sIdx];
      if (!staff || staff.voices.length >= MAX_VOICES_PER_STAFF) return;
      const nextVoiceIndex = staff.voices.length;
      const measureCount = state.score.measureMeta.length;

      commit(
        (draft) => {
          const targetStaff = draft.staves[sIdx];
          if (!targetStaff) return;
          targetStaff.voices.push(createVoice(nextVoiceIndex, measureCount));
        },
        {
          activeStaffIndex: sIdx,
          activeVoiceIndex: nextVoiceIndex,
          selectedNote: null,
          selectedNotes: [],
          selectedMeasureRange: null,
        },
      );
    },

    removeVoice: (staffIndex, voiceIndex) => {
      const state = get();
      const staff = state.score.staves[staffIndex];
      if (!staff || staff.voices.length <= 1) return;
      if (voiceIndex < 0 || voiceIndex >= staff.voices.length) return;
      const nextActiveVoice = Math.min(state.activeVoiceIndex, staff.voices.length - 2);

      commit(
        (draft) => {
          const targetStaff = draft.staves[staffIndex];
          if (!targetStaff) return;
          targetStaff.voices.splice(voiceIndex, 1);
          // Re-index remaining voices
          targetStaff.voices.forEach((v, i) => {
            v.index = i;
          });
        },
        {
          activeVoiceIndex: staffIndex === state.activeStaffIndex ? nextActiveVoice : state.activeVoiceIndex,
          selectedNote: null,
          selectedNotes: [],
          selectedMeasureRange: null,
        },
      );
    },

    toggleVoiceMute: (staffIndex, voiceIndex) => {
      commit((draft) => {
        const voice = draft.staves[staffIndex]?.voices[voiceIndex];
        if (!voice) return;
        voice.muted = !voice.muted;
        if (voice.muted) {
          voice.solo = false;
        }
      });
    },

    toggleVoiceSolo: (staffIndex, voiceIndex) => {
      commit((draft) => {
        const voice = draft.staves[staffIndex]?.voices[voiceIndex];
        if (!voice) return;
        voice.solo = !voice.solo;
        if (voice.solo) {
          voice.muted = false;
        }
      });
    },

    startPlayback: (fromSelection = false) => {
      const state = get();
      const startMeasure = fromSelection
        ? (state.selectedMeasureRange?.startMeasure ?? state.selectedNote?.measureIndex ?? 0)
        : 0;
      pianoPlayer.play(
        state.score,
        {
          onPlayheadChange: (pos) => set({ playhead: pos }),
          onStateChange: (playing) => set({ isPlaying: playing }),
        },
        startMeasure,
      );
    },

    stopPlayback: () => {
      pianoPlayer.stop();
      set({ isPlaying: false, playhead: null });
    },

    togglePlayback: () => {
      const state = get();
      if (state.isPlaying) {
        state.stopPlayback();
      } else {
        state.startPlayback(false);
      }
    },

    replaceScore: (nextScore) => {
      const state = get();
      if (state.isPlaying) {
        pianoPlayer.stop();
      }
      const normalized: Score = {
        ...nextScore,
        id: state.score.id,
        updatedAt: new Date().toISOString(),
      };
      set({
        score: normalized,
        past: pushHistory(state.past, state.score),
        future: [],
        activeStaffIndex: 0,
        activeVoiceIndex: 0,
        selectedNote: null,
        selectedNotes: [],
        selectedMeasureRange: null,
        isPlaying: false,
        playhead: null,
      });
      persistScore(normalized);
    },

    placeNote: (measureIndex, startTick, pitch, forceChordMode, targetStaffIndex) => {
      const state = get();
      const staffIdx = targetStaffIndex ?? state.activeStaffIndex;
      const clamped = clampActiveIndices(state.score, staffIdx, state.activeVoiceIndex);
      const { activeStaffIndex, activeVoiceIndex } = clamped;
      const { selectedDuration, dotted, triplet, selectedAccidental } = state;
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

      const ref: SelectedNoteRef | null = placedId
        ? {
            staffIndex: activeStaffIndex,
            voiceIndex: activeVoiceIndex,
            measureIndex,
            noteId: placedId,
          }
        : null;

      set({
        activeStaffIndex,
        activeVoiceIndex,
        selectedNote: ref,
        selectedNotes: ref ? [ref] : [],
        selectedMeasureRange: null,
      });
    },

    deleteSelectedNote: () => {
      const state = get();
      if (state.selectedMeasureRange) {
        const { staffIndex, voiceIndex, startMeasure, endMeasure } = state.selectedMeasureRange;
        commit((draft) => {
          const voice = draft.staves[staffIndex]?.voices[voiceIndex];
          if (!voice) return;
          for (let m = startMeasure; m <= endMeasure; m++) {
            if (voice.measures[m]) {
              voice.measures[m].notes = [];
            }
          }
        });
        return;
      }

      const targets =
        state.selectedNotes.length > 0
          ? state.selectedNotes
          : state.selectedNote
            ? [state.selectedNote]
            : [];
      if (targets.length === 0) return;

      commit(
        (draft) => {
          for (const ref of targets) {
            const measure = draft.staves[ref.staffIndex]?.voices[ref.voiceIndex]?.measures[ref.measureIndex];
            if (!measure) continue;
            measure.notes = deleteNoteFromMeasure(measure.notes, ref.noteId);
          }
        },
        { selectedNote: null, selectedNotes: [] },
      );
    },

    deleteNoteAt: (measureIndex, noteId, targetStaffIndex) => {
      const state = get();
      const staffIdx = targetStaffIndex ?? state.activeStaffIndex;
      const clamped = clampActiveIndices(state.score, staffIdx, state.activeVoiceIndex);
      const remaining = state.selectedNotes.filter((n) => n.noteId !== noteId);
      commit(
        (draft) => {
          const measure =
            draft.staves[clamped.activeStaffIndex]?.voices[clamped.activeVoiceIndex]?.measures[
              measureIndex
            ];
          if (!measure) return;
          measure.notes = deleteNoteFromMeasure(measure.notes, noteId);
        },
        {
          selectedNote: remaining[0] ?? null,
          selectedNotes: remaining,
        },
      );
    },

    shiftSelectedNote: (deltaSteps) => {
      const state = get();
      const targets =
        state.selectedNotes.length > 0
          ? state.selectedNotes
          : state.selectedNote
            ? [state.selectedNote]
            : [];

      if (targets.length === 0 && state.selectedMeasureRange) {
        const { staffIndex, voiceIndex, startMeasure, endMeasure } = state.selectedMeasureRange;
        commit((draft) => {
          const voice = draft.staves[staffIndex]?.voices[voiceIndex];
          if (!voice) return;
          for (let m = startMeasure; m <= endMeasure; m++) {
            const measure = voice.measures[m];
            if (!measure) continue;
            for (const note of measure.notes) {
              measure.notes = shiftNoteInMeasure(measure.notes, note.id, deltaSteps);
            }
          }
        });
        return;
      }

      if (targets.length === 0) return;
      commit((draft) => {
        for (const ref of targets) {
          const measure = draft.staves[ref.staffIndex]?.voices[ref.voiceIndex]?.measures[ref.measureIndex];
          if (!measure) continue;
          measure.notes = shiftNoteInMeasure(measure.notes, ref.noteId, deltaSteps);
        }
      });
    },

    toggleTieOnSelected: () => {
      const state = get();
      const targets =
        state.selectedNotes.length > 0
          ? state.selectedNotes
          : state.selectedNote
            ? [state.selectedNote]
            : [];
      if (targets.length === 0) return;

      commit((draft) => {
        for (const ref of targets) {
          const measure = draft.staves[ref.staffIndex]?.voices[ref.voiceIndex]?.measures[ref.measureIndex];
          if (!measure) continue;
          measure.notes = toggleNoteTieInMeasure(measure.notes, ref.noteId);
        }
      });
    },

    toggleSlurOnSelected: () => {
      const state = get();
      const targets =
        state.selectedNotes.length > 0
          ? state.selectedNotes
          : state.selectedNote
            ? [state.selectedNote]
            : [];
      if (targets.length === 0) return;

      const { staffIndex, voiceIndex } = targets[0];
      const sameVoiceTargets = targets
        .filter((t) => t.staffIndex === staffIndex && t.voiceIndex === voiceIndex)
        .map((t) => ({ measureIndex: t.measureIndex, noteId: t.noteId }));

      commit((draft) => {
        const voice = draft.staves[staffIndex]?.voices[voiceIndex];
        if (!voice) return;
        draft.staves[staffIndex].voices[voiceIndex] = toggleSlurInVoice(voice, sameVoiceTargets);
      });
    },

    setDynamicOnSelected: (dynamic) => {
      const state = get();
      const target = state.selectedNote ?? state.selectedNotes[0];
      if (!target) return;

      commit((draft) => {
        const measure =
          draft.staves[target.staffIndex]?.voices[target.voiceIndex]?.measures[target.measureIndex];
        if (!measure) return;
        measure.notes = setNoteDynamicInMeasure(measure.notes, target.noteId, dynamic);
      });
    },

    toggleRepeatStart: (measureIndex) => {
      const state = get();
      const idx =
        measureIndex ??
        state.selectedMeasureRange?.startMeasure ??
        state.selectedNote?.measureIndex;
      if (idx === undefined) return;
      commit((draft) => {
        const meta = draft.measureMeta[idx];
        if (meta) {
          meta.repeatStart = !meta.repeatStart;
        }
      });
    },

    toggleRepeatEnd: (measureIndex) => {
      const state = get();
      const idx =
        measureIndex ??
        state.selectedMeasureRange?.endMeasure ??
        state.selectedNote?.measureIndex;
      if (idx === undefined) return;
      commit((draft) => {
        const meta = draft.measureMeta[idx];
        if (meta) {
          meta.repeatEnd = !meta.repeatEnd;
        }
      });
    },

    setScoreMetadata: (patch) => {
      commit((draft) => {
        if (patch.title !== undefined) draft.title = patch.title;
        if (patch.subtitle !== undefined) draft.subtitle = patch.subtitle;
        if (patch.composer !== undefined) draft.composer = patch.composer;
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
      const clearSelection =
        state.selectedNote?.measureIndex === removedIndex ||
        state.selectedMeasureRange?.endMeasure === removedIndex;
      commit(
        (draft) => {
          draft.measureMeta.pop();
          for (const staff of draft.staves) {
            for (const voice of staff.voices) {
              voice.measures.pop();
            }
          }
        },
        clearSelection
          ? { selectedNote: null, selectedNotes: [], selectedMeasureRange: null }
          : undefined,
      );
    },

    resetScore: () => {
      const state = get();
      const fresh: Score = {
        ...createInitialScore(),
        id: state.score.id,
        updatedAt: new Date().toISOString(),
      };
      set({
        score: fresh,
        past: pushHistory(state.past, state.score),
        future: [],
        activeStaffIndex: 0,
        activeVoiceIndex: 0,
        selectedNote: null,
        selectedNotes: [],
        selectedMeasureRange: null,
      });
      persistScore(fresh);
    },

    undo: () => {
      const state = get();
      if (state.past.length === 0) return;
      const previous = state.past[state.past.length - 1];
      const nextPast = state.past.slice(0, -1);
      const clamped = clampActiveIndices(previous, state.activeStaffIndex, state.activeVoiceIndex);
      set({
        score: previous,
        past: nextPast,
        future: [state.score, ...state.future],
        ...clamped,
        selectedNote: null,
        selectedNotes: [],
        selectedMeasureRange: null,
      });
      persistScore(previous);
    },

    redo: () => {
      const state = get();
      if (state.future.length === 0) return;
      const next = state.future[0];
      const nextFuture = state.future.slice(1);
      const clamped = clampActiveIndices(next, state.activeStaffIndex, state.activeVoiceIndex);
      set({
        score: next,
        past: pushHistory(state.past, state.score),
        future: nextFuture,
        ...clamped,
        selectedNote: null,
        selectedNotes: [],
        selectedMeasureRange: null,
      });
      persistScore(next);
    },

    flushSave: async () => {
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      const target = pendingScore ?? (get().saveStatus === 'error' ? get().score : null);
      pendingScore = null;
      if (target) {
        await executeSave(target);
      }
    },

    setRepository: async (repo, mode) => {
      await get().flushSave();
      set({
        repository: repo,
        storageMode: mode,
        saveStatus: 'idle',
        saveError: null,
      });
      await get().hydrate();
    },

    loadScore: (nextScore) => {
      const state = get();
      if (state.isPlaying) {
        pianoPlayer.stop();
      }
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      const prevPending = pendingScore;
      pendingScore = null;
      if (prevPending && prevPending.id !== nextScore.id) {
        void state.repository.saveScore(prevPending);
      }
      setLastOpenedScoreId(nextScore.id, state.storageMode);
      set({
        score: nextScore,
        past: [],
        future: [],
        activeStaffIndex: 0,
        activeVoiceIndex: 0,
        selectedNote: null,
        selectedNotes: [],
        selectedMeasureRange: null,
        isPlaying: false,
        playhead: null,
        saveStatus: 'saved',
        saveError: null,
      });
    },

    createNewScore: async () => {
      await get().flushSave();
      const fresh = createNewScoreData();
      const { repository, storageMode } = get();
      await repository.saveScore(fresh);
      setLastOpenedScoreId(fresh.id, storageMode);
      get().loadScore(fresh);
      return fresh;
    },

    hydrate: async () => {
      const { repository, storageMode } = get();
      try {
        const lastId = getLastOpenedScoreId(storageMode);
        if (lastId) {
          const saved = await repository.getScore(lastId);
          if (saved && saved.staves?.length > 0 && saved.measureMeta?.length > 0) {
            set({
              score: saved,
              past: [],
              future: [],
              activeStaffIndex: 0,
              activeVoiceIndex: 0,
              selectedNote: null,
              selectedNotes: [],
              selectedMeasureRange: null,
              saveStatus: 'saved',
              saveError: null,
            });
            return;
          }
        }

        const list = await repository.listScores();
        const latest = list.find((s) => s.staves?.length > 0 && s.measureMeta?.length > 0);
        if (latest) {
          setLastOpenedScoreId(latest.id, storageMode);
          set({
            score: latest,
            past: [],
            future: [],
            activeStaffIndex: 0,
            activeVoiceIndex: 0,
            selectedNote: null,
            selectedNotes: [],
            selectedMeasureRange: null,
            saveStatus: 'saved',
            saveError: null,
          });
          return;
        }

        // No existing score in repository -> initialize one and save it
        const initial =
          storageMode === 'local' ? createInitialScore() : createNewScoreData();
        await repository.saveScore(initial);
        setLastOpenedScoreId(initial.id, storageMode);
        set({
          score: initial,
          past: [],
          future: [],
          activeStaffIndex: 0,
          activeVoiceIndex: 0,
          selectedNote: null,
          selectedNotes: [],
          selectedMeasureRange: null,
          saveStatus: 'saved',
          saveError: null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : '譜面の読み込みに失敗しました';
        set({ saveStatus: 'error', saveError: message });
      }
    },
  };
});
