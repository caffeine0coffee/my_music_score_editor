import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseScoreRepository } from '../SupabaseScoreRepository';
import { createNewScoreData } from '../scoreClone';

function createMockSupabase(overrides: {
  maybeSingle?: () => Promise<{ data: unknown; error: { message: string } | null }>;
  upsert?: (payload: unknown, options: unknown) => Promise<{ error: { message: string } | null }>;
  order?: () => Promise<{ data: unknown; error: { message: string } | null }>;
  deleteResult?: { error: { message: string } | null };
}) {
  const eqChain = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(overrides.maybeSingle ?? (async () => ({ data: null, error: null }))),
    order: vi.fn(overrides.order ?? (async () => ({ data: [], error: null }))),
  };

  const deleteEq2 = vi.fn(async () => overrides.deleteResult ?? { error: null });
  const deleteEq1 = vi.fn(() => ({ eq: deleteEq2 }));

  const tableBuilder = {
    select: vi.fn(() => eqChain),
    upsert: vi.fn(overrides.upsert ?? (async () => ({ error: null }))),
    delete: vi.fn(() => ({ eq: deleteEq1 })),
  };

  const client = {
    from: vi.fn(() => tableBuilder),
  } as unknown as SupabaseClient;

  return { client, tableBuilder, eqChain, deleteEq1, deleteEq2 };
}

describe('SupabaseScoreRepository', () => {
  it('saves a score via upsert with composite conflict target (user_id,id)', async () => {
    const score = createNewScoreData('テスト交響曲');
    const upsertSpy = vi.fn(async () => ({ error: null }));
    const { client } = createMockSupabase({ upsert: upsertSpy });

    const repo = new SupabaseScoreRepository(client, 'user-123');
    await repo.saveScore(score);

    expect(upsertSpy).toHaveBeenCalledTimes(1);
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: score.id,
        user_id: 'user-123',
        title: 'テスト交響曲',
        data: score,
      }),
      { onConflict: 'user_id,id' },
    );
  });

  it('retrieves a single score and returns null when missing', async () => {
    const score = createNewScoreData('ソナタ');
    const { client } = createMockSupabase({
      maybeSingle: async () => ({
        data: {
          id: score.id,
          user_id: 'user-123',
          title: score.title,
          composer: '',
          data: score,
          updated_at: score.updatedAt,
        },
        error: null,
      }),
    });

    const repo = new SupabaseScoreRepository(client, 'user-123');
    const loaded = await repo.getScore(score.id);
    expect(loaded?.id).toBe(score.id);
    expect(loaded?.title).toBe('ソナタ');

    const { client: emptyClient } = createMockSupabase({
      maybeSingle: async () => ({ data: null, error: null }),
    });
    const emptyRepo = new SupabaseScoreRepository(emptyClient, 'user-123');
    expect(await emptyRepo.getScore('nonexistent')).toBeNull();
  });

  it('lists scores ordered by updated_at and throws on Supabase errors', async () => {
    const s1 = createNewScoreData('曲1');
    const s2 = createNewScoreData('曲2');
    const { client } = createMockSupabase({
      order: async () => ({
        data: [
          { id: s1.id, user_id: 'u1', title: s1.title, composer: '', data: s1, updated_at: s1.updatedAt },
          { id: s2.id, user_id: 'u1', title: s2.title, composer: '', data: s2, updated_at: s2.updatedAt },
        ],
        error: null,
      }),
    });

    const repo = new SupabaseScoreRepository(client, 'u1');
    const list = await repo.listScores();
    expect(list.map((s) => s.title)).toEqual(['曲1', '曲2']);

    const { client: errClient } = createMockSupabase({
      order: async () => ({ data: null, error: { message: 'permission denied' } }),
    });
    const errRepo = new SupabaseScoreRepository(errClient, 'u1');
    await expect(errRepo.listScores()).rejects.toThrow('permission denied');
  });

  it('deletes a score scoped by user_id and id', async () => {
    const { client, deleteEq1, deleteEq2 } = createMockSupabase({
      deleteResult: { error: null },
    });
    const repo = new SupabaseScoreRepository(client, 'user-abc');
    await repo.deleteScore('score_xyz');

    expect(deleteEq1).toHaveBeenCalledWith('user_id', 'user-abc');
    expect(deleteEq2).toHaveBeenCalledWith('id', 'score_xyz');
  });
});
