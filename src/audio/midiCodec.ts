import { Midi } from '@tonejs/midi';
import type { ClefType, MeasureMeta, NoteEvent, Pitch, Score, Staff, TimeSignature, Voice } from '../types/score';
import { MAX_STAVES, MAX_VOICES_PER_STAFF, TICKS_PER_QUARTER, VOICE_COLORS, VOICE_LABELS } from '../core/constants';
import { isFlatKeySignature, midiToPitch, sortPitchesAscending } from '../core/pitch';
import { getMeasureTicks, largestFittingDuration } from '../core/rhythm';
import { generateId } from '../core/scoreFactory';
import { buildPlaybackSequence } from './scoreSequence';

export type MidiQuantizeOption = '16' | '8' | '8t';

export interface MidiTrackSummary {
  trackIndex: number;
  name: string;
  instrument: string;
  channel: number;
  noteCount: number;
  avgMidi: number;
  suggestedClef: ClefType;
}

export interface MidiInspection {
  title: string;
  tempo: number;
  timeSignature: TimeSignature;
  ppq: number;
  tracks: MidiTrackSummary[];
}

export interface MidiTrackImportConfig {
  trackIndex: number;
  enabled: boolean;
  clef: ClefType;
}

export interface MidiImportOptions {
  quantize: MidiQuantizeOption;
  assignmentMode: 'staves' | 'voices';
  tracks: MidiTrackImportConfig[];
  fallbackTitle?: string;
}

const QUANTIZE_TICKS: Record<MidiQuantizeOption, { grid: number; isTriplet: boolean }> = {
  '16': { grid: 120, isTriplet: false },
  '8': { grid: 240, isTriplet: false },
  '8t': { grid: 160, isTriplet: true },
};

/**
 * Convert a Score into standard MIDI file bytes (SMF, PPQ = 480).
 */
export function exportScoreToMidiBytes(score: Score): Uint8Array {
  const midi = new Midi();
  midi.header.name = score.title || 'Untitled Score';
  midi.header.setTempo(score.tempo);
  midi.header.timeSignatures.push({
    ticks: 0,
    timeSignature: [score.timeSignature.beats, score.timeSignature.beatType],
    measures: 0,
  });

  const seq = buildPlaybackSequence(score, {
    respectMuteSolo: false,
    expandRepeats: false,
  });

  // Group events by (staffIndex, voiceIndex)
  const grouped = new Map<string, typeof seq.events>();
  for (const ev of seq.events) {
    const key = `${ev.staffIndex}:${ev.voiceIndex}`;
    const list = grouped.get(key) ?? [];
    list.push(ev);
    grouped.set(key, list);
  }

  let channelCounter = 0;
  for (let sIdx = 0; sIdx < score.staves.length; sIdx++) {
    const staff = score.staves[sIdx];
    for (let vIdx = 0; vIdx < staff.voices.length; vIdx++) {
      const key = `${sIdx}:${vIdx}`;
      const voiceEvents = grouped.get(key) ?? [];
      if (voiceEvents.length === 0) continue;

      const track = midi.addTrack();
      const staffLabel = staff.name?.trim() || `Staff ${sIdx + 1}`;
      const voiceLabel = VOICE_LABELS[vIdx] ?? `${vIdx + 1}th`;
      track.name = `${staffLabel} - ${voiceLabel}`;

      // Avoid MIDI channel 9 (General MIDI percussion)
      const ch = channelCounter >= 9 ? (channelCounter + 1) % 16 : channelCounter % 16;
      track.channel = ch;
      channelCounter++;

      for (const ev of voiceEvents) {
        track.addNote({
          midi: Math.max(0, Math.min(127, ev.midi)),
          ticks: Math.max(0, Math.round(ev.startTick)),
          durationTicks: Math.max(30, Math.round(ev.durationTick)),
          velocity: Math.max(0.1, Math.min(1, ev.velocity)),
        });
      }
    }
  }

  return midi.toArray();
}

