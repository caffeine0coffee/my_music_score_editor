import { describe, expect, it } from 'vitest';
import { buildPlaybackSequence, expandMeasureOrder } from '../scoreSequence';
import { midiToPitch, pitchToMidi } from '../../core/pitch';
import { createInitialScore, createVoice } from '../../core/scoreFactory';
import { computePrintPagePlans } from '../../renderer/printRenderer';

describe('pitch MIDI conversion', () => {
  it('applies key signature and measure-local accidentals accurately', () => {
    // G major: F is F#
    expect(pitchToMidi({ step: 'F', octave: 4 }, 'G')).toBe(66);
    // Natural overrides key signature within the measure
    const acc = new Map<string, number>();
    expect(pitchToMidi({ step: 'F', octave: 4, accidental: 'n' }, 'G', acc)).toBe(65);
    expect(pitchToMidi({ step: 'F', octave: 4 }, 'G', acc)).toBe(65);

    // F major: B is Bb
    expect(pitchToMidi({ step: 'B', octave: 3 }, 'F')).toBe(58);

    // Roundtrip midiToPitch
    expect(midiToPitch(60)).toEqual({ step: 'C', octave: 4 });
    expect(midiToPitch(61, false)).toEqual({ step: 'C', octave: 4, accidental: '#' });
    expect(midiToPitch(61, true)).toEqual({ step: 'D', octave: 4, accidental: 'b' });
  });
});

describe('scoreSequence playback builder', () => {
  it('expands repeat signs once', () => {
    const order = expandMeasureOrder([
      { index: 0 },
      { index: 1, repeatStart: true },
      { index: 2, repeatEnd: true },
      { index: 3 },
    ]);
    expect(order).toEqual([0, 1, 2, 1, 2, 3]);
  });

  it('merges cross-measure tied notes and respects voice mute/solo', () => {
    const score = createInitialScore(2);
    // Voice 0: C4 half note at tick 1440 (end of measure 0) tied to C4 quarter at tick 0 of measure 1
    score.staves[0].voices[0].measures[0].notes = [
      {
        id: 'n1',
        startTick: 1440,
        durationTick: 480,
        pitches: [{ step: 'C', octave: 4 }],
        tieToNext: true,
        dynamic: 'ff',
      },
    ];
    score.staves[0].voices[0].measures[1].notes = [
      {
        id: 'n2',
        startTick: 0,
        durationTick: 480,
        pitches: [{ step: 'C', octave: 4 }],
      },
    ];

    // Add Voice 1 with G4
    const v1 = createVoice(1, 2);
    v1.measures[0].notes = [
      { id: 'v1n1', startTick: 0, durationTick: 480, pitches: [{ step: 'G', octave: 4 }] },
    ];
    score.staves[0].voices.push(v1);

    const seqAll = buildPlaybackSequence(score);
    expect(seqAll.events).toHaveLength(2);
    const tiedC = seqAll.events.find((e) => e.midi === 60)!;
    expect(tiedC.startTick).toBe(1440);
    expect(tiedC.durationTick).toBe(960); // merged 480 + 480 across measure boundary
    expect(tiedC.velocity).toBeGreaterThan(0.9);

    // Solo voice 1 -> only G4 plays
    score.staves[0].voices[1].solo = true;
    const seqSolo = buildPlaybackSequence(score);
    expect(seqSolo.events).toHaveLength(1);
    expect(seqSolo.events[0].midi).toBe(67);

    // Mute voice 1 as well -> nothing plays
    score.staves[0].voices[1].muted = true;
    const seqMuted = buildPlaybackSequence(score);
    expect(seqMuted.events).toHaveLength(0);
  });

  it('partitions long scores into multiple A4 pages and respects break hints', () => {
    const longScore = createInitialScore(32);
    const plans = computePrintPagePlans(longScore, 4);
    expect(plans.length).toBeGreaterThanOrEqual(2);
    expect(plans[0].isFirstPage).toBe(true);
    expect(plans[1].isFirstPage).toBe(false);

    // Explicit page break after measure 1
    const shortScore = createInitialScore(4);
    shortScore.measureMeta[1].pageBreakAfter = true;
    const breakPlans = computePrintPagePlans(shortScore, 4);
    expect(breakPlans).toHaveLength(2);
    expect(breakPlans[0].rows[0]).toMatchObject({ startMeasure: 0, endMeasure: 2 });
    expect(breakPlans[1].rows[0]).toMatchObject({ startMeasure: 2, endMeasure: 4 });
  });
});
