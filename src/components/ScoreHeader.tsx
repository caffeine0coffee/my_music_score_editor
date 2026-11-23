import React, { useEffect, useState } from 'react';
import { useScoreStore } from '../store/useScoreStore';

export const ScoreHeader: React.FC = () => {
  const title = useScoreStore((s) => s.score.title);
  const subtitle = useScoreStore((s) => s.score.subtitle ?? '');
  const composer = useScoreStore((s) => s.score.composer ?? '');
  const setScoreMetadata = useScoreStore((s) => s.setScoreMetadata);

  const [localTitle, setLocalTitle] = useState(title);
  const [localSubtitle, setLocalSubtitle] = useState(subtitle);
  const [localComposer, setLocalComposer] = useState(composer);

  useEffect(() => {
    setLocalTitle(title);
  }, [title]);

  useEffect(() => {
    setLocalSubtitle(subtitle);
  }, [subtitle]);

  useEffect(() => {
    setLocalComposer(composer);
  }, [composer]);

  const commitTitle = () => {
    const trimmed = localTitle.trim() || '無題のスコア';
    setLocalTitle(trimmed);
    if (trimmed !== title) {
      setScoreMetadata({ title: trimmed });
    }
  };

  const commitSubtitle = () => {
    const trimmed = localSubtitle.trim();
    if (trimmed !== subtitle) {
      setScoreMetadata({ subtitle: trimmed });
    }
  };

  const commitComposer = () => {
    const trimmed = localComposer.trim();
    if (trimmed !== composer) {
      setScoreMetadata({ composer: trimmed });
    }
  };

  return (
    <div className="px-5 pt-5 pb-2 border-b border-slate-100 select-text">
      <div className="flex flex-col items-center">
        <input
          type="text"
          value={localTitle}
          onChange={(e) => setLocalTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          placeholder="曲名を入力"
          aria-label="曲名"
          className="w-full max-w-md text-center text-xl sm:text-2xl font-bold text-slate-900 bg-transparent rounded-md px-2 py-0.5 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-colors"
        />
        <input
          type="text"
          value={localSubtitle}
          onChange={(e) => setLocalSubtitle(e.target.value)}
          onBlur={commitSubtitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          placeholder="サブタイトル（任意）"
          aria-label="サブタイトル"
          className="w-full max-w-sm text-center text-xs sm:text-sm text-slate-500 bg-transparent rounded-md px-2 py-0.5 mt-0.5 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-colors placeholder:text-slate-300"
        />
      </div>
      <div className="flex justify-end mt-1">
        <input
          type="text"
          value={localComposer}
          onChange={(e) => setLocalComposer(e.target.value)}
          onBlur={commitComposer}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          placeholder="作曲者・編曲者"
          aria-label="作曲者"
          className="w-44 sm:w-56 text-right text-xs sm:text-sm text-slate-600 bg-transparent rounded-md px-2 py-0.5 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-colors placeholder:text-slate-300"
        />
      </div>
    </div>
  );
};
