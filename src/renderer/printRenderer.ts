import {
  Accidental,
  Annotation,
  BarlineType,
  Beam,
  Curve,
  Dot,
  Formatter,
  RenderContext,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  StaveTie,
  Stem,
  Tuplet,
  Voice,
} from 'vexflow';
import type { NoteEvent, Pitch, Score } from '../types/score';
import {
  getRestKeyForClef,
  isSamePitchPosition,
  pitchToVexKey,
  sortPitchesAscending,
} from '../core/pitch';
import { durationTickToVex, fillMeasureWithRests, getMeasureTicks } from '../core/rhythm';

export type ExportColorMode = 'monochrome' | 'color';

export interface PrintRenderOptions {
  colorMode: ExportColorMode;
  measuresPerRow?: number;
  scale?: number;
}

export const A4_SVG_WIDTH = 794;
export const A4_SVG_HEIGHT = 1123;

const MARGIN_X = 48;
const MARGIN_TOP = 44;
const MARGIN_BOTTOM = 48;
const FIRST_PAGE_HEADER_HEIGHT = 100;
const STAFF_SPACING = 104;
const ROW_GAP = 34;
const FIRST_MEASURE_EXTRA_WIDTH = 64;
const MONOCHROME_COLOR = '#111827';
const REST_COLOR_MONO = '#111827';
const REST_COLOR_COLOR = '#475569';

interface RowSlice {
  startMeasure: number;
  endMeasure: number; // exclusive
  pageBreakAfter: boolean;
}

export interface PagePlan {
  rows: RowSlice[];
  isFirstPage: boolean;
}

interface RenderedNoteEntry {
  measureIndex: number;
  rowIndexInPage: number;
  note: NoteEvent;
  vexNote: StaveNote;
  sortedPitches: Pitch[];
}

interface VoiceBundle {
  voiceIndex: number;
  color: string;
  vfVoice: Voice;
  beams: Beam[];
  tuplets: Tuplet[];
  noteMapping: { vexNote: StaveNote; note: NoteEvent; sortedPitches: Pitch[] }[];
}

/**
 * Partition measures into rows and A4 pages, respecting optional measureMeta break hints.
 */
export function computePrintPagePlans(score: Score, measuresPerRow = 4): PagePlan[] {
  const totalMeasures = score.measureMeta.length;
  const staffCount = Math.max(1, score.staves.length);
  const systemHeight = staffCount * STAFF_SPACING + ROW_GAP;

  const rows: RowSlice[] = [];
  let cursor = 0;
  while (cursor < totalMeasures) {
    let end = Math.min(totalMeasures, cursor + measuresPerRow);
    let pageBreakAfter = false;
    for (let m = cursor; m < end; m++) {
      const meta = score.measureMeta[m];
      if (meta?.pageBreakAfter) {
        end = m + 1;
        pageBreakAfter = true;
        break;
      }
      if (meta?.lineBreakAfter) {
        end = m + 1;
        break;
      }
    }
    rows.push({ startMeasure: cursor, endMeasure: end, pageBreakAfter });
    cursor = end;
  }

  if (rows.length === 0) {
    return [{ rows: [], isFirstPage: true }];
  }

  const pages: PagePlan[] = [];
  let currentRows: RowSlice[] = [];
  let isFirstPage = true;

  const getAvailableHeight = (first: boolean) =>
    A4_SVG_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM - (first ? FIRST_PAGE_HEADER_HEIGHT : 0);

  let usedHeight = 0;
  for (const row of rows) {
    const avail = getAvailableHeight(isFirstPage);
    if (currentRows.length > 0 && usedHeight + systemHeight > avail) {
      pages.push({ rows: currentRows, isFirstPage });
      currentRows = [];
      isFirstPage = false;
      usedHeight = 0;
    }

    currentRows.push(row);
    usedHeight += systemHeight;

    if (row.pageBreakAfter) {
      pages.push({ rows: currentRows, isFirstPage });
      currentRows = [];
      isFirstPage = false;
      usedHeight = 0;
    }
  }

  if (currentRows.length > 0) {
    pages.push({ rows: currentRows, isFirstPage });
  }

  return pages;
}

/**
 * Shared VexFlow page drawing logic that works identically on both SVG and Canvas contexts.
 */
