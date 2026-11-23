import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useScoreStore } from '../store/useScoreStore';
import {
  renderScoreToSvg,
  type MeasureLayout,
  type ScoreLayout,
} from '../renderer/vexflowRenderer';
import { formatPitchLabel, yToPitch } from '../core/pitch';
import { getMeasureTicks, getSnapGridTicks, xToSnappedTick } from '../core/rhythm';
import type { Pitch } from '../types/score';

interface HoverPreview {
  measureIndex: number;
  startTick: number;
  pitch: Pitch;
  ghostX: number;
  snappedY: number;
  topLineY: number;
  bottomLineY: number;
  lineSpacing: number;
  halfStepsFromTop: number;
  snappedToExistingNoteId: string | null;
}

export const ScoreCanvas: React.FC = () => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const svgContainerRef = useRef<HTMLDivElement | null>(null);

  const score = useScoreStore((s) => s.score);
  const activeStaffIndex = useScoreStore((s) => s.activeStaffIndex);
  const activeVoiceIndex = useScoreStore((s) => s.activeVoiceIndex);
  const selectedDuration = useScoreStore((s) => s.selectedDuration);
  const dotted = useScoreStore((s) => s.dotted);
  const triplet = useScoreStore((s) => s.triplet);
  const selectedAccidental = useScoreStore((s) => s.selectedAccidental);
  const chordMode = useScoreStore((s) => s.chordMode);
  const selectedNote = useScoreStore((s) => s.selectedNote);

  const placeNote = useScoreStore((s) => s.placeNote);
  const deleteNoteAt = useScoreStore((s) => s.deleteNoteAt);

  const [containerWidth, setContainerWidth] = useState<number>(920);
  const [layout, setLayout] = useState<ScoreLayout | null>(null);
  const [hover, setHover] = useState<HoverPreview | null>(null);
  const [shiftPressed, setShiftPressed] = useState(false);

  // Track container width responsively
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const updateWidth = () => {
      const w = el.clientWidth;
      if (w > 0) setContainerWidth(w);
    };
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Track Shift key so ghost note reflects temporary chord mode
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftPressed(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftPressed(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Render score via VexFlow whenever score, width, or selection changes
  useEffect(() => {
    const container = svgContainerRef.current;
    if (!container) return;

    const nextLayout = renderScoreToSvg(container, {
      score,
      containerWidth,
      activeStaffIndex,
      activeVoiceIndex,
      selectedNoteId: selectedNote?.noteId ?? null,
    });
    setLayout(nextLayout);
  }, [score, containerWidth, activeStaffIndex, activeVoiceIndex, selectedNote]);

  const computeHit = useCallback(
    (clientX: number, clientY: number): HoverPreview | null => {
      const el = svgContainerRef.current;
      if (!el || !layout) return null;

      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;

      // Find measure containing (x, y)
      let targetMeasure: MeasureLayout | null = null;
      for (const m of layout.measures) {
        const withinX = x >= m.x && x <= m.x + m.width;
        const withinY = y >= m.topLineY - 46 && y <= m.bottomLineY + 46;
        if (withinX && withinY) {
          targetMeasure = m;
          break;
        }
      }
      if (!targetMeasure) return null;

      // Ignore clicks on clef/key/time signature area on the left of the first measure of a row
      if (x < targetMeasure.noteStartX - 8) return null;

      const { pitch, snappedY, halfStepsFromTop } = yToPitch(
        y,
        targetMeasure.topLineY,
        targetMeasure.lineSpacing,
        targetMeasure.clef,
      );

      const measureTicks = getMeasureTicks(score.timeSignature);
      const gridTicks = getSnapGridTicks(selectedDuration, dotted, triplet);

      // Snap to an existing note's X/tick if close to it
      let snappedNote = null as (typeof targetMeasure.notes)[number] | null;
      let minDist = 16;
      for (const n of targetMeasure.notes) {
        const dist = Math.abs(x - n.x);
        if (dist < minDist) {
          minDist = dist;
          snappedNote = n;
        }
      }

      let startTick: number;
      let ghostX: number;
      if (snappedNote) {
        startTick = snappedNote.startTick;
        ghostX = snappedNote.x;
      } else {
        startTick = xToSnappedTick(
          x,
          targetMeasure.noteStartX,
          targetMeasure.noteEndX,
          measureTicks,
          gridTicks,
        );
        const noteAreaWidth = Math.max(1, targetMeasure.noteEndX - targetMeasure.noteStartX);
        ghostX =
          targetMeasure.noteStartX +
          ((startTick + gridTicks * 0.25) / measureTicks) * noteAreaWidth;
      }

      return {
        measureIndex: targetMeasure.measureIndex,
        startTick,
        pitch: selectedAccidental ? { ...pitch, accidental: selectedAccidental } : pitch,
        ghostX,
        snappedY,
        topLineY: targetMeasure.topLineY,
        bottomLineY: targetMeasure.bottomLineY,
        lineSpacing: targetMeasure.lineSpacing,
        halfStepsFromTop,
        snappedToExistingNoteId: snappedNote?.noteId ?? null,
      };
    },
    [layout, score.timeSignature, selectedDuration, dotted, triplet, selectedAccidental],
  );

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const hit = computeHit(e.clientX, e.clientY);
    setHover(hit);
  };

  const handlePointerLeave = () => {
    setHover(null);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const hit = computeHit(e.clientX, e.clientY);
    if (!hit) return;
    placeNote(hit.measureIndex, hit.startTick, hit.pitch, e.shiftKey ? true : undefined);
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    const hit = computeHit(e.clientX, e.clientY);
    if (hit?.snappedToExistingNoteId) {
      e.preventDefault();
      deleteNoteAt(hit.measureIndex, hit.snappedToExistingNoteId);
    }
  };

  // Compute ledger lines for ghost note if outside the 5 staff lines
  const renderGhostLedgerLines = (h: HoverPreview) => {
    const lines: number[] = [];
    // Above top line (halfStepsFromTop <= -2: -2, -4, -6, -8)
    if (h.halfStepsFromTop <= -2) {
      for (let step = -2; step >= h.halfStepsFromTop; step -= 2) {
        lines.push(h.topLineY + (step * h.lineSpacing) / 2);
      }
    }
    // Below bottom line (halfStepsFromTop >= 10: 10, 12, 14, 16)
    if (h.halfStepsFromTop >= 10) {
      for (let step = 10; step <= h.halfStepsFromTop; step += 2) {
        lines.push(h.topLineY + (step * h.lineSpacing) / 2);
      }
    }
    return lines.map((ly) => (
      <line
        key={ly}
        x1={h.ghostX - 11}
        x2={h.ghostX + 11}
        y1={ly}
        y2={ly}
        stroke="#64748b"
        strokeWidth={1.2}
        opacity={0.75}
      />
    ));
  };

  // Find selected note hitbox for halo rendering
  const selectedHitbox =
    selectedNote && layout
      ? layout.measures[selectedNote.measureIndex]?.notes.find(
          (n) => n.noteId === selectedNote.noteId,
        ) ?? null
      : null;

  const isHollowHead = selectedDuration === 'w' || selectedDuration === 'h';
  const effectiveChordMode = chordMode || shiftPressed;
  const ghostColor = effectiveChordMode ? '#059669' : '#2563eb';
  const accidentalSymbol =
    selectedAccidental === '#' ? '♯' : selectedAccidental === 'b' ? '♭' : selectedAccidental === 'n' ? '♮' : '';

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div
        ref={wrapperRef}
        className="relative bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden cursor-crosshair"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {/* VexFlow SVG target */}
        <div ref={svgContainerRef} className="score-svg-container w-full min-h-[260px]" />

        {/* Interactive Overlay SVG (selection halo + hover ghost note) */}
        {layout && (
          <svg
            width={layout.width}
            height={layout.height}
            className="pointer-events-none absolute top-0 left-0"
          >
            {/* Selected note highlight halo */}
            {selectedHitbox && (
              <rect
                x={selectedHitbox.x - 10}
                y={selectedHitbox.minY - 9}
                width={20}
                height={Math.max(18, selectedHitbox.maxY - selectedHitbox.minY + 18)}
                rx={6}
                fill="#3b82f6"
                fillOpacity={0.14}
                stroke="#2563eb"
                strokeWidth={1.5}
                strokeOpacity={0.6}
              />
            )}

            {/* Hover ghost note */}
            {hover && (
              <g>
                {renderGhostLedgerLines(hover)}
                {accidentalSymbol && (
                  <text
                    x={hover.ghostX - 15}
                    y={hover.snappedY + 5}
                    fontSize={14}
                    fontWeight={600}
                    fill={ghostColor}
                    opacity={0.85}
                  >
                    {accidentalSymbol}
                  </text>
                )}
                <ellipse
                  cx={hover.ghostX}
                  cy={hover.snappedY}
                  rx={6}
                  ry={4.4}
                  transform={`rotate(-18 ${hover.ghostX} ${hover.snappedY})`}
                  fill={isHollowHead ? '#ffffff' : ghostColor}
                  fillOpacity={isHollowHead ? 0.9 : 0.45}
                  stroke={ghostColor}
                  strokeWidth={isHollowHead ? 2 : 1.2}
                  strokeOpacity={0.85}
                />
                {dotted && (
                  <circle cx={hover.ghostX + 10} cy={hover.snappedY} r={2} fill={ghostColor} opacity={0.8} />
                )}
                {/* Subtle vertical beat guide */}
                <line
                  x1={hover.ghostX}
                  x2={hover.ghostX}
                  y1={hover.topLineY - 6}
                  y2={hover.bottomLineY + 6}
                  stroke={ghostColor}
                  strokeWidth={1}
                  strokeDasharray="2 3"
                  opacity={0.3}
                />
              </g>
            )}
          </svg>
        )}
      </div>

      {/* Subtle status / hint bar below canvas */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-500">
        <div className="flex items-center gap-3">
          {hover ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: ghostColor }}
              />
              小節 {hover.measureIndex + 1} / {formatPitchLabel(hover.pitch)}
              {effectiveChordMode && (
                <span className="ml-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700 border border-emerald-200">
                  和音モード
                </span>
              )}
            </span>
          ) : (
            <span>五線上をクリック／タップして音符を配置</span>
          )}
        </div>
        <div className="hidden sm:flex items-center gap-3 text-slate-400">
          <span>`1`–`5`: 音価</span>
          <span>`.`: 付点</span>
          <span>`T`: 3連符</span>
          <span>`Shift+クリック`: 和音</span>
          <span>`↑`/`↓`: 音高</span>
          <span>`右クリック`/`Del`: 削除</span>
        </div>
      </div>
    </div>
  );
};
