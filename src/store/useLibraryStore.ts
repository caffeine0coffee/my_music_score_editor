import { create } from 'zustand';
import type { Score } from '../types/score';
import type { ScoreRepository } from '../repository/ScoreRepository';
import { localScoreRepository } from '../repository/LocalStorageScoreRepository';
import { createNewScoreData, duplicateScoreData } from '../repository/scoreClone';

interface LibraryStoreState {
  scores: Score[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  importingLocal: boolean;

  setSearchQuery: (query: string) => void;
  refresh: (repo: ScoreRepository) => Promise<void>;
  createScore: (repo: ScoreRepository, title?: string) => Promise<Score>;
  duplicateScore: (repo: ScoreRepository, source: Score) => Promise<Score>;
  deleteScore: (repo: ScoreRepository, id: string) => Promise<void>;
  importLocalScoresToCloud: (
    cloudRepo: ScoreRepository,
    localRepo?: ScoreRepository,
  ) => Promise<number>;
}

export function filterScoresByQuery(scores: Score[], query: string): Score[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return scores;
  return scores.filter((s) => {
    const hay = `${s.title ?? ''} ${s.subtitle ?? ''} ${s.composer ?? ''}`.toLowerCase();
    return hay.includes(normalized);
  });
}

export const useLibraryStore = create<LibraryStoreState>((set, get) => ({
  scores: [],
  loading: false,
  error: null,
  searchQuery: '',
  importingLocal: false,

  setSearchQuery: (query) => set({ searchQuery: query }),

  refresh: async (repo) => {
    set({ loading: true, error: null });
    try {
      const list = await repo.listScores();
      set({ scores: list, loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : '譜面一覧の読み込みに失敗しました';
      set({ error: message, loading: false });
    }
  },

  createScore: async (repo, title) => {
    const fresh = createNewScoreData(title);
    await repo.saveScore(fresh);
    set((state) => ({
      scores: [fresh, ...state.scores.filter((s) => s.id !== fresh.id)],
      error: null,
    }));
    return fresh;
  },

  duplicateScore: async (repo, source) => {
    const copy = duplicateScoreData(source);
    await repo.saveScore(copy);
    set((state) => ({
      scores: [copy, ...state.scores],
      error: null,
    }));
    return copy;
  },

  deleteScore: async (repo, id) => {
    await repo.deleteScore(id);
    set((state) => ({
      scores: state.scores.filter((s) => s.id !== id),
      error: null,
    }));
  },

  importLocalScoresToCloud: async (cloudRepo, localRepo = localScoreRepository) => {
    set({ importingLocal: true, error: null });
    try {
      const [localScores, cloudScores] = await Promise.all([
        localRepo.listScores(),
        cloudRepo.listScores(),
      ]);
      const existingIds = new Set(cloudScores.map((s) => s.id));
      let imported = 0;

      for (const localScore of localScores) {
        if (existingIds.has(localScore.id)) continue;
        await cloudRepo.saveScore(localScore);
        imported += 1;
      }

      await get().refresh(cloudRepo);
      set({ importingLocal: false });
      return imported;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ローカル譜面の取り込みに失敗しました';
      set({ error: message, importingLocal: false });
      return 0;
    }
  },
}));