function drawScoreNotationToContext(
  context: RenderContext,
  score: Score,
  plan: PagePlan,
  colorMode: ExportColorMode,
  measuresPerRow: number,
): void {
  const staffCount = score.staves.length;
  const totalMeasures = score.measureMeta.length;
  const measureTicks = getMeasureTicks(score.timeSignature);
  const timeSigStr = `${score.timeSignature.beats}/${score.timeSignature.beatType}`;
  const usableWidth = A4_SVG_WIDTH - MARGIN_X * 2;
  const systemHeight = Math.max(1, staffCount) * STAFF_SPACING + ROW_GAP;

  const contentTopY = MARGIN_TOP + (plan.isFirstPage ? FIRST_PAGE_HEADER_HEIGHT : 0);
  const renderedVoiceNotes = new Map<string, RenderedNoteEntry[]>();
  const voiceKey = (sIdx: number, vIdx: number) => `${sIdx}:${vIdx}`;

  plan.rows.forEach((rowSlice, rowIndexInPage) => {
    const countInRow = rowSlice.endMeasure - rowSlice.startMeasure;
    const denom = Math.max(countInRow, measuresPerRow);
    const extraForFirst = countInRow > 1 ? FIRST_MEASURE_EXTRA_WIDTH : 0;
    const baseMeasureWidth = (usableWidth - extraForFirst) / denom;

    let currentX = MARGIN_X;
    const systemTopY = contentTopY + rowIndexInPage * systemHeight;

    for (let mIdx = rowSlice.startMeasure; mIdx < rowSlice.endMeasure; mIdx++) {
      const isRowStart = mIdx === rowSlice.startMeasure;
      const isVeryFirst = mIdx === 0;
      const isVeryLast = mIdx === totalMeasures - 1;
      const measureWidth = isRowStart ? baseMeasureWidth + extraForFirst : baseMeasureWidth;
      const meta = score.measureMeta[mIdx];

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

        if (meta?.repeatStart) {
          stave.setBegBarType(BarlineType.REPEAT_BEGIN);
        }
        if (meta?.repeatEnd) {
          stave.setEndBarType(BarlineType.REPEAT_END);
        } else if (isVeryLast) {
          stave.setEndBarType(BarlineType.END);
        }

        if (sIdx === 0) {
          stave.setMeasure(mIdx + 1);
        }

        stavesInMeasure.push(stave);
      }

      if (staffCount > 1) {
        const maxNoteStartX = Math.max(...stavesInMeasure.map((s) => s.getNoteStartX()));
        for (const stave of stavesInMeasure) {
          stave.setNoteStartX(maxNoteStartX);
        }
      }

      for (const stave of stavesInMeasure) {
        stave.setContext(context).draw();
      }

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

      for (let sIdx = 0; sIdx < staffCount; sIdx++) {
        const staff = score.staves[sIdx];
        const stave = stavesInMeasure[sIdx];

        const voiceIndicesToDraw: number[] = [];
        for (let vIdx = 0; vIdx < staff.voices.length; vIdx++) {
          const rawNotes = staff.voices[vIdx].measures[mIdx]?.notes ?? [];
          if (vIdx === 0 || rawNotes.length > 0) {
            voiceIndicesToDraw.push(vIdx);
          }
        }

        const useMultiVoiceStems = voiceIndicesToDraw.length > 1;
        const bundles: VoiceBundle[] = [];

        for (const vIdx of voiceIndicesToDraw) {
          const voiceData = staff.voices[vIdx];
          const rawNotes = voiceData.measures[mIdx]?.notes ?? [];
          const renderItems = fillMeasureWithRests(rawNotes, measureTicks, score.timeSignature);
          const noteColor = colorMode === 'monochrome' ? MONOCHROME_COLOR : voiceData.color;
          const restColor = colorMode === 'monochrome' ? REST_COLOR_MONO : REST_COLOR_COLOR;

          const vexNotes: StaveNote[] = [];
          const noteMapping: VoiceBundle['noteMapping'] = [];
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
              staveNote.setStyle({ fillStyle: restColor, strokeStyle: restColor });
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
                ...(stemDirection !== undefined ? { stemDirection } : { autoStem: true }),
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

              staveNote.setStyle({ fillStyle: noteColor, strokeStyle: noteColor });

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
              color: noteColor,
              vfVoice,
              beams,
              tuplets,
              noteMapping,
            });
          }
        }

        if (bundles.length > 0) {
          const vfVoices = bundles.map((b) => b.vfVoice);
          const formatWidth = Math.max(40, stave.getNoteEndX() - stave.getNoteStartX() - 14);
          try {
            new Formatter().joinVoices(vfVoices).format(vfVoices, formatWidth);
          } catch {
            for (const v of vfVoices) {
              new Formatter().joinVoices([v]).format([v], formatWidth);
            }
          }

          for (const bundle of bundles) {
            bundle.vfVoice.draw(context, stave);
            for (const beam of bundle.beams) {
              beam.setStyle({ fillStyle: bundle.color, strokeStyle: bundle.color });
              beam.setContext(context).draw();
            }
            for (const tuplet of bundle.tuplets) {
              tuplet.setContext(context).draw();
            }

            const key = voiceKey(sIdx, bundle.voiceIndex);
            const list = renderedVoiceNotes.get(key) ?? [];
            for (const nm of bundle.noteMapping) {
              list.push({
                measureIndex: mIdx,
                rowIndexInPage,
                note: nm.note,
                vexNote: nm.vexNote,
                sortedPitches: nm.sortedPitches,
              });
            }
            renderedVoiceNotes.set(key, list);
          }
        }
      }

      currentX += measureWidth;
    }
  });

  // Draw Ties & Slurs within this page
  for (let sIdx = 0; sIdx < staffCount; sIdx++) {
    const staff = score.staves[sIdx];
    for (let vIdx = 0; vIdx < staff.voices.length; vIdx++) {
      const voiceData = staff.voices[vIdx];
      const entries = renderedVoiceNotes.get(voiceKey(sIdx, vIdx));
      if (!entries || entries.length === 0) continue;
      const drawColor = colorMode === 'monochrome' ? MONOCHROME_COLOR : voiceData.color;

      for (let i = 0; i < entries.length; i++) {
        const cur = entries[i];
        if (!cur.note.tieToNext) continue;
        const next = entries[i + 1];

        if (!next) {
          try {
            const tie = new StaveTie({
              firstNote: cur.vexNote,
              lastNote: null,
              firstIndexes: [0],
            });
            tie.setStyle({ fillStyle: drawColor, strokeStyle: drawColor });
            tie.setContext(context).draw();
          } catch {
            // ignore
          }
          continue;
        }

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
          if (cur.rowIndexInPage === next.rowIndexInPage) {
            const tie = new StaveTie({
              firstNote: cur.vexNote,
              lastNote: next.vexNote,
              firstIndexes,
              lastIndexes,
            });
            tie.setStyle({ fillStyle: drawColor, strokeStyle: drawColor });
            tie.setContext(context).draw();
          } else {
            const tieOut = new StaveTie({
              firstNote: cur.vexNote,
              lastNote: null,
              firstIndexes,
            });
            tieOut.setStyle({ fillStyle: drawColor, strokeStyle: drawColor });
            tieOut.setContext(context).draw();

            const tieIn = new StaveTie({
              firstNote: null,
              lastNote: next.vexNote,
              lastIndexes,
            });
            tieIn.setStyle({ fillStyle: drawColor, strokeStyle: drawColor });
            tieIn.setContext(context).draw();
          }
        } catch {
          // ignore
        }
      }

      // Slurs
      let slurStartIdx: number | null = null;
      for (let i = 0; i < entries.length; i++) {
        const cur = entries[i];
        if (cur.note.slurStart) slurStartIdx = i;
        if (cur.note.slurEnd && slurStartIdx !== null && i > slurStartIdx) {
          const startEntry = entries[slurStartIdx];
          const endEntry = cur;
          try {
            if (startEntry.rowIndexInPage === endEntry.rowIndexInPage) {
              const curve = new Curve(startEntry.vexNote, endEntry.vexNote, {
                cps: [
                  { x: 0, y: 12 },
                  { x: 0, y: 12 },
                ],
              });
              curve.setStyle({ fillStyle: drawColor, strokeStyle: drawColor });
              curve.setContext(context).draw();
            }
          } catch {
            // ignore
          }
          slurStartIdx = null;
        }
      }
    }
  }
}

