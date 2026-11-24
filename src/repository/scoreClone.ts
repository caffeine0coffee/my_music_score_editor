import { createInitialScore, generateId } from '../core/scoreFactory';
import type { Score } from '../types/score';

/**
 * Create a brand-new Score with a unique ID.
 */
export function createNewScoreData(title = '無題のスコア'): Score {
  const base = createInitialScore();
  return {
    ...base,
    id: generateId('score'),
    title,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Deep-clone an existing Score with a fresh unique ID and optional title override.
 */
export function duplicateScoreData(source: Score, customTitle?: string): Score {
  const cloned: Score = JSON.parse(JSON.stringify(source)) as Score;
  const nextTitle = customTitle ?? `${source.title || '無題のスコア'} (コピー)`;
  return {
    ...cloned,
    id: generateId('score'),
    title: nextTitle,
    updatedAt: new Date().toISOString(),
  };
}
