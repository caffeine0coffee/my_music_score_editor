import {
  Accidental,
  Annotation,
  BarlineType,
  Beam,
  Curve,
  Dot,
  Formatter,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  StaveTie,
  Stem,
  Tuplet,
  Voice,
} from 'vexflow';
import type { ClefType, NoteEvent, Pitch, Score } from '../types/score';
import {
  getRestKeyForClef,
  isSamePitchPosition,
  pitchToVexKey,
  sortPitchesAscending,
} from '../core/pitch';
import { durationTickToVex, fillMeasureWithRests, getMeasureTicks } from '../core/rhythm';

export interface NoteHitbox {
  staffIndex: number;
  voiceIndex: number;
  noteId: string;
  measureIndex: number;
  startTick: number;
  x: number;
  ys: number[];
  minY: number;
  maxY: number;
}

export interface MeasureLayout {
  staffIndex: number;
  measureIndex: number;
  row: number;
  x: number;
  y: number;
  width: number;
  noteStartX: number;
  noteEndX: number;
  topLineY: number;
  bottomLineY: number;
  lineSpacing: number;
  clef: ClefType;
  notes: NoteHitbox[];
}

export interface ScoreLayout {
  width: number;
  height: number;
  measures: MeasureLayout[];
}

export interface RenderScoreOptions {
  score: Score;
  containerWidth: number;
  activeStaffIndex: number;
  activeVoiceIndex: number;
  selectedNoteIds: string[];
}

interface RenderedNoteEntry {
  measureIndex: number;
  row: number;
  note: NoteEvent;
  vexNote: StaveNote;
  sortedPitches: Pitch[];
}

interface VoiceRenderBundle {
  voiceIndex: number;
  color: string;
  isActive: boolean;
  vfVoice: Voice;
  vexNotes: StaveNote[];
  beams: Beam[];
  tuplets: Tuplet[];
  noteMapping: {
    vexNote: StaveNote;
    note: NoteEvent;
    sortedPitches: Pitch[];
  }[];
}

const PADDING_X = 24;
const PADDING_TOP = 32;
const STAFF_SPACING = 112;
const ROW_GAP = 40;
const FIRST_MEASURE_EXTRA_WIDTH = 68;
const SELECTED_NOTE_COLOR = '#2563eb';
const REST_COLOR = '#64748b';
const INACTIVE_OPACITY = '0.32';