export function downloadMidiFile(score: Score): void {
  const bytes = exportScoreToMidiBytes(score);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeTitle = (score.title || 'score').replace(/[\\/:*?"<>|]/g, '_');
  a.href = url;
  a.download = `${safeTitle}.mid`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Inspect an uploaded MIDI file to present track/quantization choices in the import dialog.
 */
export function inspectMidiFile(buffer: ArrayBuffer, fallbackTitle = 'インポートしたスコア'): MidiInspection {
  const midi = new Midi(buffer);
  const tempo = Math.round(midi.header.tempos[0]?.bpm ?? 120);
  const tsRaw = midi.header.timeSignatures[0]?.timeSignature;
  const timeSignature: TimeSignature =
    tsRaw && tsRaw.length >= 2 && tsRaw[0] > 0 && tsRaw[1] > 0
      ? { beats: tsRaw[0], beatType: tsRaw[1] }
      : { beats: 4, beatType: 4 };

  const tracks: MidiTrackSummary[] = [];
  midi.tracks.forEach((t, idx) => {
    if (t.notes.length === 0) return;
    const avgMidi = t.notes.reduce((sum, n) => sum + n.midi, 0) / t.notes.length;
    tracks.push({
      trackIndex: idx,
      name: t.name?.trim() || `Track ${idx + 1}`,
      instrument: t.instrument?.name || 'Piano',
      channel: t.channel,
      noteCount: t.notes.length,
      avgMidi: Math.round(avgMidi),
      suggestedClef: avgMidi < 58 ? 'bass' : 'treble',
    });
  });

  return {
    title: midi.header.name?.trim() || fallbackTitle,
    tempo: Math.max(20, Math.min(300, tempo)),
    timeSignature,
    ppq: midi.header.ppq || TICKS_PER_QUARTER,
    tracks,
  };
}

interface RawQuantizedNote {
  startTick: number;
  durationTick: number;
  pitch: Pitch;
  tieToNext?: boolean;
}

function buildVoiceFromMidiTrack(
  trackNotes: { midi: number; ticks: number; durationTicks: number }[],
  ppq: number,
  measureCount: number,
  measureTicks: number,
  quantize: MidiQuantizeOption,
  voiceIndex: number,
  preferFlats: boolean,
): Voice {
  const { grid, isTriplet } = QUANTIZE_TICKS[quantize];
  const scale = TICKS_PER_QUARTER / Math.max(1, ppq);

  // Per-measure map of startTick -> { durationTick, pitches, tieToNext }
  const measureBuckets: Map<number, { durationTick: number; pitches: Pitch[]; tieToNext: boolean }>[] =
    Array.from({ length: measureCount }, () => new Map());

  for (const n of trackNotes) {
    const scaledStart = n.ticks * scale;
    const scaledDur = n.durationTicks * scale;

    const qStart = Math.max(0, Math.round(scaledStart / grid) * grid);
    const qDur = Math.max(grid, Math.round(scaledDur / grid) * grid);
    const pitch = midiToPitch(n.midi, preferFlats);

    // Split across measure boundaries if needed
    let curTick = qStart;
    let remaining = qDur;
    const segments: RawQuantizedNote[] = [];

    while (remaining > 0) {
      const mIdx = Math.floor(curTick / measureTicks);
      if (mIdx >= measureCount) break;
      const tickInMeasure = curTick - mIdx * measureTicks;
      const avail = measureTicks - tickInMeasure;
      const segDur = Math.min(remaining, avail);
      const willContinue = remaining > avail && mIdx + 1 < measureCount;
      segments.push({
        startTick: curTick,
        durationTick: segDur,
        pitch,
        tieToNext: willContinue,
      });
      curTick += segDur;
      remaining -= segDur;
    }

    for (const seg of segments) {
      const mIdx = Math.floor(seg.startTick / measureTicks);
      if (mIdx < 0 || mIdx >= measureCount) continue;
      const tickInMeasure = seg.startTick - mIdx * measureTicks;
      const bucket = measureBuckets[mIdx];
      const existing = bucket.get(tickInMeasure);
      if (existing) {
        if (
          !existing.pitches.some(
            (p) => p.step === seg.pitch.step && p.octave === seg.pitch.octave,
          )
        ) {
          existing.pitches.push(seg.pitch);
        }
        existing.durationTick = Math.max(existing.durationTick, seg.durationTick);
        existing.tieToNext = existing.tieToNext || Boolean(seg.tieToNext);
      } else {
        bucket.set(tickInMeasure, {
          durationTick: seg.durationTick,
          pitches: [seg.pitch],
          tieToNext: Boolean(seg.tieToNext),
        });
      }
    }
  }

  const measures = measureBuckets.map((bucket, mIdx) => {
    const sortedTicks = Array.from(bucket.keys()).sort((a, b) => a - b);
    const notes: NoteEvent[] = [];

    for (let i = 0; i < sortedTicks.length; i++) {
      const startTick = sortedTicks[i];
      const entry = bucket.get(startTick)!;
      const nextTick = i + 1 < sortedTicks.length ? sortedTicks[i + 1] : measureTicks;
      const maxDur = Math.min(entry.durationTick, nextTick - startTick);
      const fitted = largestFittingDuration(maxDur, isTriplet);
      if (!fitted) continue;

      notes.push({
        id: generateId('note'),
        startTick,
        durationTick: fitted.durationTick,
        ...(fitted.tuplet ? { tuplet: fitted.tuplet } : {}),
        pitches: sortPitchesAscending(entry.pitches),
        ...(entry.tieToNext ? { tieToNext: true } : {}),
      });
    }

    return {
      measureIndex: mIdx,
      notes,
    };
  });

  return {
    id: generateId('voice'),
    index: voiceIndex,
    color: VOICE_COLORS[voiceIndex % VOICE_COLORS.length],
    measures,
  };
}

/**
 * Import a MIDI file into a full Score object according to the user's dialog configuration.
 */
export function importMidiToScore(buffer: ArrayBuffer, options: MidiImportOptions): Score {
  const midi = new Midi(buffer);
  const ppq = midi.header.ppq || TICKS_PER_QUARTER;
  const scale = TICKS_PER_QUARTER / Math.max(1, ppq);
  const tempo = Math.max(20, Math.min(300, Math.round(midi.header.tempos[0]?.bpm ?? 120)));

  const tsRaw = midi.header.timeSignatures[0]?.timeSignature;
  const timeSignature: TimeSignature =
    tsRaw && tsRaw.length >= 2 && tsRaw[0] > 0 && tsRaw[1] > 0
      ? { beats: tsRaw[0], beatType: tsRaw[1] }
      : { beats: 4, beatType: 4 };

  const measureTicks = getMeasureTicks(timeSignature);
  const enabledConfigs = options.tracks.filter((c) => c.enabled);

  // Determine total measure count across enabled tracks
  let maxEndTick = measureTicks * 4;
  for (const cfg of enabledConfigs) {
    const t = midi.tracks[cfg.trackIndex];
    if (!t) continue;
    for (const n of t.notes) {
      const end = (n.ticks + n.durationTicks) * scale;
      if (end > maxEndTick) maxEndTick = end;
    }
  }
  const measureCount = Math.max(4, Math.min(128, Math.ceil(maxEndTick / measureTicks)));

  const keySignature = 'C';
  const preferFlats = isFlatKeySignature(keySignature);

  const staves: Staff[] = [];

  if (options.assignmentMode === 'voices') {
    const selected = enabledConfigs.slice(0, MAX_VOICES_PER_STAFF);
    const primaryClef = selected[0]?.clef ?? 'treble';
    const voices: Voice[] = selected.map((cfg, vIdx) => {
      const track = midi.tracks[cfg.trackIndex];
      return buildVoiceFromMidiTrack(
        track?.notes ?? [],
        ppq,
        measureCount,
        measureTicks,
        options.quantize,
        vIdx,
        preferFlats,
      );
    });
    if (voices.length === 0) {
      voices.push(
        buildVoiceFromMidiTrack([], ppq, measureCount, measureTicks, options.quantize, 0, preferFlats),
      );
    }
    staves.push({
      id: generateId('staff'),
      clef: primaryClef,
      voices,
    });
  } else {
    const selected = enabledConfigs.slice(0, MAX_STAVES);
    for (const cfg of selected) {
      const track = midi.tracks[cfg.trackIndex];
      const voice = buildVoiceFromMidiTrack(
        track?.notes ?? [],
        ppq,
        measureCount,
        measureTicks,
        options.quantize,
        0,
        preferFlats,
      );
      staves.push({
        id: generateId('staff'),
        name: track?.name?.trim() || undefined,
        clef: cfg.clef,
        voices: [voice],
      });
    }
    if (staves.length === 0) {
      staves.push({
        id: generateId('staff'),
        clef: 'treble',
        voices: [
          buildVoiceFromMidiTrack([], ppq, measureCount, measureTicks, options.quantize, 0, preferFlats),
        ],
      });
    }
  }

  const measureMeta: MeasureMeta[] = Array.from({ length: measureCount }, (_, i) => ({
    index: i,
  }));

  return {
    id: 'local-default-score',
    title: midi.header.name?.trim() || options.fallbackTitle || 'インポートしたスコア',
    subtitle: '',
    composer: '',
    tempo,
    timeSignature,
    keySignature,
    staves,
    measureMeta,
    updatedAt: new Date().toISOString(),
  };
}
