import { beforeEach, describe, expect, it } from 'vitest';
import { useScoreStore } from '../useScoreStore';

describe('useScoreStore Milestone 2 workflows', () => {
  beforeEach(() => {
    useScoreStore.getState().resetScore();
    useScoreStore.setState({ past: [], future: [], clipboard: null });
  });

  it('adds and removes staves and voices while clamping active indices', () => {
    const store = useScoreStore.getState();
    expect(store.score.staves).toHaveLength(1);

    // Add bass staff
    store.addStaff('bass');
    expect(useScoreStore.getState().score.staves).toHaveLength(2);
    expect(useScoreStore.getState().score.staves[1].clef).toBe('bass');
    expect(useScoreStore.getState().activeStaffIndex).toBe(1);

    // Add 2nd voice to active staff
    useScoreStore.getState().addVoice();
    expect(useScoreStore.getState().score.staves[1].voices).toHaveLength(2);
    expect(useScoreStore.getState().activeVoiceIndex).toBe(1);

    // Remove staff 1 -> activeStaffIndex clamps back to 0 and voice clamps to 0
    useScoreStore.getState().removeStaff(1);
    expect(useScoreStore.getState().score.staves).toHaveLength(1);
    expect(useScoreStore.getState().activeStaffIndex).toBe(0);
    expect(useScoreStore.getState().activeVoiceIndex).toBe(0);
  });

  it('copies selected measures and pastes into active voice, and duplicates to another voice', () => {
    // Place two notes in measure 0 of voice 0
    useScoreStore.getState().placeNote(0, 0, { step: 'C', octave: 5 });
    useScoreStore.getState().placeNote(0, 480, { step: 'E', octave: 5 });

    // Select measure 0 and copy
    useScoreStore.getState().selectMeasure(0);
    useScoreStore.getState().copySelection();
    expect(useScoreStore.getState().clipboard?.type).toBe('measures');

    // Paste into measure 2
    useScoreStore.getState().selectMeasure(2);
    useScoreStore.getState().pasteToActiveVoice();
    const m2Notes = useScoreStore.getState().score.staves[0].voices[0].measures[2].notes;
    expect(m2Notes).toHaveLength(2);
    expect(m2Notes[0].pitches[0]).toEqual({ step: 'C', octave: 5 });
    expect(m2Notes[1].pitches[0]).toEqual({ step: 'E', octave: 5 });

    // One-tap duplicate measure 0 to 2nd voice (auto-creates 2nd voice)
    useScoreStore.getState().selectMeasure(0);
    useScoreStore.getState().duplicateSelectionToVoice(1);
    const state = useScoreStore.getState();
    expect(state.score.staves[0].voices).toHaveLength(2);
    expect(state.activeVoiceIndex).toBe(1);
    expect(state.score.staves[0].voices[1].measures[0].notes).toHaveLength(2);
  });

  it('applies tie, slur, dynamic, repeats, and header metadata with undo/redo', () => {
    useScoreStore.getState().placeNote(0, 0, { step: 'G', octave: 4 });
    useScoreStore.getState().placeNote(1, 0, { step: 'G', octave: 4 });

    const m0Note = useScoreStore.getState().score.staves[0].voices[0].measures[0].notes[0];
    useScoreStore.getState().setSelectedNote({
      staffIndex: 0,
      voiceIndex: 0,
      measureIndex: 0,
      noteId: m0Note.id,
    });

    useScoreStore.getState().toggleTieOnSelected();
    useScoreStore.getState().toggleSlurOnSelected();
    useScoreStore.getState().setDynamicOnSelected('f');
    useScoreStore.getState().toggleRepeatStart(0);
    useScoreStore.getState().toggleRepeatEnd(1);
    useScoreStore.getState().setScoreMetadata({
      title: 'テスト曲',
      subtitle: 'Op. 1',
      composer: 'テスト作曲者',
    });

    const s = useScoreStore.getState().score;
    const updatedM0 = s.staves[0].voices[0].measures[0].notes[0];
    const updatedM1 = s.staves[0].voices[0].measures[1].notes[0];

    expect(updatedM0.tieToNext).toBe(true);
    expect(updatedM0.slurStart).toBe(true);
    expect(updatedM1.slurEnd).toBe(true);
    expect(updatedM0.dynamic).toBe('f');
    expect(s.measureMeta[0].repeatStart).toBe(true);
    expect(s.measureMeta[1].repeatEnd).toBe(true);
    expect(s.title).toBe('テスト曲');
    expect(s.subtitle).toBe('Op. 1');
    expect(s.composer).toBe('テスト作曲者');

    // Undo metadata edit
    useScoreStore.getState().undo();
    expect(useScoreStore.getState().score.title).toBe('無題のスコア');
    useScoreStore.getState().redo();
    expect(useScoreStore.getState().score.title).toBe('テスト曲');
  });
});
