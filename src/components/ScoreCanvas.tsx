import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useScoreStore, type SelectedNoteRef } from '../store/useScoreStore';
import {
  renderScoreToSvg,
  type MeasureLayout,
  type NoteHitbox,
  type ScoreLayout,
} from '../renderer/vexflowRenderer';
import { formatPitchLabel, yToPitch } from '../core/pitch';
import { getMeasureTicks, getSnapGridTicks, xToSnappedTick } from '../core/rhythm';
import { VOICE_LABELS } from '../core/constants';
import { ScoreHeader } from './ScoreHeader';
import type { Pitch } from '../types/score';

interface HoverPreview {
  staffIndex: number;
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

interface DragRect {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export const ScoreCanvas: React.FC = () => {
  const scrollWrapperRef = useRef<HTMLDivElement | null>(null);
  const scaledLayerRef = useRef<HTMLDivElement | null>(null);
  const svgContainerRef = useRef<HTMLDivElement | null>(null);

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
  const zoom = useScoreStore((s) => s.zoom);
  const playhead = useScoreStore((s) => s.playhead);

  const placeNote = useScoreStore((s) => s.placeNote);
  const deleteNoteAt = useScoreStore((s) => s.deleteNoteAt);
  const selectMeasure = useScoreStore((s) => s.selectMeasure);
  const setSelectedNote = useScoreStore((s) => s.setSelectedNote);
  const setSelectedNotes = useScoreStore((s) => s.setSelectedNotes);
  const setActiveStaff = useScoreStore((s) => s.setActiveStaff);
  const clearSelection = useScoreStore((s) => s.clearSelection);
  const setZoom = useScoreStore((s) => s.setZoom);

  const [containerWidth, setContainerWidth] = useState<number>(920);
  const [layout, setLayout] = useState<ScoreLayout | null>(null);
  const [hover, setHover] = useState<HoverPreview | null>(null);
  const [shiftPressed, setShiftPressed] = useState(false);
  const [dragRect, setDragRect] = useState<DragRect | null>(null);

  // Pinch-to-zoom ref state
  const pinchRef = useRef<{ initialDistance: number; initialZoom: number } | null>(null);

  // Track container width responsively
  useEffect(() => {
    const el = scrollWrapperRef.current;
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

  const selectedNoteIds = useMemo(() => {
    if (selectedNotes.length > 0) return selectedNotes.map((n) => n.noteId);
    return selectedNote ? [selectedNote.noteId] : [];
  }, [selectedNotes, selectedNote]);

  // Render score via VexFlow whenever score, width, active staff/voice, or selection changes
  useEffect(() => {
    const container = svgContainerRef.current;
    if (!container) return;

    const nextLayout = renderScoreToSvg(container, {
      score,
      containerWidth,
      activeStaffIndex,
      activeVoiceIndex,
      selectedNoteIds,
    });
    setLayout(nextLayout);
  }, [score, containerWidth, activeStaffIndex, activeVoiceIndex, selectedNoteIds]);

  // Convert client coordinates to unscaled SVG coordinates
  const toLocalCoords = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const el = scaledLayerRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        x: (clientX - rect.left) / zoom,
        y: (clientY - rect.top) / zoom,
      };
    },
    [zoom],
  );

  // Find closest measure layout for (x, y)
  const findTargetMeasure = useCallback(
    (x: number, y: number): MeasureLayout | null => {
      if (!layout) return null;
      let best: MeasureLayout | null = null;
      let bestDistY = Infinity;
      for (const m of layout.measures) {
        if (x < m.x || x > m.x + m.width) continue;
        if (y < m.topLineY - 38 || y > m.bottomLineY + 38) continue;
        const centerY = (m.topLineY + m.bottomLineY) / 2;
        const distY = Math.abs(y - centerY);
        if (distY < bestDistY) {
          bestDistY = distY;
          best = m;
        }
      }
      return best;
    },
    [layout],
  );

