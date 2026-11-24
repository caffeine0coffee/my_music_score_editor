-- =============================================================================
-- My Music Score Editor - Supabase PostgreSQL Schema & RLS Policies
-- Supabase Dashboard の SQL Editor でそのまま実行できます。
-- =============================================================================

create table if not exists public.scores (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '無題のスコア',
  composer text not null default '',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ユーザーごとの更新日時降順ソート用インデックス
create index if not exists scores_user_id_updated_at_idx
  on public.scores (user_id, updated_at desc);

-- updated_at 自動更新トリガー
create or replace function public.handle_scores_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_scores_updated_at on public.scores;
create trigger set_scores_updated_at
  before update on public.scores
  for each row
  execute function public.handle_scores_updated_at();

-- Row Level Security (RLS) を有効化
alter table public.scores enable row level security;

-- 本人の譜面のみ閲覧可能
drop policy if exists "Users can view their own scores" on public.scores;
create policy "Users can view their own scores"
  on public.scores
  for select
  using (auth.uid() = user_id);

-- 本人の譜面のみ作成可能
drop policy if exists "Users can insert their own scores" on public.scores;
create policy "Users can insert their own scores"
  on public.scores
  for insert
  with check (auth.uid() = user_id);

-- 本人の譜面のみ更新可能
drop policy if exists "Users can update their own scores" on public.scores;
create policy "Users can update their own scores"
  on public.scores
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 本人の譜面のみ削除可能
drop policy if exists "Users can delete their own scores" on public.scores;
create policy "Users can delete their own scores"
  on public.scores
  for delete
  using (auth.uid() = user_id);
