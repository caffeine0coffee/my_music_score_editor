import {
  Accidental,
  Beam,
  Dot,
  Formatter,
  Renderer,
  Stave,
  StaveNote,
  Tuplet,
  Voice,
} from 'vexflow';
import type { ClefType, Score } from '../types/score';
import { getRestKeyForClef, pitchToVexKey, sortPitchesAscending } from '../core/pitch';
import { durationTickToVex, fillMeasureWithRests, getMeasureTicks } from '../core/rhythm';

export interface NoteHitbox {
  noteId: string;
  measureIndex: number;
  startTick: number;
  x: number;
  ys: number[];
  minY: number;
  maxY: number;
}

export interface MeasureLayout {
  measureIndex: number;
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
  selectedNoteId: string | null;
}

const PADDING_X = 20;
const PADDING_TOP = 28;
const SYSTEM_HEIGHT = 136;
const FIRST_MEASURE_EXTRA_WIDTH = 68;
const SELECTED_NOTE_COLOR = '#2563eb';
const REST_COLOR = '#64748b';

export function renderScoreToSvg(
  container: HTMLDivElement,
  options: RenderScoreOptions,
): ScoreLayout {
  const { score, containerWidth, activeStaffIndex, activeVoiceIndex, selectedNoteId } = options;

  container.innerHTML = '';

  const staff = score.staves[activeStaffIndex] ?? score.staves[0];
  const voiceData = staff?.voices[activeVoiceIndex] ?? staff?.voices[0];
  if (!staff || !voiceData) {
    return { width: containerWidth, height: SYSTEM_HEIGHT, measures: [] };
  }

  const totalMeasures = score.measureMeta.length;
  const usableWidth = Math.max(320, containerWidth - PADDING_X * 2);

  let measuresPerRow = 4;
  if (usableWidth < 540) {
    measuresPerRow = 2;
  } else if (usableWidth < 820) {
    measuresPerRow = 3;
  }

  const rowCount = Math.max(1, Math.ceil(totalMeasures / measuresPerRow));
  const svgWidth = Math.max(360, containerWidth);
  const svgHeight = PADDING_TOP + rowCount * SYSTEM_HEIGHT + 24;

  const renderer = new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(svgWidth, svgHeight);
  const context = renderer.getContext();

  const measureTicks = getMeasureTicks(score.timeSignature);
  const timeSigStr = `${score.timeSignature.beats}/${score.timeSignature.beatType}`;

  const measureLayouts: MeasureLayout[] = [];

  for (let row = 0; row < rowCount; row++) {
    const startIdx = row * measuresPerRow;
    const endIdx = Math.min(totalMeasures, startIdx + measuresPerRow);
    const countInRow = endIdx - startIdx;

    // Distribute width evenly, giving the first measure of each row extra space for clef/key/time
    const extraForFirst = countInRow > 1 ? FIRST_MEASURE_EXTRA_WIDTH : 0;
    const baseMeasureWidth = (usableWidth - extraForFirst) / measuresPerRow;

    let currentX = PADDING_X;
    const systemY = PADDING_TOP + row * SYSTEM_HEIGHT;

    for (let mIdx = startIdx; mIdx < endIdx; mIdx++) {
      const isRowStart = mIdx === startIdx;
      const isVeryFirst = mIdx === 0;
      const isVeryLast = mIdx === totalMeasures - 1;
      const measureWidth = isRowStart ? baseMeasureWidth + extraForFirst : baseMeasureWidth;

      const stave = new Stave(currentX, systemY, measureWidth);
      if (isRowStart) {
        stave.addClef(staff.clef);
        if (score.keySignature && score.keySignature !== 'C') {
          stave.addKeySignature(score.keySignature);
        }
      }
      if (isVeryFirst) {
        stave.addTimeSignature(timeSigStr);
      }
      if (isVeryLast) {
        stave.setEndBarType(3); // BarlineType.END (final double barline)
      }

      stave.setMeasure(mIdx + 1);
      stave.setContext(context).draw();

      const measureVoice = voiceData.measures[mIdx];
      const rawNotes = measureVoice?.notes ?? [];
      const renderItems = fillMeasureWithRests(rawNotes, measureTicks, score.timeSignature);

      const vexNotes: StaveNote[] = [];
      const noteMapping: { vexNote: StaveNote; noteId: string; startTick: number }[] = [];
      const tuplets: Tuplet[] = [];

      // Track consecutive triplet items of the same unit duration to group them into VexFlow Tuplets
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
            autoStem: true,
          });

          sortedPitches.forEach((p, idx) => {
            if (p.accidental) {
              staveNote.addModifier(new Accidental(p.accidental), idx);
            }
          });

          if (spec.dots > 0) {
            Dot.buildAndAttach([staveNote], { all: true });
          }

          const isSelected = selectedNoteId === note.id;
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
          noteMapping.push({ vexNote: staveNote, noteId: note.id, startTick: note.startTick });
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
            maintainStemDirections: false,
          });
        } catch {
          beams = [];
        }

        const formatWidth = Math.max(40, stave.getNoteEndX() - stave.getNoteStartX() - 16);
        new Formatter().joinVoices([vfVoice]).format([vfVoice], formatWidth);

        vfVoice.draw(context, stave);

        for (const beam of beams) {
          beam.setStyle({ fillStyle: voiceData.color, strokeStyle: voiceData.color });
          beam.setContext(context).draw();
        }

        for (const tuplet of tuplets) {
          tuplet.setContext(context).draw();
        }
      }

      const noteHitboxes: NoteHitbox[] = noteMapping.map(({ vexNote, noteId, startTick }) => {
        const ys = vexNote.getYs();
        const x = vexNote.getAbsoluteX();
        const minY = ys.length > 0 ? Math.min(...ys) : stave.getYForLine(2);
        const maxY = ys.length > 0 ? Math.max(...ys) : stave.getYForLine(2);
        return {
          noteId,
          measureIndex: mIdx,
          startTick,
          x,
          ys,
          minY,
          maxY,
        };
      });

      measureLayouts.push({
        measureIndex: mIdx,
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

      currentX += measureWidth;
    }
  }

  return {
    width: svgWidth,
    height: svgHeight,
    measures: measureLayouts,
  };
}
