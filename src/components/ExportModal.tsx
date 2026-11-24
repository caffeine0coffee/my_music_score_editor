import React, { useMemo, useState } from 'react';
import { Download, FileCode2, FileMusic, FileText, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { useScoreStore } from '../store/useScoreStore';
import { computePrintPagePlans, type ExportColorMode } from '../renderer/printRenderer';
import { exportScoreToPdf, exportScoreToPng, exportScoreToSvg } from '../renderer/exportService';
import { downloadMidiFile } from '../audio/midiCodec';

interface ExportModalProps {
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ onClose }) => {
  const score = useScoreStore((s) => s.score);
  const [colorMode, setColorMode] = useState<ExportColorMode>('monochrome');
  const [busyFormat, setBusyFormat] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const pageCount = useMemo(() => computePrintPagePlans(score).length, [score]);

  const handleExportPdf = async () => {
    setBusyFormat('pdf');
    setErrorMsg(null);
    try {
      await exportScoreToPdf(score, colorMode);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'PDFの出力に失敗しました');
    } finally {
      setBusyFormat(null);
    }
  };

  const handleExportSvg = () => {
    setBusyFormat('svg');
    setErrorMsg(null);
    try {
      exportScoreToSvg(score, colorMode);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'SVGの出力に失敗しました');
    } finally {
      setBusyFormat(null);
    }
  };

  const handleExportPng = async () => {
    setBusyFormat('png');
    setErrorMsg(null);
    try {
      await exportScoreToPng(score, colorMode);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'PNGの出力に失敗しました');
    } finally {
      setBusyFormat(null);
    }
  };

  const handleExportMidi = () => {
    setBusyFormat('midi');
    setErrorMsg(null);
    try {
      downloadMidiFile(score);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'MIDIの出力に失敗しました');
    } finally {
      setBusyFormat(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">譜面の書き出し</h2>
              <p className="text-xs text-slate-500">
                A4縦 自動組版（全 {pageCount} ページ）
              </p>
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
        <div className="px-5 py-4 space-y-4 text-xs">
          {/* Color mode selector */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              楽譜のカラー設定（PDF / SVG / PNG）
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setColorMode('monochrome')}
                className={`text-left px-3 py-2.5 rounded-xl border transition-all ${
                  colorMode === 'monochrome'
                    ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="font-semibold">黒一色（印刷向け）</div>
                <div
                  className={`text-[10px] mt-0.5 ${
                    colorMode === 'monochrome' ? 'text-slate-300' : 'text-slate-500'
                  }`}
                >
                  標準的なモノクロ楽譜
                </div>
              </button>
              <button
                type="button"
                onClick={() => setColorMode('color')}
                className={`text-left px-3 py-2.5 rounded-xl border transition-all ${
                  colorMode === 'color'
                    ? 'bg-blue-50 border-blue-500 text-blue-900 ring-1 ring-blue-500/30'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="font-semibold flex items-center gap-1.5">
                  <span>声部カラーを維持</span>
                  <span className="inline-flex gap-0.5">
                    <span className="w-2 h-2 rounded-full bg-blue-900" />
                    <span className="w-2 h-2 rounded-full bg-green-700" />
                    <span className="w-2 h-2 rounded-full bg-orange-700" />
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  声部ごとの色分けをそのまま出力
                </div>
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2">
              {errorMsg}
            </div>
          )}

          {/* Format buttons */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={busyFormat !== null}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-blue-200 bg-blue-50/60 hover:bg-blue-100/70 text-blue-950 transition-colors disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-900 text-white flex items-center justify-center shrink-0">
                  {busyFormat === 'pdf' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4" />
                  )}
                </div>
                <div className="text-left">
                  <div className="font-bold text-sm">PDF でダウンロード（A4 ベクター）</div>
                  <div className="text-[11px] text-slate-600">
                    拡大しても劣化しない印刷品質のベクターPDF
                  </div>
                </div>
              </div>
              <Download className="w-4 h-4 text-blue-800 shrink-0" />
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleExportSvg}
                disabled={busyFormat !== null}
                className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 transition-colors disabled:opacity-50"
              >
                <FileCode2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <div className="text-left">
                  <div className="font-semibold">SVG 出力</div>
                  <div className="text-[10px] text-slate-500">ベクター画像</div>
                </div>
              </button>

              <button
                type="button"
                onClick={handleExportPng}
                disabled={busyFormat !== null}
                className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 transition-colors disabled:opacity-50"
              >
                {busyFormat === 'png' ? (
                  <Loader2 className="w-4 h-4 animate-spin text-violet-700 shrink-0" />
                ) : (
                  <ImageIcon className="w-4 h-4 text-violet-700 shrink-0" />
                )}
                <div className="text-left">
                  <div className="font-semibold">PNG 出力</div>
                  <div className="text-[10px] text-slate-500">高解像度画像</div>
                </div>
              </button>
            </div>

            <button
              type="button"
              onClick={handleExportMidi}
              disabled={busyFormat !== null}
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 transition-colors disabled:opacity-50"
            >
              <div className="flex items-center gap-2.5">
                <FileMusic className="w-4 h-4 text-amber-700 shrink-0" />
                <div className="text-left">
                  <div className="font-semibold">MIDI (.mid) エクスポート</div>
                  <div className="text-[10px] text-slate-500">
                    DAW や他ソフトで開ける標準 MIDI ファイル（PPQ 480）
                  </div>
                </div>
              </div>
              <Download className="w-4 h-4 text-slate-500 shrink-0" />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-5 py-3 bg-slate-50 border-t border-slate-100 text-xs">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-medium"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
