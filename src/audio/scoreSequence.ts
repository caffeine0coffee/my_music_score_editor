import type { MeasureMeta, Score } from '../types/score';
import { DYNAMIC_TO_VELOCITY, pitchToMidi } from '../core/pitch';
import { getMeasureTicks } from '../core/rhythm';

export interface ScheduledNote {
  staffIndex: number;
  voiceIndex: number;
  measureIndex: number;
  playbackMeasurePos: number;
  startTick: number;
  durationTick: number;
  midi: number;
  velocity: number;
}

export interface PlaybackSequence {
  events: ScheduledNote[];
  measureOrder: number[];
  totalTicks: number;
  measureTicks: number;
}

export interface BuildSequenceOptions {
  respectMuteSolo?: boolean;
  expandRepeats?: boolean;
  startMeasure?: number;
}

/**
 * Expand repeat signs (|: ... :|) into a flat playback order of measure indices.
 * Each repeatEnd jumps back once to the most recent repeatStart (or measure 0 if none).
 */
export function expandMeasureOrder(measureMeta: MeasureMeta[]): number[] {
  const count = measureMeta.length;
  if (count === 0) return [];

  const order: number[] = [];
  const repeatedEnds = new Set<number>();
  let repeatStartIdx = 0;
  let i = 0;
  const maxSteps = count * 4 + 16; // safety guard

  while (i < count && order.length < maxSteps) {
    if (measureMeta[i]?.repeatStart) {
      repeatStartIdx = i;
    }
    order.push(i);

    if (measureMeta[i]?.repeatEnd && !repeatedEnds.has(i)) {
      repeatedEnds.add(i);
      i = repeatStartIdx;
      continue;
    }
    i++;
  }

  return order;
}

/**
 * Build a flat, tie-merged, key/accidental/dynamic-aware sequence of note events
 * for Web Audio playback or MIDI export.
 */
export function buildPlaybackSequence(
  score: Score,
  options: BuildSequenceOptions = {},
): PlaybackSequence {
  const {
    respectMuteSolo = true,
    expandRepeats = true,
    startMeasure = 0,
  } = options;

  const measureTicks = getMeasureTicks(score.timeSignature);
  const fullOrder = expandRepeats
    ? expandMeasureOrder(score.measureMeta)
    : score.measureMeta.map((_, idx) => idx);

  // If starting from a specific measure, slice from the first occurrence of startMeasure
  let measureOrder = fullOrder;
  if (startMeasure > 0) {
    const startPos = fullOrder.indexOf(startMeasure);
    if (startPos >= 0) {
      measureOrder = fullOrder.slice(startPos);
    }
  }

  // Determine if any voice in the score is soloed
  const anySolo =
    respectMuteSolo &&
    score.staves.some((staff) => staff.voices.some((v) => Boolean(v.solo)));

  const events: ScheduledNote[] = [];

  for (let sIdx = 0; sIdx < score.staves.length; sIdx++) {
    const staff = score.staves[sIdx];
    for (let vIdx = 0; vIdx < staff.voices.length; vIdx++) {
      const voice = staff.voices[vIdx];

      if (respectMuteSolo) {
        if (voice.muted) continue;
        if (anySolo && !voice.solo) continue;
      }

      let currentVelocity = DYNAMIC_TO_VELOCITY.mf;
      // Map of midi -> currently tied ScheduledNote awaiting continuation
      let pendingTies = new Map<number, ScheduledNote>();

      for (let pos = 0; pos < measureOrder.length; pos++) {
        const mIdx = measureOrder[pos];
        const measureBaseTick = pos * measureTicks;
        const measureNotes = voice.measures[mIdx]?.notes ?? [];
        const measureAccidentals = new Map<string, number>();

        for (const note of measureNotes) {
          if (note.dynamic) {
            currentVelocity = DYNAMIC_TO_VELOCITY[note.dynamic];
          }

          const absStartTick = measureBaseTick + note.startTick;
          const nextPendingTies = new Map<number, ScheduledNote>();

          for (const pitch of note.pitches) {
            const midi = pitchToMidi(pitch, score.keySignature, measureAccidentals);
            const tiedFrom = pendingTies.get(midi);

            if (tiedFrom) {
              // Extend previous note's duration instead of re-articulating
              tiedFrom.durationTick = absStartTick + note.durationTick - tiedFrom.startTick;
              if (note.tieToNext) {
                nextPendingTies.set(midi, tiedFrom);
              }
            } else {
              const ev: ScheduledNote = {
                staffIndex: sIdx,
                voiceIndex: vIdx,
                measureIndex: mIdx,
                playbackMeasurePos: pos,
                startTick: absStartTick,
                durationTick: note.durationTick,
                midi,
                velocity: currentVelocity,
              };
              events.push(ev);
              if (note.tieToNext) {
                nextPendingTies.set(midi, ev);
              }
            }
          }

          pendingTies = nextPendingTies;
        }
      }
    }
  }

  events.sort((a, b) => a.startTick - b.startTick || a.midi - b.midi);

  return {
    events,
    measureOrder,
    totalTicks: measureOrder.length * measureTicks,
    measureTicks,
  };
}
