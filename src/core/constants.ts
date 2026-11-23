import type { BaseDuration, TimeSignature } from '../types/score';

export const TICKS_PER_QUARTER = 480;

export const BASE_DURATION_TICKS: Record<BaseDuration, number> = {
  w: 1920,
  h: 960,
  q: 480,
  '8': 240,
  '16': 120,
};

export const DURATION_OPTIONS: {
  key: BaseDuration;
  label: string;
  shortLabel: string;
  shortcut: string;
  baseTicks: number;
}[] = [
  { key: 'w', label: '全音符', shortLabel: '全', shortcut: '1', baseTicks: 1920 },
  { key: 'h', label: '2分音符', shortLabel: '2分', shortcut: '2', baseTicks: 960 },
  { key: 'q', label: '4分音符', shortLabel: '4分', shortcut: '3', baseTicks: 480 },
  { key: '8', label: '8分音符', shortLabel: '8分', shortcut: '4', baseTicks: 240 },
  { key: '16', label: '16分音符', shortLabel: '16分', shortcut: '5', baseTicks: 120 },
];

export const KEY_SIGNATURES: { value: string; label: string }[] = [
  { value: 'C', label: 'C / Am (0)' },
  { value: 'G', label: 'G / Em (1♯)' },
  { value: 'D', label: 'D / Bm (2♯)' },
  { value: 'A', label: 'A / F♯m (3♯)' },
  { value: 'E', label: 'E / C♯m (4♯)' },
  { value: 'B', label: 'B / G♯m (5♯)' },
  { value: 'F#', label: 'F♯ / D♯m (6♯)' },
  { value: 'F', label: 'F / Dm (1♭)' },
  { value: 'Bb', label: 'B♭ / Gm (2♭)' },
  { value: 'Eb', label: 'E♭ / Cm (3♭)' },
  { value: 'Ab', label: 'A♭ / Fm (4♭)' },
  { value: 'Db', label: 'D♭ / B♭m (5♭)' },
  { value: 'Gb', label: 'G♭ / E♭m (6♭)' },
];

export const TIME_SIGNATURES: { value: string; label: string; ts: TimeSignature }[] = [
  { value: '4/4', label: '4/4', ts: { beats: 4, beatType: 4 } },
  { value: '3/4', label: '3/4', ts: { beats: 3, beatType: 4 } },
  { value: '2/4', label: '2/4', ts: { beats: 2, beatType: 4 } },
  { value: '6/8', label: '6/8', ts: { beats: 6, beatType: 8 } },
  { value: '3/8', label: '3/8', ts: { beats: 3, beatType: 8 } },
  { value: '5/4', label: '5/4', ts: { beats: 5, beatType: 4 } },
  { value: '12/8', label: '12/8', ts: { beats: 12, beatType: 8 } },
];

export const VOICE_COLORS = [
  '#1e3a8a', // 1st: deep blue
  '#15803d', // 2nd: green
  '#c2410c', // 3rd: orange
  '#7e22ce', // 4th: purple
];

export const DEFAULT_MEASURE_COUNT = 8;
export const MAX_UNDO_HISTORY = 100;