  const computeHit = useCallback(
    (clientX: number, clientY: number): HoverPreview | null => {
      const pt = toLocalCoords(clientX, clientY);
      if (!pt) return null;
      const { x, y } = pt;

      const targetMeasure = findTargetMeasure(x, y);
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
      let snappedNote: NoteHitbox | null = null;
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
        staffIndex: targetMeasure.staffIndex,
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
    [
      toLocalCoords,
      findTargetMeasure,
      score.timeSignature,
      selectedDuration,
      dotted,
      triplet,
      selectedAccidental,
    ],
  );

  // Find closest note hitbox near (x, y) for select mode click
  const findNearestNoteHitbox = useCallback(
    (x: number, y: number): NoteHitbox | null => {
      if (!layout) return null;
      let best: NoteHitbox | null = null;
      let bestDist = 20;
      for (const m of layout.measures) {
        for (const n of m.notes) {
          const dx = Math.abs(x - n.x);
          const dy = y < n.minY ? n.minY - y : y > n.maxY ? y - n.maxY : 0;
          const dist = Math.hypot(dx, dy);
          if (dist < bestDist) {
            bestDist = dist;
            best = n;
          }
        }
      }
      return best;
    },
    [layout],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (interactionMode !== 'select') return;

    const pt = toLocalCoords(e.clientX, e.clientY);
    if (!pt) return;
    setDragRect({
      startX: pt.x,
      startY: pt.y,
      currentX: pt.x,
      currentY: pt.y,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (interactionMode === 'select') {
      setHover(null);
      if (dragRect) {
        const pt = toLocalCoords(e.clientX, e.clientY);
        if (pt) {
          setDragRect((prev) => (prev ? { ...prev, currentX: pt.x, currentY: pt.y } : null));
        }
      }
      return;
    }

    const hit = computeHit(e.clientX, e.clientY);
    setHover(hit);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (interactionMode !== 'select' || !dragRect) return;

    const minX = Math.min(dragRect.startX, dragRect.currentX);
    const maxX = Math.max(dragRect.startX, dragRect.currentX);
    const minY = Math.min(dragRect.startY, dragRect.currentY);
    const maxY = Math.max(dragRect.startY, dragRect.currentY);
    const isDrag = maxX - minX > 8 || maxY - minY > 8;

    setDragRect(null);

    if (isDrag && layout) {
      const matched: SelectedNoteRef[] = [];
      for (const m of layout.measures) {
        if (m.staffIndex !== activeStaffIndex) continue;
        for (const n of m.notes) {
          const inX = n.x >= minX - 8 && n.x <= maxX + 8;
          const inY = n.maxY >= minY - 8 && n.minY <= maxY + 8;
          if (inX && inY) {
            matched.push({
              staffIndex: n.staffIndex,
              voiceIndex: n.voiceIndex,
              measureIndex: n.measureIndex,
              noteId: n.noteId,
            });
          }
        }
      }
      setSelectedNotes(matched);
    } else {
      const pt = toLocalCoords(e.clientX, e.clientY);
      if (!pt) return;
      const nearest = findNearestNoteHitbox(pt.x, pt.y);
      if (nearest) {
        if (nearest.staffIndex !== activeStaffIndex) {
          setActiveStaff(nearest.staffIndex);
        }
        const ref: SelectedNoteRef = {
          staffIndex: nearest.staffIndex,
          voiceIndex: nearest.voiceIndex,
          measureIndex: nearest.measureIndex,
          noteId: nearest.noteId,
        };
        if (e.shiftKey && selectedNotes.length > 0) {
          const exists = selectedNotes.some((n) => n.noteId === ref.noteId);
          const next = exists
            ? selectedNotes.filter((n) => n.noteId !== ref.noteId)
            : [...selectedNotes, ref];
          setSelectedNotes(next);
        } else {
          setSelectedNote(ref);
        }
      } else {
        const m = findTargetMeasure(pt.x, pt.y);
        if (m && m.staffIndex !== activeStaffIndex) {
          setActiveStaff(m.staffIndex);
        } else {
          clearSelection();
        }
      }
    }
  };

  const handlePointerLeave = () => {
    setHover(null);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (interactionMode === 'select') return;
    const hit = computeHit(e.clientX, e.clientY);
    if (!hit) {
      // Allow clicking on clef/left area of a staff to switch active staff
      const pt = toLocalCoords(e.clientX, e.clientY);
      if (pt) {
        const m = findTargetMeasure(pt.x, pt.y);
        if (m && m.staffIndex !== activeStaffIndex) {
          setActiveStaff(m.staffIndex);
        }
      }
      return;
    }
    placeNote(
      hit.measureIndex,
      hit.startTick,
      hit.pitch,
      e.shiftKey ? true : undefined,
      hit.staffIndex,
    );
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    const hit = computeHit(e.clientX, e.clientY);
    if (hit?.snappedToExistingNoteId) {
      e.preventDefault();
      deleteNoteAt(hit.measureIndex, hit.snappedToExistingNoteId, hit.staffIndex);
    }
  };

  // Pinch-to-zoom touch handlers
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = {
        initialDistance: Math.hypot(dx, dy),
        initialZoom: zoom,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (pinchRef.current.initialDistance > 10) {
        const scale = dist / pinchRef.current.initialDistance;
        setZoom(pinchRef.current.initialZoom * scale);
      }
    }
  };

  const handleTouchEnd = () => {
    pinchRef.current = null;
  };

  // Ctrl + wheel zoom on desktop
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      setZoom(zoom + delta);
    }
  };

