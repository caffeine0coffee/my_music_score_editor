import type { Score } from '../types/score';

/**
 * Storage abstraction for Score persistence.
 * Milestone 1 uses LocalStorage; Milestone 4 will swap in Supabase (or GCP in future).
 */
export interface ScoreRepository {
  getScore(id: string): Promise<Score | null>;
  saveScore(score: Score): Promise<void>;
  listScores(): Promise<Score[]>;
  deleteScore(id: string): Promise<void>;
}
