import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Cloud,
  CloudOff,
  CloudUpload,
  Copy,
  FileMusic,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useScoreStore } from '../store/useScoreStore';
import { useLibraryStore, filterScoresByQuery } from '../store/useLibraryStore';
import { localScoreRepository } from '../repository/LocalStorageScoreRepository';
import { AuthMenu } from './AuthMenu';
import type { Score } from '../types/score';

interface ScoreLibraryViewProps {
  onBackToEditor: () => void;
}

function formatUpdatedAt(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return '';
  }
}

export const ScoreLibraryView: React.FC<ScoreLibraryViewProps> = ({ onBackToEditor }) => {
  const repository = useScoreStore((s) => s.repository);
  const storageMode = useScoreStore((s) => s.storageMode);
  const currentScoreId = useScoreStore((s) => s.score.id);
  const loadScore = useScoreStore((s) => s.loadScore);
  const flushSave = useScoreStore((s) => s.flushSave);

  const scores = useLibraryStore((s) => s.scores);
  const loading = useLibraryStore((s) => s.loading);
  const error = useLibraryStore((s) => s.error);
  const searchQuery = useLibraryStore((s) => s.searchQuery);
  const importingLocal = useLibraryStore((s) => s.importingLocal);
  const setSearchQuery = useLibraryStore((s) => s.setSearchQuery);
  const refresh = useLibraryStore((s) => s.refresh);
  const createScore = useLibraryStore((s) => s.createScore);
  const duplicateScore = useLibraryStore((s) => s.duplicateScore);
  const deleteScore = useLibraryStore((s) => s.deleteScore);
  const importLocalScoresToCloud = useLibraryStore((s) => s.importLocalScoresToCloud);

  const [pendingLocalCount, setPendingLocalCount] = useState(0);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      await flushSave();
      await refresh(repository);
    })();
  }, [repository, flushSave, refresh]);

  // Check if there are local scores not yet in the cloud when logged in
  useEffect(() => {
    if (storageMode !== 'cloud') {
      setPendingLocalCount(0);
      return;
    }
    let cancelled = false;
    void (async () => {
      const localList = await localScoreRepository.listScores();
      if (cancelled) return;
      const cloudIds = new Set(scores.map((s) => s.id));
      const unsynced = localList.filter((s) => !cloudIds.has(s.id));
      setPendingLocalCount(unsynced.length);
    })();
    return () => {
      cancelled = true;
    };
  }, [storageMode, scores]);

  const filteredScores = useMemo(
    () => filterScoresByQuery(scores, searchQuery),
    [scores, searchQuery],
  );

  const handleOpen = (score: Score) => {
    loadScore(score);
    onBackToEditor();
  };

  const handleCreate = async () => {
    setBusyId('__create__');
    try {
      const created = await createScore(repository);
      loadScore(created);
      onBackToEditor();
    } finally {
      setBusyId(null);
    }
  };

  const handleDuplicate = async (e: React.MouseEvent, source: Score) => {
    e.stopPropagation();
    setBusyId(source.id);
    try {
      await duplicateScore(repository, source);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (e: React.MouseEvent, target: Score) => {
    e.stopPropagation();
    const label = target.title || '無題のスコア';
    if (!window.confirm(`「${label}」を削除しますか？この操作は取り消せません。`)) {
      return;
    }
    setBusyId(target.id);
    try {
      await deleteScore(repository, target.id);
      // If we deleted the currently open score, switch to another one or create a fresh one
      if (target.id === currentScoreId) {
        const remaining = useLibraryStore.getState().scores;
        if (remaining.length > 0) {
          loadScore(remaining[0]);
        } else {
          const fresh = await createScore(repository);
          loadScore(fresh);
        }
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleImportLocal = async () => {
    setImportMessage(null);
    const count = await importLocalScoresToCloud(repository);
    if (count > 0) {
      setImportMessage(`${count} 件のローカル譜面をクラウドへ取り込みました。`);
    } else {
      setImportMessage('取り込み対象の新規ローカル譜面はありませんでした。');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onBackToEditor}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-medium transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>エディタへ戻る</span>
            </button>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900">マイ譜面一覧</h1>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                  storageMode === 'cloud'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                {storageMode === 'cloud' ? (
                  <>
                    <Cloud className="w-3 h-3" />
                    クラウド同期
                  </>
                ) : (
                  <>
                    <CloudOff className="w-3 h-3" />
                    ローカル保存
                  </>
                )}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={busyId === '__create__'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-900 text-white hover:bg-blue-800 disabled:opacity-50 text-xs font-semibold shadow-xs transition-colors"
            >
              {busyId === '__create__' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              <span>新規スコア作成</span>
            </button>
            <AuthMenu />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-3 sm:px-4 py-5 space-y-4">
        {/* Local -> Cloud import banner */}
        {storageMode === 'cloud' && pendingLocalCount > 0 && (
          <div className="rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-sm text-blue-950">
              <CloudUpload className="w-5 h-5 text-blue-700 shrink-0" />
              <p>
                この端末のローカルストレージに未同期の譜面が{' '}
                <strong className="font-semibold">{pendingLocalCount} 件</strong> あります。
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleImportLocal()}
              disabled={importingLocal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50 text-xs font-semibold transition-colors"
            >
              {importingLocal ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CloudUpload className="w-3.5 h-3.5" />
              )}
              <span>クラウドへ取り込む</span>
            </button>
          </div>
        )}

        {importMessage && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800 flex items-center justify-between">
            <span>{importMessage}</span>
            <button
              type="button"
              onClick={() => setImportMessage(null)}
              className="text-emerald-600 hover:text-emerald-900"
              aria-label="閉じる"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
            {error}
          </div>
        )}

        {/* Search bar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="relative flex-1 min-w-56 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="曲名・作曲者で検索..."
              className="w-full pl-9 pr-8 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              aria-label="譜面を検索"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="検索をクリア"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="text-xs text-slate-500 tabular-nums">
            {filteredScores.length} / {scores.length} 件
          </p>
        </div>

        {/* Score Cards */}
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm">譜面を読み込んでいます...</span>
          </div>
        ) : filteredScores.length === 0 ? (
          <div className="py-16 rounded-2xl border border-dashed border-slate-300 bg-white flex flex-col items-center justify-center gap-3 text-center px-4">
            <FileMusic className="w-10 h-10 text-slate-300" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-700">
                {searchQuery ? '条件に一致する譜面が見つかりません' : '保存された譜面がまだありません'}
              </p>
              <p className="text-xs text-slate-500">
                {searchQuery
                  ? '別のキーワードで検索するか、検索条件をクリアしてください。'
                  : '「新規スコア作成」ボタンから最初の譜面を作成できます。'}
              </p>
            </div>
            {!searchQuery && (
              <button
                type="button"
                onClick={() => void handleCreate()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-900 text-white hover:bg-blue-800 text-xs font-semibold transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>新規スコア作成</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredScores.map((item) => {
              const isCurrent = item.id === currentScoreId;
              const isBusy = busyId === item.id;
              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleOpen(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleOpen(item);
                    }
                  }}
                  className={`group text-left rounded-xl border bg-white p-4 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                    isCurrent
                      ? 'border-blue-500 ring-2 ring-blue-500/15'
                      : 'border-slate-200 hover:border-blue-300'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-sm font-bold text-slate-900 group-hover:text-blue-900 line-clamp-1">
                        {item.title || '無題のスコア'}
                      </h2>
                      {isCurrent && (
                        <span className="shrink-0 px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-semibold">
                          編集中
                        </span>
                      )}
                    </div>
                    {item.subtitle && (
                      <p className="text-xs text-slate-500 line-clamp-1">{item.subtitle}</p>
                    )}
                    {item.composer && (
                      <p className="text-xs text-slate-500 line-clamp-1">作曲: {item.composer}</p>
                    )}

                    <div className="pt-1 flex flex-wrap gap-1.5 text-[11px] text-slate-600">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100">
                        {item.measureMeta.length}小節
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-100">
                        {item.timeSignature.beats}/{item.timeSignature.beatType}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-100">
                        調: {item.keySignature}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-100">♩={item.tempo}</span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-100">
                        {item.staves.length}五線
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-400 tabular-nums">
                      {formatUpdatedAt(item.updatedAt)}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => void handleDuplicate(e, item)}
                        disabled={isBusy}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-blue-800 hover:bg-blue-50 disabled:opacity-40 transition-colors"
                        title="この譜面を複製"
                        aria-label="複製"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => void handleDelete(e, item)}
                        disabled={isBusy}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-40 transition-colors"
                        title="この譜面を削除"
                        aria-label="削除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};
