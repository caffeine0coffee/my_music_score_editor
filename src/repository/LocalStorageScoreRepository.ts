import type { Score } from '../types/score';
import type { ScoreRepository } from './ScoreRepository';

const STORAGE_KEY = 'my_music_score_editor:scores_v1';

function readAll(): Record<string, Score> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, Score>;
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, Score>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors in restricted environments
  }
}

export class LocalStorageScoreRepository implements ScoreRepository {
  async getScore(id: string): Promise<Score | null> {
    const map = readAll();
    return map[id] ?? null;
  }

  async saveScore(score: Score): Promise<void> {
    const map = readAll();
    map[score.id] = score;
    writeAll(map);
  }

  async listScores(): Promise<Score[]> {
    const map = readAll();
    return Object.values(map).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async deleteScore(id: string): Promise<void> {
    const map = readAll();
    delete map[id];
    writeAll(map);
  }
}

export const localScoreRepository = new LocalStorageScoreRepository();