/**
 * Render each A4 page onto a high-DPI HTMLCanvasElement using VexFlow's Canvas backend.
 * This natively uses the browser's loaded Bravura music font AND system CJK/Japanese fonts,
 * ensuring 100% faithful output for both PDF and PNG export on desktop & mobile.
 */
export async function renderScorePagesToCanvases(
  score: Score,
  options: PrintRenderOptions,
): Promise<HTMLCanvasElement[]> {
  const { colorMode, measuresPerRow = 4, scale = 3 } = options;
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready;
  }

  const pages = computePrintPagePlans(score, measuresPerRow);
  const canvases: HTMLCanvasElement[] = [];

  pages.forEach((plan, pageIdx) => {
    const canvas = document.createElement('canvas');
    // Set physical pixel dimensions explicitly (independent of window.devicePixelRatio)
    canvas.width = A4_SVG_WIDTH * scale;
    canvas.height = A4_SVG_HEIGHT * scale;

    const renderer = new Renderer(canvas, Renderer.Backends.CANVAS);
    const vfContext = renderer.getContext();

    const ctx2d = canvas.getContext('2d');
    if (ctx2d) {
      ctx2d.setTransform(scale, 0, 0, scale, 0, 0);
      // White page background
      ctx2d.fillStyle = '#ffffff';
      ctx2d.fillRect(0, 0, A4_SVG_WIDTH, A4_SVG_HEIGHT);

      // Header on page 1
      if (plan.isFirstPage) {
        ctx2d.textBaseline = 'alphabetic';
        ctx2d.fillStyle = '#111827';
        ctx2d.textAlign = 'center';
        ctx2d.font = 'bold 24px "Noto Serif JP", "Hiragino Mincho ProN", Georgia, serif';
        ctx2d.fillText(score.title || '無題のスコア', A4_SVG_WIDTH / 2, MARGIN_TOP + 24);

        if (score.subtitle?.trim()) {
          ctx2d.fillStyle = '#4b5563';
          ctx2d.font = '13px "Noto Serif JP", "Hiragino Mincho ProN", Georgia, serif';
          ctx2d.fillText(score.subtitle.trim(), A4_SVG_WIDTH / 2, MARGIN_TOP + 46);
        }

        if (score.composer?.trim()) {
          ctx2d.fillStyle = '#374151';
          ctx2d.textAlign = 'right';
          ctx2d.font = 'italic 12px "Noto Serif JP", "Hiragino Mincho ProN", Georgia, serif';
          ctx2d.fillText(score.composer.trim(), A4_SVG_WIDTH - MARGIN_X, MARGIN_TOP + 72);
        }

        ctx2d.fillStyle = '#111827';
        ctx2d.textAlign = 'left';
        ctx2d.font = 'bold 12px Georgia, serif';
        ctx2d.fillText(`♩ = ${score.tempo}`, MARGIN_X, MARGIN_TOP + 72);
      }

      // Page number footer when multi-page
      if (pages.length > 1) {
        ctx2d.fillStyle = '#6b7280';
        ctx2d.textAlign = 'center';
        ctx2d.font = '11px Georgia, serif';
        ctx2d.fillText(`${pageIdx + 1} / ${pages.length}`, A4_SVG_WIDTH / 2, A4_SVG_HEIGHT - 20);
      }

      // Reset alignment & transform cleanly before VexFlow draws notation
      ctx2d.textAlign = 'start';
      ctx2d.setTransform(scale, 0, 0, scale, 0, 0);
    }

    drawScoreNotationToContext(vfContext, score, plan, colorMode, measuresPerRow);

    canvases.push(canvas);
  });

  return canvases;
}

