import type { SupabaseClient } from '@supabase/supabase-js';
import type { Score } from '../types/score';
import type { ScoreRepository } from './ScoreRepository';

interface ScoreRow {
  id: string;
  user_id: string;
  title: string;
  composer: string | null;
  data: Score;
  updated_at: string;
}

const SCORES_TABLE = 'scores';

function rowToScore(row: ScoreRow): Score {
  return {
    ...row.data,
    id: row.id,
    title: row.data.title ?? row.title ?? '無題のスコア',
    updatedAt: row.data.updatedAt ?? row.updated_at,
  };
}

/**
 * Supabase PostgreSQL implementation of ScoreRepository.
 * Relies on RLS policies (auth.uid() = user_id) and a composite primary key (user_id, id).
 */
export class SupabaseScoreRepository implements ScoreRepository {
  private readonly client: SupabaseClient;
  private readonly userId: string;

  constructor(client: SupabaseClient, userId: string) {
    this.client = client;
    this.userId = userId;
  }

  async getScore(id: string): Promise<Score | null> {
    const { data, error } = await this.client
      .from(SCORES_TABLE)
      .select('id, user_id, title, composer, data, updated_at')
      .eq('user_id', this.userId)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new Error(`譜面の読み込みに失敗しました: ${error.message}`);
    }
    if (!data) return null;
    return rowToScore(data as ScoreRow);
  }

  async saveScore(score: Score): Promise<void> {
    const payload = {
      id: score.id,
      user_id: this.userId,
      title: score.title || '無題のスコア',
      composer: score.composer ?? '',
      data: score,
      updated_at: score.updatedAt || new Date().toISOString(),
    };

    const { error } = await this.client
      .from(SCORES_TABLE)
      .upsert(payload, { onConflict: 'user_id,id' });

    if (error) {
      throw new Error(`クラウド保存に失敗しました: ${error.message}`);
    }
  }

  async listScores(): Promise<Score[]> {
    const { data, error } = await this.client
      .from(SCORES_TABLE)
      .select('id, user_id, title, composer, data, updated_at')
      .eq('user_id', this.userId)
      .order('updated_at', { ascending: false });

    if (error) {
      throw new Error(`譜面一覧の取得に失敗しました: ${error.message}`);
    }
    return ((data ?? []) as ScoreRow[]).map(rowToScore);
  }

  async deleteScore(id: string): Promise<void> {
    const { error } = await this.client
      .from(SCORES_TABLE)
      .delete()
      .eq('user_id', this.userId)
      .eq('id', id);

    if (error) {
      throw new Error(`譜面の削除に失敗しました: ${error.message}`);
    }
  }
}
