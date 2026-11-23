import type { MeasureMeta, MeasureVoice, Score } from '../types/score';
import { DEFAULT_MEASURE_COUNT, VOICE_COLORS } from './constants';

export function generateId(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createInitialScore(measureCount = DEFAULT_MEASURE_COUNT): Score {
  const measures: MeasureVoice[] = Array.from({ length: measureCount }, (_, i) => ({
    measureIndex: i,
    notes: [],
  }));
  const measureMeta: MeasureMeta[] = Array.from({ length: measureCount }, (_, i) => ({
    index: i,
  }));

  return {
    id: 'local-default-score',
    title: '無題のスコア',
    tempo: 120,
    timeSignature: { beats: 4, beatType: 4 },
    keySignature: 'C',
    staves: [
      {
        id: generateId('staff'),
        clef: 'treble',
        voices: [
          {
            id: generateId('voice'),
            index: 0,
            color: VOICE_COLORS[0],
            measures,
          },
        ],
      },
    ],
    measureMeta,
    updatedAt: new Date().toISOString(),
  };
}