  // Compute ledger lines for ghost note if outside the 5 staff lines
  const renderGhostLedgerLines = (h: HoverPreview) => {
    const lines: number[] = [];
    if (h.halfStepsFromTop <= -2) {
      for (let step = -2; step >= h.halfStepsFromTop; step -= 2) {
        lines.push(h.topLineY + (step * h.lineSpacing) / 2);
      }
    }
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

  // Selected note hitboxes for halo rendering
  const selectedHitboxes = useMemo(() => {
    if (!layout || selectedNoteIds.length === 0) return [];
    const idSet = new Set(selectedNoteIds);
    const list: NoteHitbox[] = [];
    for (const m of layout.measures) {
      for (const n of m.notes) {
        if (idSet.has(n.noteId)) {
          list.push(n);
        }
      }
    }
    return list;
  }, [layout, selectedNoteIds]);

  // Compute playhead vertical line geometry across all staves of the active playback measure
  const playheadGeom = useMemo(() => {
    if (!playhead || !layout) return null;
    const ms = layout.measures.filter((m) => m.measureIndex === playhead.measureIndex);
    if (ms.length === 0) return null;
    const measureTicks = getMeasureTicks(score.timeSignature);
    const ratio = Math.max(0, Math.min(1, playhead.tickInMeasure / Math.max(1, measureTicks)));
    const first = ms[0];
    const x = first.noteStartX + ratio * Math.max(1, first.noteEndX - first.noteStartX);
    const topY = Math.min(...ms.map((m) => m.topLineY)) - 14;
    const bottomY = Math.max(...ms.map((m) => m.bottomLineY)) + 14;
    return { x, topY, bottomY };
  }, [playhead, layout, score.timeSignature]);

  const activeVoice = score.staves[activeStaffIndex]?.voices[activeVoiceIndex];
  const activeVoiceColor = activeVoice?.color ?? '#2563eb';
  const activeVoiceLabel = VOICE_LABELS[activeVoiceIndex] ?? `${activeVoiceIndex + 1}th`;

  const isHollowHead = selectedDuration === 'w' || selectedDuration === 'h';
  const effectiveChordMode = chordMode || shiftPressed;
  const ghostColor = effectiveChordMode ? '#059669' : activeVoiceColor;
  const accidentalSymbol =
    selectedAccidental === '#'
      ? '♯'
      : selectedAccidental === 'b'
        ? '♭'
        : selectedAccidental === 'n'
          ? '♮'
          : '';

  const scaledWidth = layout ? Math.ceil(layout.width * zoom) : undefined;
  const scaledHeight = layout ? Math.ceil(layout.height * zoom) : undefined;

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Editable Score Header (Title, Subtitle, Composer) */}
        <ScoreHeader />

