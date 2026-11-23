import type { ClefType, MeasureMeta, MeasureVoice, Score, Staff, Voice } from '../types/score';
import { DEFAULT_MEASURE_COUNT, VOICE_COLORS } from './constants';

export function generateId(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyMeasures(measureCount: number): MeasureVoice[] {
  return Array.from({ length: measureCount }, (_, i) => ({
    measureIndex: i,
    notes: [],
  }));
}

export function createVoice(voiceIndex: number, measureCount: number): Voice {
  return {
    id: generateId('voice'),
    index: voiceIndex,
    color: VOICE_COLORS[voiceIndex % VOICE_COLORS.length],
    measures: createEmptyMeasures(measureCount),
  };
}

export function createStaff(clef: ClefType, measureCount: number, name?: string): Staff {
  return {
    id: generateId('staff'),
    ...(name !== undefined ? { name } : {}),
    clef,
    voices: [createVoice(0, measureCount)],
  };
}

export function createInitialScore(measureCount = DEFAULT_MEASURE_COUNT): Score {
  const measureMeta: MeasureMeta[] = Array.from({ length: measureCount }, (_, i) => ({
    index: i,
  }));

  return {
    id: 'local-default-score',
    title: '無題のスコア',
    subtitle: '',
    composer: '',
    tempo: 120,
    timeSignature: { beats: 4, beatType: 4 },
    keySignature: 'C',
    staves: [createStaff('treble', measureCount)],
    measureMeta,
    updatedAt: new Date().toISOString(),
  };
}
