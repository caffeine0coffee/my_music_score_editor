import React from 'react';
import { ArrowDown, ArrowUp, Layers, Plus, Trash2 } from 'lucide-react';
import { useScoreStore } from '../store/useScoreStore';
import { DURATION_OPTIONS, MAX_VOICES_PER_STAFF, VOICE_LABELS } from '../core/constants';
import { NoteIcon } from './NoteToolbar';
import type { Accidental } from '../types/score';

const ACCIDENTALS: { value: Accidental; symbol: string; label: string }[] = [
  { value: '#', symbol: '♯', label: 'シャープ' },
  { value: 'b', symbol: '♭', label: 'フラット' },
  { value: 'n', symbol: '♮', label: 'ナチュラル' },
];

export const MobileBottomDock: React.FC = () => {
  const staves = useScoreStore((s) => s.score.staves);
  const activeStaffIndex = useScoreStore((s) => s.activeStaffIndex);
  const activeVoiceIndex = useScoreStore((s) => s.activeVoiceIndex);

  const selectedDuration = useScoreStore((s) => s.selectedDuration);
  const dotted = useScoreStore((s) => s.dotted);
  const triplet = useScoreStore((s) => s.triplet);
  const selectedAccidental = useScoreStore((s) => s.selectedAccidental);
  const chordMode = useScoreStore((s) => s.chordMode);
  const selectedNote = useScoreStore((s) => s.selectedNote);
  const selectedNotes = useScoreStore((s) => s.selectedNotes);
  const selectedMeasureRange = useScoreStore((s) => s.selectedMeasureRange);

  const setActiveVoice = useScoreStore((s) => s.setActiveVoice);
  const addVoice = useScoreStore((s) => s.addVoice);
  const setInteractionMode = useScoreStore((s) => s.setInteractionMode);
  const setSelectedDuration = useScoreStore((s) => s.setSelectedDuration);
  const toggleDotted = useScoreStore((s) => s.toggleDotted);
  const toggleTriplet = useScoreStore((s) => s.toggleTriplet);
  const toggleAccidental = useScoreStore((s) => s.toggleAccidental);
  const toggleChordMode = useScoreStore((s) => s.toggleChordMode);
  const shiftSelectedNote = useScoreStore((s) => s.shiftSelectedNote);
  const deleteSelectedNote = useScoreStore((s) => s.deleteSelectedNote);

  const activeStaff = staves[activeStaffIndex] ?? staves[0];
  const isWhole = selectedDuration === 'w';
  const hasAnySelection =
    selectedNotes.length > 0 || selectedNote !== null || selectedMeasureRange !== null;

  return (
    <nav
      aria-label="モバイル編集ドック"
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
    >
      {/* Top row: Voice switcher + Pitch nudge + Delete */}
      <div className="flex items-center justify-between gap-1.5 mb-1.5">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {activeStaff?.voices.map((voice, vIdx) => {
            const isActive = vIdx === activeVoiceIndex;
            const label = VOICE_LABELS[vIdx] ?? `${vIdx + 1}th`;
            return (
              <button
                key={voice.id}
                type="button"
                onClick={() => setActiveVoice(vIdx)}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 border shrink-0 transition-colors ${
                  isActive ? 'text-white shadow-xs' : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
                style={
                  isActive
                    ? { backgroundColor: voice.color, borderColor: voice.color }
                    : undefined
                }
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: isActive ? '#ffffff' : voice.color }}
                />
                {label}
              </button>
            );
          })}
          {activeStaff && activeStaff.voices.length < MAX_VOICES_PER_STAFF && (
            <button
              type="button"
              onClick={() => addVoice(activeStaffIndex)}
              className="p-1 rounded-md border border-dashed border-slate-300 text-slate-500 shrink-0"
              aria-label="声部を追加"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Thumb-friendly pitch nudge & delete */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => shiftSelectedNote(1)}
            disabled={!hasAnySelection}
            className="w-9 h-8 rounded-lg border border-slate-200 bg-slate-50 active:bg-blue-100 text-slate-800 flex items-center justify-center disabled:opacity-30"
            aria-label="音高を上げる"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => shiftSelectedNote(-1)}
            disabled={!hasAnySelection}
            className="w-9 h-8 rounded-lg border border-slate-200 bg-slate-50 active:bg-blue-100 text-slate-800 flex items-center justify-center disabled:opacity-30"
            aria-label="音高を下げる"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={deleteSelectedNote}
            disabled={!hasAnySelection}
            className="w-9 h-8 rounded-lg border border-slate-200 bg-slate-50 active:bg-rose-100 text-rose-600 flex items-center justify-center disabled:opacity-30"
            aria-label="選択を削除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom row: Durations, Dot/Triplet, Accidentals, Chord */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
        <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5 gap-0.5 shrink-0">
          {DURATION_OPTIONS.map((opt) => {
            const active = selectedDuration === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  setSelectedDuration(opt.key);
                  setInteractionMode('input');
                }}
                className={`w-9 h-9 rounded-md flex items-center justify-center transition-colors ${
                  active ? 'bg-blue-900 text-white shadow-xs' : 'text-slate-700'
                }`}
                aria-label={opt.label}
              >
                <NoteIcon duration={opt.key} className="w-4 h-4" />
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={toggleDotted}
          disabled={isWhole}
          className={`h-9 px-2.5 rounded-lg text-xs font-bold border shrink-0 disabled:opacity-30 ${
            dotted
              ? 'bg-blue-50 border-blue-400 text-blue-800'
              : 'bg-white border-slate-200 text-slate-700'
          }`}
          aria-label="付点"
        >
          •
        </button>

        <button
          type="button"
          onClick={toggleTriplet}
          disabled={isWhole}
          className={`h-9 px-2.5 rounded-lg text-xs font-bold border shrink-0 disabled:opacity-30 ${
            triplet
              ? 'bg-blue-50 border-blue-400 text-blue-800'
              : 'bg-white border-slate-200 text-slate-700'
          }`}
          aria-label="3連符"
        >
          3
        </button>

        <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5 gap-0.5 shrink-0">
          {ACCIDENTALS.map((acc) => {
            const active = selectedAccidental === acc.value;
            return (
              <button
                key={acc.value}
                type="button"
                onClick={() => toggleAccidental(acc.value)}
                className={`w-8 h-8 rounded-md text-sm font-semibold ${
                  active ? 'bg-blue-900 text-white' : 'text-slate-700'
                }`}
                aria-label={acc.label}
              >
                {acc.symbol}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={toggleChordMode}
          className={`h-9 px-2.5 rounded-lg text-xs font-semibold border inline-flex items-center gap-1 shrink-0 ${
            chordMode
              ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
              : 'bg-white border-slate-200 text-slate-700'
          }`}
          aria-label="和音モード"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>和音</span>
        </button>
      </div>
    </nav>
  );
};
