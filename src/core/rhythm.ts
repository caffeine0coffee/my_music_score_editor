import type { BaseDuration, NoteEvent, TimeSignature, TupletInfo } from '../types/score';
import { BASE_DURATION_TICKS, TICKS_PER_QUARTER } from './constants';

export type VexBaseDuration = 'w' | 'h' | 'q' | '8' | '16' | '32';

export interface VexDurationSpec {
  duration: VexBaseDuration;
  dots: number;
  tuplet?: TupletInfo;
}

export interface RenderNoteItem {
  type: 'note';
  note: NoteEvent;
}

export interface RenderRestItem {
  type: 'rest';
  startTick: number;
  durationTick: number;
  tuplet?: TupletInfo;
  isWholeMeasureRest?: boolean;
}

export type RenderItem = RenderNoteItem | RenderRestItem;

const TRIPLET_INFO: TupletInfo = { numNotes: 3, notesOccupied: 2 };

export function getMeasureTicks(ts: TimeSignature): number {
  return Math.round(ts.beats * (4 / ts.beatType) * TICKS_PER_QUARTER);
}

export function getBeatTicks(ts: TimeSignature): number {
  return Math.round((4 / ts.beatType) * TICKS_PER_QUARTER);
}

/**
 * Compute tick length and optional tuplet metadata from toolbar selections.
 */
export function computeDurationSpec(
  baseDuration: BaseDuration,
  dotted: boolean,
  triplet: boolean,
): { durationTick: number; tuplet?: TupletInfo } {
  const base = BASE_DURATION_TICKS[baseDuration];
  if (triplet && baseDuration !== 'w') {
    return {
      durationTick: Math.round((base * 2) / 3),
      tuplet: { ...TRIPLET_INFO },
    };
  }
  if (dotted && baseDuration !== 'w') {
    return {
      durationTick: Math.round(base * 1.5),
    };
  }
  return { durationTick: base };
}

/**
 * Map a tick duration (and optional tuplet) to VexFlow duration string + dots.
 */
export function durationTickToVex(durationTick: number, tuplet?: TupletInfo): VexDurationSpec {
  if (tuplet && tuplet.numNotes === 3 && tuplet.notesOccupied === 2) {
    switch (durationTick) {
      case 640:
        return { duration: 'h', dots: 0, tuplet };
      case 320:
        return { duration: 'q', dots: 0, tuplet };
      case 160:
        return { duration: '8', dots: 0, tuplet };
      case 80:
        return { duration: '16', dots: 0, tuplet };
      case 40:
        return { duration: '32', dots: 0, tuplet };
    }
  }

  switch (durationTick) {
    case 1920:
      return { duration: 'w', dots: 0 };
    case 1440:
      return { duration: 'h', dots: 1 };
    case 960:
      return { duration: 'h', dots: 0 };
    case 720:
      return { duration: 'q', dots: 1 };
    case 480:
      return { duration: 'q', dots: 0 };
    case 360:
      return { duration: '8', dots: 1 };
    case 240:
      return { duration: '8', dots: 0 };
    case 180:
      return { duration: '16', dots: 1 };
    case 120:
      return { duration: '16', dots: 0 };
    case 90:
      return { duration: '32', dots: 1 };
    case 60:
      return { duration: '32', dots: 0 };
    // Triplet ticks even if tuplet metadata was omitted
    case 640:
      return { duration: 'h', dots: 0, tuplet: { ...TRIPLET_INFO } };
    case 320:
      return { duration: 'q', dots: 0, tuplet: { ...TRIPLET_INFO } };
    case 160:
      return { duration: '8', dots: 0, tuplet: { ...TRIPLET_INFO } };
    case 80:
      return { duration: '16', dots: 0, tuplet: { ...TRIPLET_INFO } };
    case 40:
      return { duration: '32', dots: 0, tuplet: { ...TRIPLET_INFO } };
    default:
      // Fallback: pick closest standard duration
      if (durationTick >= 1440) return { duration: 'h', dots: 1 };
      if (durationTick >= 960) return { duration: 'h', dots: 0 };
      if (durationTick >= 480) return { duration: 'q', dots: 0 };
      if (durationTick >= 240) return { duration: '8', dots: 0 };
      if (durationTick >= 120) return { duration: '16', dots: 0 };
      return { duration: '32', dots: 0 };
  }
}

const STANDARD_DURATIONS_DESC = [1920, 1440, 960, 720, 480, 360, 240, 180, 120, 60];
const TRIPLET_DURATIONS_DESC = [640, 320, 160, 80];

/**
 * Find the largest valid duration that fits within `maxTicks`.
 */
