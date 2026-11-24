import { beforeEach, describe, expect, it } from 'vitest';
import type { Score } from '../../types/score';
import type { ScoreRepository } from '../../repository/ScoreRepository';
import { createNewScoreData } from '../../repository/scoreClone';
import { filterScoresByQuery, useLibraryStore } from '../useLibraryStore';

class InMemoryScoreRepository implements ScoreRepository {
  private map = new Map<string, Score>();

  constructor(initial: Score[] = []) {
    for (const s of initial) {
      this.map.set(s.id, s);
    }
  }

  async getScore(id: string): Promise<Score | null> {
    return this.map.get(id) ?? null;
  }

  async saveScore(score: Score): Promise<void> {
    this.map.set(score.id, score);
  }

  async listScores(): Promise<Score[]> {
    return Array.from(this.map.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async deleteScore(id: string): Promise<void> {
    this.map.delete(id);
  }
}

describe('useLibraryStore', () => {
  beforeEach(() => {
    useLibraryStore.setState({
      scores: [],
      loading: false,
      error: null,
      searchQuery: '',
      importingLocal: false,
    });
  });

  it('creates, duplicates, and deletes scores in the repository', async () => {
    const repo = new InMemoryScoreRepository();

    const created = await useLibraryStore.getState().createScore(repo, '春の歌');
    expect(created.title).toBe('春の歌');
    expect(useLibraryStore.getState().scores).toHaveLength(1);

    const duplicated = await useLibraryStore.getState().duplicateScore(repo, created);
    expect(duplicated.id).not.toBe(created.id);
    expect(duplicated.title).toBe('春の歌 (コピー)');
    expect(useLibraryStore.getState().scores).toHaveLength(2);

    await useLibraryStore.getState().deleteScore(repo, created.id);
    expect(useLibraryStore.getState().scores).toHaveLength(1);
    expect(await repo.getScore(created.id)).toBeNull();
  });

  it('filters scores by title, subtitle, and composer case-insensitively', () => {
    const s1 = { ...createNewScoreData('Moonlight Sonata'), composer: 'Beethoven' };
    const s2 = { ...createNewScoreData('春の海'), subtitle: '箏と尺八のための', composer: '宮城道雄' };

    expect(filterScoresByQuery([s1, s2], '')).toHaveLength(2);
    expect(filterScoresByQuery([s1, s2], 'beethoven')).toEqual([s1]);
    expect(filterScoresByQuery([s1, s2], '尺八')).toEqual([s2]);
    expect(filterScoresByQuery([s1, s2], 'chopin')).toEqual([]);
  });

  it('imports unsynced local scores into cloud repository without duplicating existing IDs', async () => {
    const shared = createNewScoreData('既存クラウド曲');
    const localOnly = createNewScoreData('ローカル限定曲');

    const localRepo = new InMemoryScoreRepository([shared, localOnly]);
    const cloudRepo = new InMemoryScoreRepository([shared]);

    const importedCount = await useLibraryStore
      .getState()
      .importLocalScoresToCloud(cloudRepo, localRepo);

    expect(importedCount).toBe(1);
    expect(useLibraryStore.getState().scores).toHaveLength(2);
    expect(await cloudRepo.getScore(localOnly.id)).not.toBeNull();
  });
});