function createSvgElement<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  textContent?: string,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  if (textContent !== undefined) {
    el.textContent = textContent;
  }
  return el;
}

/**
 * Render a Score into an array of A4-proportioned SVG elements (one per page) for vector SVG export.
 * Embeds @font-face declarations for VexFlow's Bravura & Academico web fonts so standalone SVGs render cleanly.
 */
export function renderScorePagesForPrint(
  score: Score,
  options: PrintRenderOptions,
): SVGSVGElement[] {
  const { colorMode, measuresPerRow = 4 } = options;
  const pages = computePrintPagePlans(score, measuresPerRow);
  const svgPages: SVGSVGElement[] = [];

  pages.forEach((plan, pageIdx) => {
    const tempDiv = document.createElement('div');
    const renderer = new Renderer(tempDiv, Renderer.Backends.SVG);
    renderer.resize(A4_SVG_WIDTH, A4_SVG_HEIGHT);
    const context = renderer.getContext();

    const svgEl = tempDiv.querySelector('svg') as SVGSVGElement;
    svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svgEl.setAttribute('width', String(A4_SVG_WIDTH));
    svgEl.setAttribute('height', String(A4_SVG_HEIGHT));
    svgEl.setAttribute('viewBox', `0 0 ${A4_SVG_WIDTH} ${A4_SVG_HEIGHT}`);

    // Embed @font-face so standalone SVG viewers can load Bravura music glyphs
    const defs = createSvgElement('defs', {});
    const style = createSvgElement(
      'style',
      {},
      `
@font-face {
  font-family: 'Bravura';
  src: url('https://cdn.jsdelivr.net/npm/@vexflow-fonts/bravura/bravura.woff2') format('woff2');
}
@font-face {
  font-family: 'Academico';
  src: url('https://cdn.jsdelivr.net/npm/@vexflow-fonts/academico/academico.woff2') format('woff2');
}
      `.trim(),
    );
    defs.appendChild(style);
    svgEl.insertBefore(defs, svgEl.firstChild);

    // White page background
    const bgRect = createSvgElement('rect', {
      x: 0,
      y: 0,
      width: A4_SVG_WIDTH,
      height: A4_SVG_HEIGHT,
      fill: '#ffffff',
    });
    svgEl.insertBefore(bgRect, defs.nextSibling);

    if (plan.isFirstPage) {
      const headerGroup = createSvgElement('g', { class: 'score-print-header' });
      headerGroup.appendChild(
        createSvgElement(
          'text',
          {
            x: A4_SVG_WIDTH / 2,
            y: MARGIN_TOP + 24,
            'text-anchor': 'middle',
            'font-family': '"Noto Serif JP", Georgia, serif',
            'font-size': 24,
            'font-weight': 'bold',
            fill: '#111827',
          },
          score.title || '無題のスコア',
        ),
      );
      if (score.subtitle?.trim()) {
        headerGroup.appendChild(
          createSvgElement(
            'text',
            {
              x: A4_SVG_WIDTH / 2,
              y: MARGIN_TOP + 46,
              'text-anchor': 'middle',
              'font-family': '"Noto Serif JP", Georgia, serif',
              'font-size': 13,
              fill: '#4b5563',
            },
            score.subtitle.trim(),
          ),
        );
      }
      if (score.composer?.trim()) {
        headerGroup.appendChild(
          createSvgElement(
            'text',
            {
              x: A4_SVG_WIDTH - MARGIN_X,
              y: MARGIN_TOP + 72,
              'text-anchor': 'end',
              'font-family': '"Noto Serif JP", Georgia, serif',
              'font-size': 12,
              'font-style': 'italic',
              fill: '#374151',
            },
            score.composer.trim(),
          ),
        );
      }
      headerGroup.appendChild(
        createSvgElement(
          'text',
          {
            x: MARGIN_X,
            y: MARGIN_TOP + 72,
            'text-anchor': 'start',
            'font-family': 'Georgia, serif',
            'font-size': 12,
            'font-weight': 'bold',
            fill: '#111827',
          },
          `♩ = ${score.tempo}`,
        ),
      );
      svgEl.appendChild(headerGroup);
    }

    drawScoreNotationToContext(context, score, plan, colorMode, measuresPerRow);

    if (pages.length > 1) {
      svgEl.appendChild(
        createSvgElement(
          'text',
          {
            x: A4_SVG_WIDTH / 2,
            y: A4_SVG_HEIGHT - 20,
            'text-anchor': 'middle',
            'font-family': 'Georgia, serif',
            'font-size': 11,
            fill: '#6b7280',
          },
          `${pageIdx + 1} / ${pages.length}`,
        ),
      );
    }

    svgPages.push(svgEl);
  });

  return svgPages;
}