export function largestFittingDuration(
  maxTicks: number,
  preferTriplet = false,
): { durationTick: number; tuplet?: TupletInfo } | null {
  if (preferTriplet) {
    for (const d of TRIPLET_DURATIONS_DESC) {
      if (d <= maxTicks) {
        return { durationTick: d, tuplet: { ...TRIPLET_INFO } };
      }
    }
  }
  for (const d of STANDARD_DURATIONS_DESC) {
    if (d <= maxTicks) {
      return { durationTick: d };
    }
  }
  for (const d of TRIPLET_DURATIONS_DESC) {
    if (d <= maxTicks) {
      return { durationTick: d, tuplet: { ...TRIPLET_INFO } };
    }
  }
  return null;
}

/**
 * Determine whether a standard rest of `dur` ticks starting at `pos` respects metric boundaries.
 */
function isMetricallyValidRest(
  pos: number,
  dur: number,
  measureTicks: number,
  ts: TimeSignature,
): boolean {
  const beatTicks = getBeatTicks(ts);
  const isCompound = ts.beatType === 8 && ts.beats % 3 === 0;
  const groupTicks = isCompound ? beatTicks * 3 : beatTicks; // 720 in 6/8, 480 in 4/4

  // Whole rest only for full 4/4 measure
  if (dur === 1920) {
    return pos === 0 && measureTicks === 1920;
  }

  // Dotted half rest: allowed at start of 3/4 or 6/8 (1440), or beat 1 of 4/4 (pos 0)
  if (dur === 1440) {
    return pos === 0 && measureTicks === 1440;
  }

  // Half rest (960): must align on half-measure (e.g. 0 or 960 in 4/4; 0 in 2/4; 0 or 480 in 3/4? No, in 3/4 use two quarter rests rather than half rest on beat 2)
  if (dur === 960) {
    if (ts.beats === 4 && ts.beatType === 4) {
      return pos === 0 || pos === 960;
    }
    if (ts.beats === 2 && ts.beatType === 4) {
      return pos === 0;
    }
    if (ts.beats === 3 && ts.beatType === 4) {
      return pos === 0;
    }
    return pos % 960 === 0;
  }

  // Dotted quarter rest (720): ideal in compound meters (6/8, 12/8) on compound beat boundaries
  if (dur === 720) {
    if (isCompound) {
      return pos % groupTicks === 0;
    }
    return false;
  }

  // Quarter rest (480): align on beat boundary (in /4 meters) or compound sub-beat
  if (dur === 480) {
    if (isCompound) {
      // In 6/8, avoid quarter rest crossing the compound beat midpoint (e.g. tick 480->960)
      return pos % groupTicks === 0;
    }
    return pos % beatTicks === 0;
  }

  // Dotted eighth rest (360): only if aligned on beat/eighth boundary and doesn't cross beat
  if (dur === 360) {
    return pos % beatTicks === 0 && beatTicks >= 480;
  }

  // Eighth rest (240): must align on 240-tick grid
  if (dur === 240) {
    return pos % 240 === 0;
  }

  // Dotted 16th rest (180): avoid in general rests, prefer 16th + 8th
  if (dur === 180) {
    return false;
  }

  // 16th rest (120)
  if (dur === 120) {
    return pos % 120 === 0;
  }

  // 32nd rest (60)
  if (dur === 60) {
    return pos % 60 === 0;
  }

  return false;
}

/**
 * Decompose an empty tick range [gapStart, gapEnd) into musically appropriate RestItems.
 */
