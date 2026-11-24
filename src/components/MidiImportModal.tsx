import React, { useState } from 'react';
import { FileMusic, X } from 'lucide-react';
import {
  importMidiToScore,
  type MidiInspection,
  type MidiQuantizeOption,
  type MidiTrackImportConfig,
} from '../audio/midiCodec';
import { useScoreStore } from '../store/useScoreStore';
import type { ClefType } from '../types/score';

interface MidiImportModalProps {
  buffer: ArrayBuffer;
  inspection: MidiInspection;
  fileName: string;
  onClose: () => void;
}

export const MidiImportModal: React.FC<MidiImportModalProps> = ({
  buffer,
  inspection,
  fileName,
  onClose,
}) => {
  const replaceScore = useScoreStore((s) => s.replaceScore);

  const [quantize, setQuantize] = useState<MidiQuantizeOption>('16');
  const [assignmentMode, setAssignmentMode] = useState<'staves' | 'voices'>('staves');
  const [trackConfigs, setTrackConfigs] = useState<MidiTrackImportConfig[]>(() =>
    inspection.tracks.map((t, idx) => ({
      trackIndex: t.trackIndex,
      enabled: idx < 4,
      clef: t.suggestedClef,
    })),
  );

  const toggleTrack = (trackIndex: number) => {
    setTrackConfigs((prev) =>
      prev.map((c) => (c.trackIndex === trackIndex ? { ...c, enabled: !c.enabled } : c)),
    );
  };

  const setTrackClef = (trackIndex: number, clef: ClefType) => {
    setTrackConfigs((prev) =>
      prev.map((c) => (c.trackIndex === trackIndex ? { ...c, clef } : c)),
    );
  };

  const enabledCount = trackConfigs.filter((c) => c.enabled).length;

  const handleImport = () => {
    const fallbackTitle = fileName.replace(/\.(mid|midi)$/i, '') || 'インポートしたスコア';
    const imported = importMidiToScore(buffer, {
      quantize,
      assignmentMode,
      tracks: trackConfigs,
      fallbackTitle,
    });
    replaceScore(imported);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <FileMusic className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">MIDI インポート設定</h2>
              <p className="text-xs text-slate-500 truncate max-w-xs">{fileName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto text-xs">
          {/* Detected Metadata */}
          <div className="flex flex-wrap items-center gap-3 bg-slate-50 border border-slate-200/80 rounded-xl px-3.5 py-2.5 text-slate-700">
            <span>
              テンポ: <strong className="text-slate-900">♩={inspection.tempo}</strong>
            </span>
            <span>
              拍子:{' '}
              <strong className="text-slate-900">
                {inspection.timeSignature.beats}/{inspection.timeSignature.beatType}
              </strong>
            </span>
            <span>
              検出トラック: <strong className="text-slate-900">{inspection.tracks.length}</strong>
            </span>
          </div>

          {/* Quantization */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              量子化精度（グリッド）
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { value: '16', label: '16分音符', desc: '標準・細かいリズム' },
                  { value: '8', label: '8分音符', desc: 'シンプル・崩れにくい' },
                  { value: '8t', label: '8分3連符', desc: 'シャッフル・3連系' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setQuantize(opt.value)}
                  className={`text-left px-3 py-2 rounded-xl border transition-all ${
                    quantize === opt.value
                      ? 'bg-blue-50 border-blue-500 text-blue-900 ring-1 ring-blue-500/30'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-semibold">{opt.label}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Assignment mode */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              トラックの割り当て方法
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAssignmentMode('staves')}
                className={`text-left px-3 py-2 rounded-xl border transition-all ${
                  assignmentMode === 'staves'
                    ? 'bg-blue-50 border-blue-500 text-blue-900 ring-1 ring-blue-500/30'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="font-semibold">五線（Staff）ごとに分割</div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  ピアノ両手・パート譜向け（最大8五線）
                </div>
              </button>
              <button
                type="button"
                onClick={() => setAssignmentMode('voices')}
                className={`text-left px-3 py-2 rounded-xl border transition-all ${
                  assignmentMode === 'voices'
                    ? 'bg-blue-50 border-blue-500 text-blue-900 ring-1 ring-blue-500/30'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="font-semibold">同一五線の声部（1st〜4th）へ統合</div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  1本の五線に色分け声部として配置
                </div>
              </button>
            </div>
          </div>

          {/* Track list */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              読み込むトラック
            </label>
            {inspection.tracks.length === 0 ? (
              <div className="text-slate-500 bg-slate-50 rounded-xl p-4 text-center">
                ノートが含まれるトラックが見つかりませんでした。
              </div>
            ) : (
              <div className="space-y-1.5">
                {inspection.tracks.map((t) => {
                  const cfg = trackConfigs.find((c) => c.trackIndex === t.trackIndex);
                  if (!cfg) return null;
                  return (
                    <div
                      key={t.trackIndex}
                      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border transition-colors ${
                        cfg.enabled
                          ? 'bg-white border-slate-200'
                          : 'bg-slate-50 border-slate-100 opacity-60'
                      }`}
                    >
                      <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={cfg.enabled}
                          onChange={() => toggleTrack(t.trackIndex)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-800 truncate">{t.name}</div>
                          <div className="text-[10px] text-slate-500">
                            {t.noteCount} 音符 ・ ch.{t.channel + 1} ・ {t.instrument}
                          </div>
                        </div>
                      </label>

                      {assignmentMode === 'staves' && (
                        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setTrackClef(t.trackIndex, 'treble')}
                            className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${
                              cfg.clef === 'treble'
                                ? 'bg-white text-blue-900 shadow-xs'
                                : 'text-slate-500'
                            }`}
                          >
                            𝄞 ト音
                          </button>
                          <button
                            type="button"
                            onClick={() => setTrackClef(t.trackIndex, 'bass')}
                            className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${
                              cfg.clef === 'bass'
                                ? 'bg-white text-blue-900 shadow-xs'
                                : 'text-slate-500'
                            }`}
                          >
                            𝄢 ヘ音
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-t border-slate-100 text-xs">
          <span className="text-slate-500">現在の譜面は「元に戻す」で復元できます</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-medium"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={enabledCount === 0}
              className="px-4 py-1.5 rounded-lg bg-blue-900 text-white hover:bg-blue-800 disabled:opacity-40 font-semibold shadow-xs transition-colors"
            >
              読み込む ({enabledCount})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
