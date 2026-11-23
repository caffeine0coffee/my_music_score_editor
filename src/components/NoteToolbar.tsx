import React from 'react';
import { ArrowDown, ArrowUp, Layers, Trash2 } from 'lucide-react';
import { useScoreStore } from '../store/useScoreStore';
import { DURATION_OPTIONS } from '../core/constants';
import type { Accidental, BaseDuration } from '../types/score';

const NoteIcon: React.FC<{ duration: BaseDuration }> = ({ duration }) => {
  switch (duration) {
    case 'w':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2">
          <ellipse cx="12" cy="14" rx="5.5" ry="3.8" transform="rotate(-12 12 14)" />
        </svg>
      );
    case 'h':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
          <ellipse cx="9.5" cy="16.5" rx="4.2" ry="3" transform="rotate(-20 9.5 16.5)" />
          <line x1="13.5" y1="16" x2="13.5" y2="4" />
        </svg>
      );
    case 'q':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" stroke="currentColor" strokeWidth="2">
          <ellipse cx="9.5" cy="16.5" rx="4.2" ry="3" transform="rotate(-20 9.5 16.5)" stroke="none" />
          <line x1="13.3" y1="16" x2="13.3" y2="4" />
        </svg>
      );
    case '8':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" stroke="currentColor" strokeWidth="2">
          <ellipse cx="9" cy="16.5" rx="4" ry="2.9" transform="rotate(-20 9 16.5)" stroke="none" />
          <line x1="12.7" y1="16" x2="12.7" y2="4" />
          <path d="M12.7 4.5 C16.5 6 17.5 9.5 15.5 12" fill="none" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case '16':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" stroke="currentColor" strokeWidth="2">
          <ellipse cx="9" cy="16.5" rx="4" ry="2.9" transform="rotate(-20 9 16.5)" stroke="none" />
          <line x1="12.7" y1="16" x2="12.7" y2="4" />
          <path d="M12.7 4.5 C16.5 5.8 17.5 8.5 15.8 10.5" fill="none" strokeWidth="1.9" strokeLinecap="round" />
          <path d="M12.7 8.5 C16.5 9.8 17.5 12.5 15.8 14.5" fill="none" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      );
  }
};

const ACCIDENTALS: { value: Accidental; symbol: string; label: string }[] = [
  { value: '#', symbol: '♯', label: 'シャープ' },
  { value: 'b', symbol: '♭', label: 'フラット' },
  { value: 'n', symbol: '♮', label: 'ナチュラル' },
];

export const NoteToolbar: React.FC = () => {
  const selectedDuration = useScoreStore((s) => s.selectedDuration);
  const dotted = useScoreStore((s) => s.dotted);
  const triplet = useScoreStore((s) => s.triplet);
  const selectedAccidental = useScoreStore((s) => s.selectedAccidental);
  const chordMode = useScoreStore((s) => s.chordMode);
  const selectedNote = useScoreStore((s) => s.selectedNote);

  const setSelectedDuration = useScoreStore((s) => s.setSelectedDuration);
  const toggleDotted = useScoreStore((s) => s.toggleDotted);
  const toggleTriplet = useScoreStore((s) => s.toggleTriplet);
  const toggleAccidental = useScoreStore((s) => s.toggleAccidental);
  const toggleChordMode = useScoreStore((s) => s.toggleChordMode);
  const shiftSelectedNote = useScoreStore((s) => s.shiftSelectedNote);
  const deleteSelectedNote = useScoreStore((s) => s.deleteSelectedNote);

  const isWhole = selectedDuration === 'w';

  return (
    <div className="w-full max-w-5xl mx-auto mb-3">
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
        {/* Left group: Durations, Dotted, Triplet, Accidentals */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Base Durations */}
          <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5 gap-0.5">
            {DURATION_OPTIONS.map((opt) => {
              const active = selectedDuration === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSelectedDuration(opt.key)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                    active
                      ? 'bg-blue-900 text-white shadow-xs'
                      : 'text-slate-700 hover:bg-white/80'
                  }`}
                  title={`${opt.label} (${opt.shortcut})`}
                >
                  <NoteIcon duration={opt.key} />
                  <span className="hidden sm:inline">{opt.shortLabel}</span>
                </button>
              );
            })}
          </div>

          {/* Dotted & Triplet */}
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={toggleDotted}
              disabled={isWhole}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${
                dotted
                  ? 'bg-blue-50 border-blue-400 text-blue-800'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
              title="付点 (.)"
            >
              付点 •
            </button>
            <button
              type="button"
              onClick={toggleTriplet}
              disabled={isWhole}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${
                triplet
                  ? 'bg-blue-50 border-blue-400 text-blue-800'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
              title="3連符 (T)"
            >
              3連符
            </button>
          </div>

          <div className="h-5 w-px bg-slate-200 hidden sm:block" />

          {/* Accidentals */}
          <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5 gap-0.5">
            {ACCIDENTALS.map((acc) => {
              const active = selectedAccidental === acc.value;
              return (
                <button
                  key={acc.value}
                  type="button"
                  onClick={() => toggleAccidental(acc.value)}
                  className={`w-8 py-1 rounded-md text-sm font-semibold transition-colors ${
                    active
                      ? 'bg-blue-900 text-white shadow-xs'
                      : 'text-slate-700 hover:bg-white/80'
                  }`}
                  title={acc.label}
                  aria-label={acc.label}
                >
                  {acc.symbol}
                </button>
              );
            })}
          </div>

          <div className="h-5 w-px bg-slate-200 hidden sm:block" />

          {/* Chord Mode */}
          <button
            type="button"
            onClick={toggleChordMode}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              chordMode
                ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
            title="和音追加モード (PCでは Shift+クリック でも一時的に和音追加)"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>和音</span>
          </button>
        </div>

        {/* Right group: Selected Note Operations */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftSelectedNote(1)}
            disabled={!selectedNote}
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="選択中の音符を上げる (↑)"
            aria-label="音高を上げる"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => shiftSelectedNote(-1)}
            disabled={!selectedNote}
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="選択中の音符を下げる (↓)"
            aria-label="音高を下げる"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={deleteSelectedNote}
            disabled={!selectedNote}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-rose-600 hover:bg-rose-50 hover:border-rose-200 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-medium transition-colors"
            title="選択中の音符を削除 (Delete / Backspace)"
            aria-label="選択中の音符を削除"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">削除</span>
          </button>
        </div>
      </div>
    </div>
  );
};