export function decomposeGapToRests(
  gapStart: number,
  gapEnd: number,
  measureTicks: number,
  ts: TimeSignature,
  tripletUnitHint?: number,
): RenderRestItem[] {
  const rests: RenderRestItem[] = [];
  let pos = gapStart;

  const restCandidates = [1920, 1440, 960, 720, 480, 240, 120, 60];

  while (pos < gapEnd) {
    const remaining = gapEnd - pos;

    // 1. Handle triplet-aligned positions or triplet-sized gaps (not divisible by 60)
    if (pos % 60 !== 0 || remaining % 60 !== 0) {
      let matchedTriplet = false;

      // Prefer the adjacent triplet note's unit if it aligns cleanly
      if (tripletUnitHint && pos % tripletUnitHint === 0 && remaining >= tripletUnitHint) {
        const group = tripletUnitHint * 3;
        const nextGroupBoundary = Math.floor(pos / group + 1) * group;
        const needToReachGroupEnd = pos % group !== 0;
        const gapEndsInsideGroup = gapEnd < nextGroupBoundary && gapEnd % group !== 0;
        if (needToReachGroupEnd || gapEndsInsideGroup) {
          rests.push({
            type: 'rest',
            startTick: pos,
            durationTick: tripletUnitHint,
            tuplet: { ...TRIPLET_INFO },
          });
          pos += tripletUnitHint;
          matchedTriplet = true;
        }
      }
      if (matchedTriplet) continue;

      // Otherwise check standard triplet units from finer beat-preserving units up
      const tripletUnits = [
        { unit: 160, group: 480 },
        { unit: 80, group: 240 },
        { unit: 320, group: 960 },
        { unit: 640, group: 1920 },
        { unit: 40, group: 120 },
      ];
      for (const { unit, group } of tripletUnits) {
        if (pos % unit === 0 && remaining >= unit) {
          const nextGroupBoundary = Math.floor(pos / group + 1) * group;
          const distToGroupEnd = nextGroupBoundary - pos;
          if (pos % 60 !== 0 || (gapEnd < nextGroupBoundary && gapEnd % 60 !== 0) || remaining === unit || remaining === unit * 2) {
            if (distToGroupEnd >= unit) {
              rests.push({
                type: 'rest',
                startTick: pos,
                durationTick: unit,
                tuplet: { ...TRIPLET_INFO },
              });
              pos += unit;
              matchedTriplet = true;
              break;
            }
          }
        }
      }
      if (matchedTriplet) continue;

      // Fallback for any unusual triplet residue
      const fallbackUnit = remaining >= 80 ? 80 : remaining >= 40 ? 40 : remaining;
      rests.push({
        type: 'rest',
        startTick: pos,
        durationTick: fallbackUnit,
        tuplet: { ...TRIPLET_INFO },
      });
      pos += fallbackUnit;
      continue;
    }

    // 2. Standard binary/dotted rest decomposition respecting metric boundaries
    let picked = 0;
    for (const dur of restCandidates) {
      if (dur <= remaining && isMetricallyValidRest(pos, dur, measureTicks, ts)) {
        picked = dur;
        break;
      }
    }

    // Fallback if position was on an off-grid 60-tick boundary
    if (picked === 0) {
      for (const dur of [480, 240, 120, 60]) {
        if (dur <= remaining) {
          picked = dur;
          break;
        }
      }
    }

    if (picked === 0) {
      // Ultimate guard against infinite loop
      picked = remaining;
    }

    rests.push({
      type: 'rest',
      startTick: pos,
      durationTick: picked,
    });
    pos += picked;
  }

  return rests;
}

/**
 * Fill a measure's sorted NoteEvents with automatically generated rests so the
 * returned RenderItems completely cover [0, measureTicks).
 */
export function fillMeasureWithRests(
  notes: NoteEvent[],
  measureTicks: number,
  ts: TimeSignature,
): RenderItem[] {
  if (notes.length === 0) {
    return [
      {
        type: 'rest',
        startTick: 0,
        durationTick: measureTicks,
        isWholeMeasureRest: true,
      },
    ];
  }

  const sorted = [...notes].sort((a, b) => a.startTick - b.startTick);
  const items: RenderItem[] = [];
  let cursor = 0;
  let prevTripletUnit: number | undefined;

  for (const note of sorted) {
    if (note.startTick >= measureTicks) break;
    const noteStart = Math.max(cursor, note.startTick);
    const nextTripletUnit = note.tuplet ? note.durationTick : undefined;
    if (noteStart > cursor) {
      const hint = cursor % 60 !== 0 ? prevTripletUnit : nextTripletUnit;
      items.push(...decomposeGapToRests(cursor, noteStart, measureTicks, ts, hint));
    }
    const clampedEnd = Math.min(measureTicks, noteStart + note.durationTick);
    items.push({ type: 'note', note });
    cursor = clampedEnd;
    prevTripletUnit = note.tuplet ? note.durationTick : undefined;
  }

  if (cursor < measureTicks) {
    const hint = cursor % 60 !== 0 ? prevTripletUnit : undefined;
    items.push(...decomposeGapToRests(cursor, measureTicks, measureTicks, ts, hint));
  }

  return items;
}

/**
 * Determine the snapping grid step (in ticks) for pointer interaction based on current tool.
 */
export function getSnapGridTicks(
  baseDuration: BaseDuration,
  dotted: boolean,
  triplet: boolean,
): number {
  const { durationTick } = computeDurationSpec(baseDuration, dotted, triplet);
  if (triplet) {
    return durationTick; // e.g., 160 for 8th triplet, 320 for quarter triplet, 80 for 16th triplet
  }
  // For whole/half notes, allow snapping to quarter-note beats so user can place a half note on beat 2 or 3
  if (durationTick >= TICKS_PER_QUARTER) {
    return TICKS_PER_QUARTER;
  }
  // For dotted 8th (360) or dotted 16th (180), snap to the underlying subdivision
  if (dotted) {
    if (baseDuration === '8') return 240;
    if (baseDuration === '16') return 120;
  }
  return durationTick;
}

/**
 * Convert an X coordinate within a measure's note region [noteStartX, noteEndX] to a snapped tick.
 */
export function xToSnappedTick(
  x: number,
  noteStartX: number,
  noteEndX: number,
  measureTicks: number,
  gridTicks: number,
): number {
  const width = Math.max(1, noteEndX - noteStartX);
  const ratio = Math.max(0, Math.min(0.9999, (x - noteStartX) / width));
  const rawTick = ratio * measureTicks;
  const slot = Math.floor(rawTick / gridTicks);
  const snapped = slot * gridTicks;
  return Math.max(0, Math.min(measureTicks - gridTicks, snapped));
}