        {/* Scrollable & Pinch-Zoomable Score Sheet */}
        <div
          ref={scrollWrapperRef}
          className="relative overflow-x-auto touch-pan-x touch-pan-y"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onWheel={handleWheel}
        >
          <div
            style={{
              width: scaledWidth ? `${scaledWidth}px` : '100%',
              height: scaledHeight ? `${scaledHeight}px` : 'auto',
              minHeight: '260px',
            }}
            className="relative"
          >
            <div
              ref={scaledLayerRef}
              style={{
                width: layout ? `${layout.width}px` : '100%',
                height: layout ? `${layout.height}px` : 'auto',
                transform: `scale(${zoom})`,
                transformOrigin: '0 0',
              }}
              className={`relative ${
                interactionMode === 'select' ? 'cursor-default' : 'cursor-crosshair'
              }`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerLeave}
              onClick={handleClick}
              onContextMenu={handleContextMenu}
            >
              {/* VexFlow SVG target */}
              <div ref={svgContainerRef} className="score-svg-container w-full min-h-[260px]" />

              {/* Interactive Overlay SVG (measure highlights, active staff indicator, selection halos, ghost note, drag marquee) */}
              {layout && (
                <svg
                  width={layout.width}
                  height={layout.height}
                  className="pointer-events-none absolute top-0 left-0"
                >
                  {/* Subtle left accent bar on active staff when multiple staves exist */}
                  {score.staves.length > 1 &&
                    layout.measures
                      .filter((m) => m.staffIndex === activeStaffIndex && m.x <= 30)
                      .map((m) => (
                        <rect
                          key={`active-staff-${m.row}`}
                          x={8}
                          y={m.topLineY - 4}
                          width={4}
                          height={m.bottomLineY - m.topLineY + 8}
                          rx={2}
                          fill={activeVoiceColor}
                          opacity={0.75}
                        />
                      ))}

                  {/* Selected measure range highlight */}
                  {selectedMeasureRange &&
                    layout.measures
                      .filter(
                        (m) =>
                          m.staffIndex === selectedMeasureRange.staffIndex &&
                          m.measureIndex >= selectedMeasureRange.startMeasure &&
                          m.measureIndex <= selectedMeasureRange.endMeasure,
                      )
                      .map((m) => (
                        <rect
                          key={`sel-m-${m.staffIndex}-${m.measureIndex}`}
                          x={m.x + 1}
                          y={m.topLineY - 18}
                          width={m.width - 2}
                          height={m.bottomLineY - m.topLineY + 36}
                          rx={6}
                          fill="#3b82f6"
                          fillOpacity={0.1}
                          stroke="#2563eb"
                          strokeWidth={1.5}
                          strokeOpacity={0.55}
                        />
                      ))}

                  {/* Selected note highlight halos */}
                  {selectedHitboxes.map((hb) => (
                    <rect
                      key={`sel-n-${hb.noteId}`}
                      x={hb.x - 10}
                      y={hb.minY - 9}
                      width={20}
                      height={Math.max(18, hb.maxY - hb.minY + 18)}
                      rx={6}
                      fill="#3b82f6"
                      fillOpacity={0.14}
                      stroke="#2563eb"
                      strokeWidth={1.5}
                      strokeOpacity={0.65}
                    />
                  ))}

                  {/* Hover ghost note (input mode only) */}
                  {interactionMode === 'input' && hover && (
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
                        <circle
                          cx={hover.ghostX + 10}
                          cy={hover.snappedY}
                          r={2}
                          fill={ghostColor}
                          opacity={0.8}
                        />
                      )}
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

                  {/* Drag selection marquee rectangle */}
                  {dragRect && (
                    <rect
                      x={Math.min(dragRect.startX, dragRect.currentX)}
                      y={Math.min(dragRect.startY, dragRect.currentY)}
                      width={Math.abs(dragRect.currentX - dragRect.startX)}
                      height={Math.abs(dragRect.currentY - dragRect.startY)}
                      fill="#3b82f6"
                      fillOpacity={0.12}
                      stroke="#2563eb"
                      strokeWidth={1.2}
                      strokeDasharray="4 2"
                    />
                  )}

                  {/* Playback playhead cursor */}
                  {playheadGeom && (
                    <g>
                      <polygon
                        points={`${playheadGeom.x - 5},${playheadGeom.topY - 6} ${playheadGeom.x + 5},${playheadGeom.topY - 6} ${playheadGeom.x},${playheadGeom.topY + 1}`}
                        fill="#ef4444"
                      />
                      <line
                        x1={playheadGeom.x}
                        x2={playheadGeom.x}
                        y1={playheadGeom.topY}
                        y2={playheadGeom.bottomY}
                        stroke="#ef4444"
                        strokeWidth={2}
                        strokeLinecap="round"
                        opacity={0.9}
                      />
                    </g>
                  )}
                </svg>
              )}

