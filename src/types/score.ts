export type ClefType = 'treble' | 'bass';
export type Accidental = '#' | 'b' | 'n';
export type DynamicMark = 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff';
export type PitchStep = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

export type BaseDuration = 'w' | 'h' | 'q' | '8' | '16';

export interface TimeSignature {
  beats: number;
  beatType: number;
}

export interface Pitch {
  step: PitchStep;
  octave: number;
  accidental?: Accidental;
}

export interface TupletInfo {
  numNotes: number;
  notesOccupied: number;
}

export interface NoteEvent {
  id: string;
  startTick: number; // 0 .. measureTicks - 1
  durationTick: number; // 480 = quarter note, 240 = eighth, 160 = eighth triplet, etc.
  tuplet?: TupletInfo;
  pitches: Pitch[]; // 1 for single note, 2+ for chord
  tieToNext?: boolean;
  slurStart?: boolean;
  slurEnd?: boolean;
  dynamic?: DynamicMark;
}

export interface MeasureVoice {
  measureIndex: number;
  notes: NoteEvent[]; // sorted ascending by startTick
}

export interface Voice {
  id: string;
  index: number; // 0 = 1st, 1 = 2nd, ...
  color: string;
  muted?: boolean;
  solo?: boolean;
  measures: MeasureVoice[];
}

export interface Staff {
  id: string;
  name?: string;
  clef: ClefType;
  voices: Voice[];
}

export interface MeasureMeta {
  index: number;
  repeatStart?: boolean;
  repeatEnd?: boolean;
  lineBreakAfter?: boolean;
  pageBreakAfter?: boolean;
}

export interface Score {
  id: string;
  title: string;
  subtitle?: string;
  composer?: string;
  tempo: number; // BPM
  timeSignature: TimeSignature;
  keySignature: string; // 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'
  staves: Staff[];
  measureMeta: MeasureMeta[];
  updatedAt: string;
}