export function renderScoreToSvg(
  container: HTMLDivElement,
  options: RenderScoreOptions,
): ScoreLayout {
  const { score, containerWidth, activeStaffIndex, activeVoiceIndex, selectedNoteIds } = options;

  container.innerHTML = '';

  const staffCount = score.staves.length;
  if (staffCount === 0) {
    return { width: containerWidth, height: STAFF_SPACING, measures: [] };
  }

  const selectedSet = new Set(selectedNoteIds);
  const totalMeasures = score.measureMeta.length;
  const usableWidth = Math.max(320, containerWidth - PADDING_X * 2);

  let measuresPerRow = 4;
  if (usableWidth < 540) {
    measuresPerRow = 2;
  } else if (usableWidth < 820) {
    measuresPerRow = 3;
  }

  const rowCount = Math.max(1, Math.ceil(totalMeasures / measuresPerRow));
  const systemHeight = staffCount * STAFF_SPACING + ROW_GAP;
  const svgWidth = Math.max(360, containerWidth);
  const svgHeight = PADDING_TOP + rowCount * systemHeight + 24;

  const renderer = new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(svgWidth, svgHeight);
  const context = renderer.getContext();

  const measureTicks = getMeasureTicks(score.timeSignature);
  const timeSigStr = `${score.timeSignature.beats}/${score.timeSignature.beatType}`;

  const measureLayouts: MeasureLayout[] = [];

  // Track rendered notes per (staffIndex, voiceIndex) for cross-measure ties & slurs
  const renderedVoiceNotes = new Map<string, RenderedNoteEntry[]>();
  const voiceKey = (sIdx: number, vIdx: number) => `${sIdx}:${vIdx}`;

  for (let row = 0; row < rowCount; row++) {
    const startIdx = row * measuresPerRow;
    const endIdx = Math.min(totalMeasures, startIdx + measuresPerRow);
    const countInRow = endIdx - startIdx;

    const extraForFirst = countInRow > 1 ? FIRST_MEASURE_EXTRA_WIDTH : 0;
    const baseMeasureWidth = (usableWidth - extraForFirst) / measuresPerRow;

    let currentX = PADDING_X;
    const systemTopY = PADDING_TOP + row * systemHeight;

    for (let mIdx = startIdx; mIdx < endIdx; mIdx++) {
      const isRowStart = mIdx === startIdx;
      const isVeryFirst = mIdx === 0;
      const isVeryLast = mIdx === totalMeasures - 1;
      const measureWidth = isRowStart ? baseMeasureWidth + extraForFirst : baseMeasureWidth;
      const meta = score.measureMeta[mIdx];

      // 1. Create staves for all parts in this measure and align noteStartX
      const stavesInMeasure: Stave[] = [];
      for (let sIdx = 0; sIdx < staffCount; sIdx++) {
        const staff = score.staves[sIdx];
        const staffY = systemTopY + sIdx * STAFF_SPACING;
        const stave = new Stave(currentX, staffY, measureWidth);

        if (isRowStart) {
          stave.addClef(staff.clef);
          if (score.keySignature && score.keySignature !== 'C') {
            stave.addKeySignature(score.keySignature);
          }
        }
        if (isVeryFirst) {
          stave.addTimeSignature(timeSigStr);
        }

        // Barlines & repeat signs
        if (meta?.repeatStart) {
          stave.setBegBarType(BarlineType.REPEAT_BEGIN);
        }
        if (meta?.repeatEnd) {
          stave.setEndBarType(BarlineType.REPEAT_END);
        } else if (isVeryLast) {
          stave.setEndBarType(BarlineType.END);
        }

        // Show measure number only on top staff
        if (sIdx === 0) {
          stave.setMeasure(mIdx + 1);
        }

        stavesInMeasure.push(stave);
      }

      // Align noteStartX across all staves in the same measure
      if (staffCount > 1) {
        const maxNoteStartX = Math.max(...stavesInMeasure.map((s) => s.getNoteStartX()));
        for (const stave of stavesInMeasure) {
          stave.setNoteStartX(maxNoteStartX);
        }
      }

      // Draw staves
      for (const stave of stavesInMeasure) {
        stave.setContext(context).draw();
      }

      // Draw system connectors when multiple staves exist
      if (staffCount > 1) {
        const topStave = stavesInMeasure[0];
        const bottomStave = stavesInMeasure[staffCount - 1];
        if (isRowStart) {
          new StaveConnector(topStave, bottomStave)
            .setType(StaveConnector.type.SINGLE_LEFT)
            .setContext(context)
            .draw();
          new StaveConnector(topStave, bottomStave)
            .setType(StaveConnector.type.BRACKET)
            .setContext(context)
            .draw();
        }
        new StaveConnector(topStave, bottomStave)
          .setType(StaveConnector.type.SINGLE_RIGHT)
          .setContext(context)
          .draw();
      }

      // 2. Build & draw voices for each staff in this measure
      for (let sIdx = 0; sIdx < staffCount; sIdx++) {
        const staff = score.staves[sIdx];
        const stave = stavesInMeasure[sIdx];

        const activeBundleIndices: number[] = [];
        for (let vIdx = 0; vIdx < staff.voices.length; vIdx++) {
          const voiceData = staff.voices[vIdx];
          const isActive = sIdx === activeStaffIndex && vIdx === activeVoiceIndex;
          const rawNotes = voiceData.measures[mIdx]?.notes ?? [];
          // Render active voice always; render inactive voices only when they have notes
          if (isActive || rawNotes.length > 0) {
            activeBundleIndices.push(vIdx);
          }
        }

        const useMultiVoiceStems = activeBundleIndices.length > 1;
        const bundles: VoiceRenderBundle[] = [];

        for (const vIdx of activeBundleIndices) {
          const voiceData = staff.voices[vIdx];
          const isActive = sIdx === activeStaffIndex && vIdx === activeVoiceIndex;
          const rawNotes = voiceData.measures[mIdx]?.notes ?? [];
          const renderItems = fillMeasureWithRests(rawNotes, measureTicks, score.timeSignature);

          const vexNotes: StaveNote[] = [];
          const noteMapping: VoiceRenderBundle['noteMapping'] = [];
          const tuplets: Tuplet[] = [];

          let tripletBuffer: StaveNote[] = [];
          let tripletUnitTick: number | null = null;
          let tripletTargetCount = 3;

          const flushTripletBuffer = () => {
            if (tripletBuffer.length >= 2) {
              tuplets.push(
                new Tuplet(tripletBuffer, {
                  numNotes: tripletTargetCount,
                  notesOccupied: 2,
                }),
              );
            }
            tripletBuffer = [];
            tripletUnitTick = null;
          };

          const stemDirection = useMultiVoiceStems
            ? vIdx % 2 === 0
              ? Stem.UP
              : Stem.DOWN
            : undefined;

          for (const item of renderItems) {
            if (item.type === 'rest') {
              const restKey = getRestKeyForClef(staff.clef);
              let staveNote: StaveNote;

              if (item.isWholeMeasureRest) {
                flushTripletBuffer();
                staveNote = new StaveNote({
                  clef: staff.clef,
                  keys: [restKey],
                  duration: 'wr',
                  alignCenter: true,
                });
              } else {
                const spec = durationTickToVex(item.durationTick, item.tuplet);
                staveNote = new StaveNote({
                  clef: staff.clef,
                  keys: [restKey],
                  duration: `${spec.duration}r`,
                  dots: spec.dots,
                });
                if (spec.dots > 0) {
                  Dot.buildAndAttach([staveNote], { all: true });
                }

                if (spec.tuplet) {
                  if (tripletUnitTick !== null && tripletUnitTick !== item.durationTick) {
                    flushTripletBuffer();
                  }
                  tripletUnitTick = item.durationTick;
                  tripletTargetCount = spec.tuplet.numNotes;
                  tripletBuffer.push(staveNote);
                  if (tripletBuffer.length === tripletTargetCount) {
                    flushTripletBuffer();
                  }
                } else {
                  flushTripletBuffer();
                }
              }

              staveNote.setStyle({ fillStyle: REST_COLOR, strokeStyle: REST_COLOR });
              vexNotes.push(staveNote);
            } else {
              const { note } = item;
              const spec = durationTickToVex(note.durationTick, note.tuplet);
              const sortedPitches = sortPitchesAscending(note.pitches);
              const keys = sortedPitches.map(pitchToVexKey);

              const staveNote = new StaveNote({
                clef: staff.clef,
                keys,
                duration: spec.duration,
                dots: spec.dots,
                ...(stemDirection !== undefined
                  ? { stemDirection }
                  : { autoStem: true }),
              });

              sortedPitches.forEach((p, idx) => {
                if (p.accidental) {
                  staveNote.addModifier(new Accidental(p.accidental), idx);
                }
              });

              if (spec.dots > 0) {
                Dot.buildAndAttach([staveNote], { all: true });
              }

              if (note.dynamic) {
                const ann = new Annotation(note.dynamic)
                  .setFont('Georgia', 13, 'bold italic')
                  .setVerticalJustification(Annotation.VerticalJustify.BOTTOM);
                staveNote.addModifier(ann, 0);
              }

              const isSelected = isActive && selectedSet.has(note.id);
              const color = isSelected ? SELECTED_NOTE_COLOR : voiceData.color;
              staveNote.setStyle({ fillStyle: color, strokeStyle: color });

              if (spec.tuplet) {
                if (tripletUnitTick !== null && tripletUnitTick !== note.durationTick) {
                  flushTripletBuffer();
                }
                tripletUnitTick = note.durationTick;
                tripletTargetCount = spec.tuplet.numNotes;
                tripletBuffer.push(staveNote);
                if (tripletBuffer.length === tripletTargetCount) {
                  flushTripletBuffer();
                }
              } else {
                flushTripletBuffer();
              }

              vexNotes.push(staveNote);
              noteMapping.push({ vexNote: staveNote, note, sortedPitches });
            }
          }
          flushTripletBuffer();

          if (vexNotes.length > 0) {
            const vfVoice = new Voice({
              numBeats: score.timeSignature.beats,
              beatValue: score.timeSignature.beatType,
            });
            vfVoice.setMode(Voice.Mode.SOFT);
            vfVoice.addTickables(vexNotes);

            let beams: Beam[] = [];
            try {
              const groups = Beam.getDefaultBeamGroups(timeSigStr);
              beams = Beam.generateBeams(vexNotes, {
                groups,
                beamRests: false,
                maintainStemDirections: useMultiVoiceStems,
              });
            } catch {
              beams = [];
            }

            bundles.push({
              voiceIndex: vIdx,
              color: voiceData.color,
              isActive,
              vfVoice,
              vexNotes,
              beams,
              tuplets,
              noteMapping,
            });
          }
        }

        // Format all voices in this staff/measure together
        if (bundles.length > 0) {
          const vfVoices = bundles.map((b) => b.vfVoice);
          const formatWidth = Math.max(40, stave.getNoteEndX() - stave.getNoteStartX() - 16);
          try {
            new Formatter().joinVoices(vfVoices).format(vfVoices, formatWidth);
          } catch {
            // Fallback: format individually if joint formatting fails on edge cases
            for (const v of vfVoices) {
              new Formatter().joinVoices([v]).format([v], formatWidth);
            }
          }

          // Draw inactive voices first, active voice last (on top)
          const orderedBundles = [...bundles].sort((a, b) => Number(a.isActive) - Number(b.isActive));

          for (const bundle of orderedBundles) {
            const grp = context.openGroup(bundle.isActive ? 'vf-voice-active' : 'vf-voice-inactive');
            if (!bundle.isActive && grp) {
              grp.setAttribute('opacity', INACTIVE_OPACITY);
            }

            bundle.vfVoice.draw(context, stave);

            for (const beam of bundle.beams) {
              beam.setStyle({ fillStyle: bundle.color, strokeStyle: bundle.color });
              beam.setContext(context).draw();
            }

            for (const tuplet of bundle.tuplets) {
              tuplet.setContext(context).draw();
            }

            context.closeGroup();

            // Record rendered notes for cross-measure ties & slurs
            const key = voiceKey(sIdx, bundle.voiceIndex);
            const list = renderedVoiceNotes.get(key) ?? [];
            for (const nm of bundle.noteMapping) {
              list.push({
                measureIndex: mIdx,
                row,
                note: nm.note,
                vexNote: nm.vexNote,
                sortedPitches: nm.sortedPitches,
              });
            }
            renderedVoiceNotes.set(key, list);
          }
        }

        // Build hitboxes for the active voice on this staff (or voice 0 if staff is inactive)
        const targetVoiceIdx = sIdx === activeStaffIndex ? activeVoiceIndex : 0;
        const targetBundle = bundles.find((b) => b.voiceIndex === targetVoiceIdx);
        const noteHitboxes: NoteHitbox[] = (targetBundle?.noteMapping ?? []).map(
          ({ vexNote, note }) => {
            const ys = vexNote.getYs();
            const x = vexNote.getAbsoluteX();
            const minY = ys.length > 0 ? Math.min(...ys) : stave.getYForLine(2);
            const maxY = ys.length > 0 ? Math.max(...ys) : stave.getYForLine(2);
            return {
              staffIndex: sIdx,
              voiceIndex: targetVoiceIdx,
              noteId: note.id,
              measureIndex: mIdx,
              startTick: note.startTick,
              x,
              ys,
              minY,
              maxY,
            };
          },
        );

        measureLayouts.push({
          staffIndex: sIdx,
          measureIndex: mIdx,
          row,
          x: stave.getX(),
          y: stave.getY(),
          width: stave.getWidth(),
          noteStartX: stave.getNoteStartX(),
          noteEndX: stave.getNoteEndX(),
          topLineY: stave.getYForLine(0),
          bottomLineY: stave.getYForLine(4),
          lineSpacing: stave.getSpacingBetweenLines(),
          clef: staff.clef,
          notes: noteHitboxes,
        });
      }

      currentX += measureWidth;
    }
  }

  // 3. Draw Ties (including cross-measure and cross-row) and Slurs per voice
  for (let sIdx = 0; sIdx < staffCount; sIdx++) {
    const staff = score.staves[sIdx];
    for (let vIdx = 0; vIdx < staff.voices.length; vIdx++) {
      const voiceData = staff.voices[vIdx];
      const entries = renderedVoiceNotes.get(voiceKey(sIdx, vIdx));
      if (!entries || entries.length === 0) continue;

      const isActive = sIdx === activeStaffIndex && vIdx === activeVoiceIndex;
      const grp = context.openGroup(isActive ? 'vf-ties-active' : 'vf-ties-inactive');
      if (!isActive && grp) {
        grp.setAttribute('opacity', INACTIVE_OPACITY);
      }

      // Draw Ties
      for (let i = 0; i < entries.length; i++) {
        const cur = entries[i];
        if (!cur.note.tieToNext) continue;
        const next = entries[i + 1];

        if (!next) {
          // Open tie at the end of voice
          try {
            const tie = new StaveTie({
              firstNote: cur.vexNote,
              lastNote: null,
              firstIndexes: [0],
            });
            tie.setStyle({ fillStyle: voiceData.color, strokeStyle: voiceData.color });
            tie.setContext(context).draw();
          } catch {
            // ignore edge-case draw errors
          }
          continue;
        }

        // Match shared pitches between cur and next (fallback to index 0)
        const firstIndexes: number[] = [];
        const lastIndexes: number[] = [];
        cur.sortedPitches.forEach((p, pi) => {
          const matchIdx = next.sortedPitches.findIndex((np) => isSamePitchPosition(p, np));
          if (matchIdx !== -1) {
            firstIndexes.push(pi);
            lastIndexes.push(matchIdx);
          }
        });
        if (firstIndexes.length === 0) {
          firstIndexes.push(0);
          lastIndexes.push(0);
        }

        try {
          if (cur.row === next.row) {
            const tie = new StaveTie({
              firstNote: cur.vexNote,
              lastNote: next.vexNote,
              firstIndexes,
              lastIndexes,
            });
            tie.setStyle({ fillStyle: voiceData.color, strokeStyle: voiceData.color });
            tie.setContext(context).draw();
          } else {
            // Cross-row tie: outgoing half-tie + incoming half-tie
            const tieOut = new StaveTie({
              firstNote: cur.vexNote,
              lastNote: null,
              firstIndexes,
            });
            tieOut.setStyle({ fillStyle: voiceData.color, strokeStyle: voiceData.color });
            tieOut.setContext(context).draw();

            const tieIn = new StaveTie({
              firstNote: null,
              lastNote: next.vexNote,
              lastIndexes,
            });
            tieIn.setStyle({ fillStyle: voiceData.color, strokeStyle: voiceData.color });
            tieIn.setContext(context).draw();
          }
        } catch {
          // ignore edge-case draw errors
        }
      }

      // Draw Slurs
      let slurStartIdx: number | null = null;
      for (let i = 0; i < entries.length; i++) {
        const cur = entries[i];
        if (cur.note.slurStart) {
          slurStartIdx = i;
        }
        if (cur.note.slurEnd && slurStartIdx !== null && i > slurStartIdx) {
          const startEntry = entries[slurStartIdx];
          const endEntry = cur;

          try {
            if (startEntry.row === endEntry.row) {
              const curve = new Curve(startEntry.vexNote, endEntry.vexNote, {
                cps: [
                  { x: 0, y: 12 },
                  { x: 0, y: 12 },
                ],
              });
              curve.setStyle({ fillStyle: voiceData.color, strokeStyle: voiceData.color });
              curve.setContext(context).draw();
            } else {
              // Split cross-row slur cleanly into start-row segment and end-row segment
              let lastInStartRow = startEntry;
              for (let k = slurStartIdx + 1; k < i; k++) {
                if (entries[k].row === startEntry.row) {
                  lastInStartRow = entries[k];
                }
              }
              if (lastInStartRow !== startEntry) {
                const c1 = new Curve(startEntry.vexNote, lastInStartRow.vexNote, {
                  cps: [
                    { x: 0, y: 12 },
                    { x: 0, y: 12 },
                  ],
                });
                c1.setStyle({ fillStyle: voiceData.color, strokeStyle: voiceData.color });
                c1.setContext(context).draw();
              }

              let firstInEndRow = endEntry;
              for (let k = i - 1; k > slurStartIdx; k--) {
                if (entries[k].row === endEntry.row) {
                  firstInEndRow = entries[k];
                }
              }
              if (firstInEndRow !== endEntry) {
                const c2 = new Curve(firstInEndRow.vexNote, endEntry.vexNote, {
                  cps: [
                    { x: 0, y: 12 },
                    { x: 0, y: 12 },
                  ],
                });
                c2.setStyle({ fillStyle: voiceData.color, strokeStyle: voiceData.color });
                c2.setContext(context).draw();
              }
            }
          } catch {
            // ignore edge-case draw errors
          }

          slurStartIdx = null;
        }
      }

      context.closeGroup();
    }
  }

  return {
    width: svgWidth,
    height: svgHeight,
    measures: measureLayouts,
  };
}