              {/* Clickable Measure Header buttons (tap/click to select measure, Shift+click for range) */}
              {layout &&
                layout.measures
                  .filter((m) => m.staffIndex === activeStaffIndex)
                  .map((m) => {
                    const isSelected =
                      selectedMeasureRange !== null &&
                      selectedMeasureRange.staffIndex === m.staffIndex &&
                      m.measureIndex >= selectedMeasureRange.startMeasure &&
                      m.measureIndex <= selectedMeasureRange.endMeasure;
                    return (
                      <button
                        key={`mhdr-${m.staffIndex}-${m.measureIndex}`}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          selectMeasure(m.measureIndex, m.staffIndex, e.shiftKey);
                        }}
                        style={{
                          left: `${m.x + 2}px`,
                          top: `${m.topLineY - 24}px`,
                          width: `${Math.max(24, m.width - 4)}px`,
                          height: '18px',
                        }}
                        className={`absolute rounded text-[10px] font-medium transition-colors flex items-center justify-end pr-1.5 ${
                          isSelected
                            ? 'bg-blue-600/15 text-blue-800 border border-blue-400/60'
                            : 'hover:bg-slate-200/50 text-transparent hover:text-slate-500'
                        }`}
                        title={`小節 ${m.measureIndex + 1} を選択（Shift+クリックで範囲選択）`}
                        aria-label={`小節 ${m.measureIndex + 1} を選択`}
                      >
                        M{m.measureIndex + 1}
                      </button>
                    );
                  })}
            </div>
          </div>
        </div>
      </div>

      {/* Subtle status / hint bar below canvas */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-500">
        <div className="flex flex-wrap items-center gap-3">
          {selectedMeasureRange ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-blue-700">
              小節 {selectedMeasureRange.startMeasure + 1}
              {selectedMeasureRange.endMeasure > selectedMeasureRange.startMeasure
                ? `〜${selectedMeasureRange.endMeasure + 1}`
                : ''}{' '}
              を選択中（{activeVoiceLabel}）
            </span>
          ) : selectedNotes.length > 1 ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-blue-700">
              {selectedNotes.length} 個の音符を選択中（{activeVoiceLabel}）
            </span>
          ) : hover ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: ghostColor }}
              />
              五線 {hover.staffIndex + 1} / {activeVoiceLabel} / 小節 {hover.measureIndex + 1} /{' '}
              {formatPitchLabel(hover.pitch)}
              {effectiveChordMode && (
                <span className="ml-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700 border border-emerald-200">
                  和音モード
                </span>
              )}
            </span>
          ) : (
            <span>
              {interactionMode === 'select'
                ? '音符をクリック／ドラッグして範囲選択・小節上部クリックで小節選択'
                : '五線上をクリック／タップして音符を配置・小節上部クリックで小節選択'}
            </span>
          )}
        </div>
        <div className="hidden lg:flex items-center gap-3 text-slate-400">
          <span>`Space`: 再生</span>
          <span>`1`–`5`: 音価</span>
          <span>`Alt+1`–`4`: 声部</span>
          <span>`V`: 入力/選択</span>
          <span>`L`: タイ</span>
          <span>`Ctrl+C/V`: コピペ</span>
        </div>
      </div>
    </div>
  );
};
