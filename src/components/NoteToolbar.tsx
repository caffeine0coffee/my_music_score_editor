import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Clipboard,
  Copy,
  CopyPlus,
  Layers,
  MousePointer2,
  PenTool,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useScoreStore } from '../store/useScoreStore';
import {
  DURATION_OPTIONS,
  DYNAMIC_MARKS,
  MAX_VOICES_PER_STAFF,
  VOICE_COLORS,
  VOICE_LABELS,
} from '../core/constants';
import type { Accidental, BaseDuration, DynamicMark } from '../types/score';

export const NoteIcon: React.FC<{ duration: BaseDuration; className?: string }> = ({
  duration,
  className = 'w-4 h-4',
}) => {
  switch (duration) {
    case 'w':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2">
          <ellipse cx="12" cy="14" rx="5.5" ry="3.8" transform="rotate(-12 12 14)" />
        </svg>
      );
    case 'h':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
          <ellipse cx="9.5" cy="16.5" rx="4.2" ry="3" transform="rotate(-20 9.5 16.5)" />
          <line x1="13.5" y1="16" x2="13.5" y2="4" />
        </svg>
      );
    case 'q':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor" stroke="currentColor" strokeWidth="2">
          <ellipse cx="9.5" cy="16.5" rx="4.2" ry="3" transform="rotate(-20 9.5 16.5)" stroke="none" />
          <line x1="13.3" y1="16" x2="13.3" y2="4" />
        </svg>
      );
    case '8':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor" stroke="currentColor" strokeWidth="2">
          <ellipse cx="9" cy="16.5" rx="4" ry="2.9" transform="rotate(-20 9 16.5)" stroke="none" />
          <line x1="12.7" y1="16" x2="12.7" y2="4" />
          <path d="M12.7 4.5 C16.5 6 17.5 9.5 15.5 12" fill="none" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case '16':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor" stroke="currentColor" strokeWidth="2">
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
  const score = useScoreStore((s) => s.score);
  const activeStaffIndex = useScoreStore((s) => s.activeStaffIndex);
  const activeVoiceIndex = useScoreStore((s) => s.activeVoiceIndex);
  const interactionMode = useScoreStore((s) => s.interactionMode);

  const selectedDuration = useScoreStore((s) => s.selectedDuration);
  const dotted = useScoreStore((s) => s.dotted);
  const triplet = useScoreStore((s) => s.triplet);
  const selectedAccidental = useScoreStore((s) => s.selectedAccidental);
  const chordMode = useScoreStore((s) => s.chordMode);
  const selectedNote = useScoreStore((s) => s.selectedNote);
  const selectedNotes = useScoreStore((s) => s.selectedNotes);
  const selectedMeasureRange = useScoreStore((s) => s.selectedMeasureRange);
  const clipboard = useScoreStore((s) => s.clipboard);
  const zoom = useScoreStore((s) => s.zoom);

  const setInteractionMode = useScoreStore((s) => s.setInteractionMode);
  const setSelectedDuration = useScoreStore((s) => s.setSelectedDuration);
  const toggleDotted = useScoreStore((s) => s.toggleDotted);
  const toggleTriplet = useScoreStore((s) => s.toggleTriplet);
  const toggleAccidental = useScoreStore((s) => s.toggleAccidental);
  const toggleChordMode = useScoreStore((s) => s.toggleChordMode);
  const shiftSelectedNote = useScoreStore((s) => s.shiftSelectedNote);
  const deleteSelectedNote = useScoreStore((s) => s.deleteSelectedNote);

  const toggleTieOnSelected = useScoreStore((s) => s.toggleTieOnSelected);
  const toggleSlurOnSelected = useScoreStore((s) => s.toggleSlurOnSelected);
  const setDynamicOnSelected = useScoreStore((s) => s.setDynamicOnSelected);
  const toggleRepeatStart = useScoreStore((s) => s.toggleRepeatStart);
  const toggleRepeatEnd = useScoreStore((s) => s.toggleRepeatEnd);

  const copySelection = useScoreStore((s) => s.copySelection);
  const pasteToActiveVoice = useScoreStore((s) => s.pasteToActiveVoice);
  const duplicateSelectionToVoice = useScoreStore((s) => s.duplicateSelectionToVoice);
  const setZoom = useScoreStore((s) => s.setZoom);
  const resetZoom = useScoreStore((s) => s.resetZoom);

  const [dupMenuOpen, setDupMenuOpen] = useState(false);

  const isWhole = selectedDuration === 'w';
  const hasNoteSelection = selectedNotes.length > 0 || selectedNote !== null;
  const hasAnySelection = hasNoteSelection || selectedMeasureRange !== null;

  // Inspect currently selected primary note for active states of tie/slur/dynamic
  const primaryNoteObj = selectedNote
    ? score.staves[selectedNote.staffIndex]?.voices[selectedNote.voiceIndex]?.measures[
        selectedNote.measureIndex
      ]?.notes.find((n) => n.id === selectedNote.noteId) ?? null
    : null;

  const targetMeasureIdx =
    selectedMeasureRange?.startMeasure ?? selectedNote?.measureIndex ?? null;
  const targetEndMeasureIdx =
    selectedMeasureRange?.endMeasure ?? selectedNote?.measureIndex ?? null;
  const isRepeatStart =
    targetMeasureIdx !== null ? Boolean(score.measureMeta[targetMeasureIdx]?.repeatStart) : false;
  const isRepeatEnd =
    targetEndMeasureIdx !== null ? Boolean(score.measureMeta[targetEndMeasureIdx]?.repeatEnd) : false;

  const activeStaff = score.staves[activeStaffIndex] ?? score.staves[0];
  const currentVoiceCount = activeStaff?.voices.length ?? 1;

  return (
    <div className="w-full max-w-5xl mx-auto mb-3 space-y-2">
      {/* Row 1: Mode, Durations, Accidentals, Chord, Pitch/Delete (hidden on small mobile where MobileBottomDock takes over) */}
      <div className="hidden md:flex bg-white rounded-xl shadow-xs border border-slate-200 px-3 py-2 flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Input / Select mode */}
          <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5 gap-0.5">
            <button
              type="button"
              onClick={() => setInteractionMode('input')}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                interactionMode === 'input'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="音符入力モード (V)"
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>入力</span>
            </button>
            <button
              type="button"
              onClick={() => setInteractionMode('select')}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                interactionMode === 'select'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="音符範囲選択モード (S / V)"
            >
              <MousePointer2 className="w-3.5 h-3.5" />
              <span>選択</span>
            </button>
          </div>

          <div className="h-5 w-px bg-slate-200" />

          {/* Base Durations */}
          <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5 gap-0.5">
            {DURATION_OPTIONS.map((opt) => {
              const active = selectedDuration === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    setSelectedDuration(opt.key);
                    if (interactionMode === 'select') setInteractionMode('input');
                  }}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                    active
                      ? 'bg-blue-900 text-white shadow-xs'
                      : 'text-slate-700 hover:bg-white/80'
                  }`}
                  title={`${opt.label} (${opt.shortcut})`}
                >
                  <NoteIcon duration={opt.key} />
                  <span>{opt.shortLabel}</span>
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

          <div className="h-5 w-px bg-slate-200" />

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

          <div className="h-5 w-px bg-slate-200" />

          {/* Chord Mode */}
          <button
            type="button"
            onClick={toggleChordMode}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              chordMode
                ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
            title="和音追加モード (C / Shift+クリック)"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>和音</span>
          </button>
        </div>

        {/* Right: Pitch shift & delete */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftSelectedNote(1)}
            disabled={!hasAnySelection}
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="選択中の音符を上げる (↑)"
            aria-label="音高を上げる"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => shiftSelectedNote(-1)}
            disabled={!hasAnySelection}
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="選択中の音符を下げる (↓)"
            aria-label="音高を下げる"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={deleteSelectedNote}
            disabled={!hasAnySelection}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-rose-600 hover:bg-rose-50 hover:border-rose-200 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-medium transition-colors"
            title="選択中の音符・小節を削除 (Delete)"
            aria-label="選択を削除"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>削除</span>
          </button>
        </div>
      </div>

      {/* Row 2: Notation (Tie/Slur/Dynamic/Repeats), Copy/Paste/Duplicate to Voice, Zoom */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Mobile mode toggle (shown only on mobile) */}
          <div className="inline-flex md:hidden items-center rounded-lg bg-slate-100 p-0.5 gap-0.5 mr-1">
            <button
              type="button"
              onClick={() => setInteractionMode('input')}
              className={`px-2 py-1 rounded-md font-medium ${
                interactionMode === 'input' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
              title="入力モード"
            >
              <PenTool className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setInteractionMode('select')}
              className={`px-2 py-1 rounded-md font-medium ${
                interactionMode === 'select' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
              }`}
              title="選択モード"
            >
              <MousePointer2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Tie & Slur */}
          <button
            type="button"
            onClick={toggleTieOnSelected}
            disabled={!hasNoteSelection}
            className={`px-2.5 py-1 rounded-lg font-medium border transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${
              primaryNoteObj?.tieToNext
                ? 'bg-blue-50 border-blue-400 text-blue-800'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
            title="タイ（次の音符へ接続・小節またぎ対応）(L)"
          >
            ⌒ タイ
          </button>
          <button
            type="button"
            onClick={toggleSlurOnSelected}
            disabled={!hasNoteSelection}
            className={`px-2.5 py-1 rounded-lg font-medium border transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${
              primaryNoteObj?.slurStart
                ? 'bg-blue-50 border-blue-400 text-blue-800'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
            title="スラー（単一選択で次音符まで／範囲選択で先頭〜末尾）"
          >
            ◡ スラー
          </button>

          {/* Dynamics */}
          <label className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
            <span className="text-slate-500">強弱</span>
            <select
              value={primaryNoteObj?.dynamic ?? ''}
              disabled={!hasNoteSelection}
              onChange={(e) => {
                const val = e.target.value as DynamicMark | '';
                setDynamicOnSelected(val === '' ? null : val);
              }}
              className="bg-transparent font-serif italic font-bold text-slate-800 focus:outline-none cursor-pointer disabled:opacity-40"
              aria-label="強弱記号"
            >
              <option value="">—</option>
              {DYNAMIC_MARKS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>

          <div className="h-4 w-px bg-slate-200 hidden sm:block" />

          {/* Repeats */}
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => toggleRepeatStart()}
              disabled={targetMeasureIdx === null}
              className={`px-2 py-1 rounded-lg font-mono font-bold border transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${
                isRepeatStart
                  ? 'bg-amber-50 border-amber-400 text-amber-900'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
              title="選択中の小節に反復開始記号 (|:) を設定"
            >
              |:
            </button>
            <button
              type="button"
              onClick={() => toggleRepeatEnd()}
              disabled={targetEndMeasureIdx === null}
              className={`px-2 py-1 rounded-lg font-mono font-bold border transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${
                isRepeatEnd
                  ? 'bg-amber-50 border-amber-400 text-amber-900'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
              title="選択中の小節に反復終了記号 (:|) を設定"
            >
              :|
            </button>
          </div>

          <div className="h-4 w-px bg-slate-200 hidden sm:block" />

          {/* Copy / Paste / Duplicate to another voice */}
          <div className="inline-flex items-center gap-1 relative">
            <button
              type="button"
              onClick={copySelection}
              disabled={!hasAnySelection}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
              title="選択中の小節／音符をコピー (Ctrl+C)"
            >
              <Copy className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">コピー</span>
            </button>
            <button
              type="button"
              onClick={() => pasteToActiveVoice()}
              disabled={!clipboard}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
              title="アクティブ声部へペースト (Ctrl+V)"
            >
              <Clipboard className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ペースト</span>
            </button>

            {/* One-tap duplicate to another voice */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setDupMenuOpen((o) => !o)}
                disabled={!hasAnySelection}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-blue-200 bg-blue-50/70 text-blue-800 hover:bg-blue-100/70 disabled:opacity-35 disabled:cursor-not-allowed font-medium transition-colors"
                title="選択中の小節・音符を別声部へワンタップ複製"
              >
                <CopyPlus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">別声部へ複製</span>
              </button>
              {dupMenuOpen && hasAnySelection && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setDupMenuOpen(false)}
                  />
                  <div className="absolute left-0 mt-1.5 w-44 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-30">
                    <div className="px-2.5 py-1 text-[11px] font-semibold text-slate-400">
                      複製先の声部を選択
                    </div>
                    {Array.from({ length: MAX_VOICES_PER_STAFF }, (_, vIdx) => {
                      if (vIdx === activeVoiceIndex) return null;
                      const exists = vIdx < currentVoiceCount;
                      const label = VOICE_LABELS[vIdx];
                      return (
                        <button
                          key={vIdx}
                          type="button"
                          onClick={() => {
                            duplicateSelectionToVoice(vIdx);
                            setDupMenuOpen(false);
                          }}
                          className="w-full px-2.5 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center justify-between"
                        >
                          <span className="inline-flex items-center gap-1.5 font-medium">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: VOICE_COLORS[vIdx] }}
                            />
                            {label} 声部へ複製
                          </span>
                          {!exists && (
                            <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                              新規
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Zoom controls */}
        <div className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-1 py-0.5">
          <button
            type="button"
            onClick={() => setZoom(zoom - 0.15)}
            className="p-1 rounded hover:bg-slate-200/70 text-slate-700"
            title="縮小"
            aria-label="縮小"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={resetZoom}
            className="px-1.5 text-[11px] font-medium text-slate-700 tabular-nums hover:text-blue-700"
            title="100%にリセット"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={() => setZoom(zoom + 0.15)}
            className="p-1 rounded hover:bg-slate-200/70 text-slate-700"
            title="拡大"
            aria-label="拡大"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
