import { describe, expect, it } from 'vitest';
import { exportScoreToMidiBytes, importMidiToScore, inspectMidiFile } from '../midiCodec';
import { createInitialScore, createVoice } from '../../core/scoreFactory';

describe('midiCodec export & import roundtrip', () => {
  it('exports a multi-voice score to SMF and imports it back into staves or voices', () => {
    const score = createInitialScore(4);
    score.title = 'MIDI Roundtrip Test';
    score.tempo = 132;
    score.timeSignature = { beats: 3, beatType: 4 };

    score.staves[0].voices[0].measures[0].notes = [
      { id: 'a1', startTick: 0, durationTick: 480, pitches: [{ step: 'C', octave: 5 }] },
      { id: 'a2', startTick: 480, durationTick: 480, pitches: [{ step: 'E', octave: 5 }] },
      { id: 'a3', startTick: 960, durationTick: 480, pitches: [{ step: 'G', octave: 5 }] },
    ];

    const v1 = createVoice(1, 4);
    v1.measures[0].notes = [
      { id: 'b1', startTick: 0, durationTick: 1440, pitches: [{ step: 'C', octave: 3 }] },
    ];
    score.staves[0].voices.push(v1);

    const bytes = exportScoreToMidiBytes(score);
    expect(bytes.byteLength).toBeGreaterThan(20);

    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const inspection = inspectMidiFile(arrayBuffer);

    expect(inspection.tempo).toBe(132);
    expect(inspection.timeSignature).toEqual({ beats: 3, beatType: 4 });
    expect(inspection.tracks).toHaveLength(2);
    expect(inspection.tracks[0].suggestedClef).toBe('treble');
    expect(inspection.tracks[1].suggestedClef).toBe('bass');

    // Import as separate staves
    const asStaves = importMidiToScore(arrayBuffer, {
      quantize: '16',
      assignmentMode: 'staves',
      tracks: inspection.tracks.map((t) => ({
        trackIndex: t.trackIndex,
        enabled: true,
        clef: t.suggestedClef,
      })),
    });
    expect(asStaves.staves).toHaveLength(2);
    expect(asStaves.staves[0].clef).toBe('treble');
    expect(asStaves.staves[1].clef).toBe('bass');
    expect(asStaves.staves[0].voices[0].measures[0].notes).toHaveLength(3);
    expect(asStaves.staves[1].voices[0].measures[0].notes).toHaveLength(1);

    // Import merged as voices on a single staff
    const asVoices = importMidiToScore(arrayBuffer, {
      quantize: '8',
      assignmentMode: 'voices',
      tracks: inspection.tracks.map((t) => ({
        trackIndex: t.trackIndex,
        enabled: true,
        clef: 'treble',
      })),
    });
    expect(asVoices.staves).toHaveLength(1);
    expect(asVoices.staves[0].voices).toHaveLength(2);
  });
});
