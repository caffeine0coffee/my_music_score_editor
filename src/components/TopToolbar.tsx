import React from 'react';
import { Minus, Music, Plus, Redo2, RotateCcw, Undo2 } from 'lucide-react';
import { useScoreStore } from '../store/useScoreStore';
import { KEY_SIGNATURES, TIME_SIGNATURES } from '../core/constants';
import type { ClefType } from '../types/score';

export const TopToolbar: React.FC = () => {
  const score = useScoreStore((s) => s.score);
  const activeStaffIndex = useScoreStore((s) => s.activeStaffIndex);
  const canUndo = useScoreStore((s) => s.past.length > 0);
  const canRedo = useScoreStore((s) => s.future.length > 0);

  const setClef = useScoreStore((s) => s.setClef);
  const setKeySignature = useScoreStore((s) => s.setKeySignature);
  const setTimeSignature = useScoreStore((s) => s.setTimeSignature);
  const setTempo = useScoreStore((s) => s.setTempo);
  const addMeasure = useScoreStore((s) => s.addMeasure);
  const removeLastMeasure = useScoreStore((s) => s.removeLastMeasure);
  const undo = useScoreStore((s) => s.undo);
  const redo = useScoreStore((s) => s.redo);
  const resetScore = useScoreStore((s) => s.resetScore);

  const activeStaff = score.staves[activeStaffIndex] ?? score.staves[0];
  const currentClef: ClefType = activeStaff?.clef ?? 'treble';
  const currentTimeSigValue = `${score.timeSignature.beats}/${score.timeSignature.beatType}`;
  const measureCount = score.measureMeta.length;

  const handleReset = () => {
    if (window.confirm('譜面を初期状態にリセットしますか？（元に戻すで復元できます）')) {
      resetScore();
    }
  };

  return (
    <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
        {/* Brand */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-900 text-white flex items-center justify-center shadow-xs">
            <Music className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 leading-tight">Score Editor</h1>
            <p className="text-[11px] text-slate-400 leading-tight">ローカル自動保存</p>
          </div>
        </div>

        {/* Score Metadata Controls */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Clef toggle */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => setClef('treble')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                currentClef === 'treble'
                  ? 'bg-white text-blue-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="ト音記号"
            >
              𝄞 ト音
            </button>
            <button
              type="button"
              onClick={() => setClef('bass')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                currentClef === 'bass'
                  ? 'bg-white text-blue-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="ヘ音記号"
            >
              𝄢 ヘ音
            </button>
          </div>

          {/* Key signature */}
          <label className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
            <span className="text-slate-500">調号</span>
            <select
              value={score.keySignature}
              onChange={(e) => setKeySignature(e.target.value)}
              className="bg-transparent font-medium text-slate-800 focus:outline-none cursor-pointer"
              aria-label="調号"
            >
              {KEY_SIGNATURES.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>

          {/* Time signature */}
          <label className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
            <span className="text-slate-500">拍子</span>
            <select
              value={currentTimeSigValue}
              onChange={(e) => {
                const found = TIME_SIGNATURES.find((t) => t.value === e.target.value);
                if (found) setTimeSignature(found.ts);
              }}
              className="bg-transparent font-medium text-slate-800 focus:outline-none cursor-pointer"
              aria-label="拍子記号"
            >
              {TIME_SIGNATURES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          {/* Tempo */}
          <label className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
            <span className="text-slate-500">♩=</span>
            <input
              type="number"
              min={20}
              max={300}
              value={score.tempo}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (!Number.isNaN(val) && val >= 20 && val <= 300) {
                  setTempo(val);
                }
              }}
              className="w-12 bg-transparent font-medium text-slate-800 focus:outline-none text-right"
              aria-label="テンポ (BPM)"
            />
          </label>

          {/* Measures */}
          <div className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-0.5">
            <button
              type="button"
              onClick={removeLastMeasure}
              disabled={measureCount <= 1}
              className="p-1 rounded hover:bg-slate-200/70 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700"
              title="最後の小節を削除"
              aria-label="小節を削除"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="px-1 font-medium text-slate-700 tabular-nums">
              {measureCount}小節
            </span>
            <button
              type="button"
              onClick={addMeasure}
              className="p-1 rounded hover:bg-slate-200/70 text-slate-700"
              title="小節を追加"
              aria-label="小節を追加"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* History & Reset */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
            title="元に戻す (Ctrl+Z)"
            aria-label="元に戻す"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
            title="やり直す (Ctrl+Y / Ctrl+Shift+Z)"
            aria-label="やり直す"
          >
            <Redo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="ml-1 p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition-colors"
            title="譜面をクリア"
            aria-label="譜面をクリア"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
