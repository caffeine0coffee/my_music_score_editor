import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { localScoreRepository } from '../repository/LocalStorageScoreRepository';
import { SupabaseScoreRepository } from '../repository/SupabaseScoreRepository';
import { useScoreStore } from './useScoreStore';

interface AuthStoreState {
  user: User | null;
  loading: boolean;
  isConfigured: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

let initialized = false;
let lastSyncedUserId: string | null | undefined = undefined;

async function syncRepositoryForUser(user: User | null): Promise<void> {
  const nextUserId = user?.id ?? null;
  if (lastSyncedUserId === nextUserId) {
    return;
  }
  lastSyncedUserId = nextUserId;

  const scoreStore = useScoreStore.getState();
  if (user && supabase) {
    const cloudRepo = new SupabaseScoreRepository(supabase, user.id);
    await scoreStore.setRepository(cloudRepo, 'cloud');
  } else {
    await scoreStore.setRepository(localScoreRepository, 'local');
  }
}

export const useAuthStore = create<AuthStoreState>((set) => ({
  user: null,
  loading: isSupabaseConfigured,
  isConfigured: isSupabaseConfigured,
  error: null,

  initialize: async () => {
    if (initialized) return;
    initialized = true;

    if (!isSupabaseConfigured || !supabase) {
      set({ user: null, loading: false, isConfigured: false, error: null });
      await useScoreStore.getState().hydrate();
      return;
    }

    set({ loading: true, error: null });
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        set({ error: error.message, loading: false });
        await useScoreStore.getState().hydrate();
      } else {
        const user = data.session?.user ?? null;
        set({ user, loading: false });
        await syncRepositoryForUser(user);
      }

      supabase.auth.onAuthStateChange((_event, session) => {
        const nextUser = session?.user ?? null;
        set({ user: nextUser, loading: false, error: null });
        void syncRepositoryForUser(nextUser);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '認証状態の初期化に失敗しました';
      set({ error: message, loading: false });
      await useScoreStore.getState().hydrate();
    }
  },

  signInWithGoogle: async () => {
    if (!supabase) {
      set({ error: 'Supabase が設定されていないためログインできません。' });
      return;
    }
    set({ error: null });
    // Flush any pending local edits before leaving the page for OAuth redirect
    await useScoreStore.getState().flushSave();

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      set({ error: `Googleログインに失敗しました: ${error.message}` });
    }
  },

  signOut: async () => {
    if (!supabase) return;
    set({ error: null });
    await useScoreStore.getState().flushSave();
    const { error } = await supabase.auth.signOut();
    if (error) {
      set({ error: `ログアウトに失敗しました: ${error.message}` });
      return;
    }
    set({ user: null });
    await syncRepositoryForUser(null);
  },

  clearError: () => set({ error: null }),
}));
