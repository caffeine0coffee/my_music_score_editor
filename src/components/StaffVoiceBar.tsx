import React from 'react';
import { Plus, X } from 'lucide-react';
import { useScoreStore } from '../store/useScoreStore';
import { MAX_STAVES, MAX_VOICES_PER_STAFF, VOICE_LABELS } from '../core/constants';

export const StaffVoiceBar: React.FC = () => {
  const staves = useScoreStore((s) => s.score.staves);
  const activeStaffIndex = useScoreStore((s) => s.activeStaffIndex);
  const activeVoiceIndex = useScoreStore((s) => s.activeVoiceIndex);

  const setActiveStaff = useScoreStore((s) => s.setActiveStaff);
  const setActiveVoice = useScoreStore((s) => s.setActiveVoice);
  const addStaff = useScoreStore((s) => s.addStaff);
  const removeStaff = useScoreStore((s) => s.removeStaff);
  const addVoice = useScoreStore((s) => s.addVoice);
  const removeVoice = useScoreStore((s) => s.removeVoice);

  const activeStaff = staves[activeStaffIndex] ?? staves[0];
  if (!activeStaff) return null;

  return (
    <div className="w-full max-w-5xl mx-auto mb-2.5">
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 px-3 py-2 flex flex-wrap items-center justify-between gap-2.5 text-xs">
        {/* Left: Staves */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-0.5">
            五線
          </span>
          {staves.map((staff, idx) => {
            const isActive = idx === activeStaffIndex;
            const clefGlyph = staff.clef === 'treble' ? '𝄞' : '𝄢';
            return (
              <div
                key={staff.id}
                className={`inline-flex items-center rounded-lg border transition-colors ${
                  isActive
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveStaff(idx)}
                  className="px-2.5 py-1 font-medium inline-flex items-center gap-1"
                  title={`五線 ${idx + 1} (${staff.clef === 'treble' ? 'ト音記号' : 'ヘ音記号'}) を選択`}
                >
                  <span>{clefGlyph}</span>
                  <span>{staff.name?.trim() ? staff.name : `五線 ${idx + 1}`}</span>
                </button>
                {staves.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeStaff(idx)}
                    className={`pr-1.5 pl-0.5 py-1 rounded-r-lg transition-colors ${
                      isActive
                        ? 'text-slate-300 hover:text-rose-300'
                        : 'text-slate-400 hover:text-rose-600'
                    }`}
                    title={`五線 ${idx + 1} を削除`}
                    aria-label={`五線 ${idx + 1} を削除`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}

          {staves.length < MAX_STAVES && (
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => addStaff('treble')}
                className="inline-flex items-center gap-0.5 px-2 py-1 rounded-lg border border-dashed border-slate-300 text-slate-600 hover:border-blue-400 hover:text-blue-700 hover:bg-blue-50/50 transition-colors"
                title="ト音記号の五線を追加"
              >
                <Plus className="w-3 h-3" />
                <span>𝄞</span>
              </button>
              <button
                type="button"
                onClick={() => addStaff('bass')}
                className="inline-flex items-center gap-0.5 px-2 py-1 rounded-lg border border-dashed border-slate-300 text-slate-600 hover:border-blue-400 hover:text-blue-700 hover:bg-blue-50/50 transition-colors"
                title="ヘ音記号の五線を追加"
              >
                <Plus className="w-3 h-3" />
                <span>𝄢</span>
              </button>
            </div>
          )}
        </div>

        {/* Right: Voices within active staff */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-0.5">
            声部
          </span>
          {activeStaff.voices.map((voice, vIdx) => {
            const isActive = vIdx === activeVoiceIndex;
            const label = VOICE_LABELS[vIdx] ?? `${vIdx + 1}th`;
            return (
              <div
                key={voice.id}
                className={`inline-flex items-center rounded-lg border transition-all ${
                  isActive
                    ? 'shadow-xs font-semibold'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
                style={
                  isActive
                    ? {
                        backgroundColor: voice.color,
                        borderColor: voice.color,
                        color: '#ffffff',
                      }
                    : undefined
                }
              >
                <button
                  type="button"
                  onClick={() => setActiveVoice(vIdx)}
                  className="px-2.5 py-1 inline-flex items-center gap-1.5"
                  title={`${label} 声部に切替 (Alt+${vIdx + 1})`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      backgroundColor: isActive ? '#ffffff' : voice.color,
                    }}
                  />
                  <span>{label}</span>
                </button>
                {activeStaff.voices.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeVoice(activeStaffIndex, vIdx)}
                    className={`pr-1.5 pl-0.5 py-1 rounded-r-lg transition-colors ${
                      isActive ? 'text-white/75 hover:text-white' : 'text-slate-400 hover:text-rose-600'
                    }`}
                    title={`${label} 声部を削除`}
                    aria-label={`${label} 声部を削除`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}

          {activeStaff.voices.length < MAX_VOICES_PER_STAFF && (
            <button
              type="button"
              onClick={() => addVoice(activeStaffIndex)}
              className="inline-flex items-center gap-0.5 px-2 py-1 rounded-lg border border-dashed border-slate-300 text-slate-600 hover:border-blue-400 hover:text-blue-700 hover:bg-blue-50/50 transition-colors"
              title="声部を追加"
              aria-label="声部を追加"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
