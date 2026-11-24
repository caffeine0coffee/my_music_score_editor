import { useEffect } from 'react';
import { useScoreStore } from '../store/useScoreStore';
import type { BaseDuration } from '../types/score';

const KEY_TO_DURATION: Record<string, BaseDuration> = {
  '1': 'w',
  '2': 'h',
  '3': 'q',
  '4': '8',
  '5': '16',
};

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcuts when typing inside inputs/selects/textareas
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      const store = useScoreStore.getState();
      const mod = e.ctrlKey || e.metaKey;

      // Alt + 1..4 -> Voice switch
      if (e.altKey && !mod && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        const voiceIndex = Number(e.key) - 1;
        store.setActiveVoice(voiceIndex);
        return;
      }

      // Undo / Redo
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          store.redo();
        } else {
          store.undo();
        }
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        store.redo();
        return;
      }

      // Copy / Paste
      if (mod && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        store.copySelection();
        return;
      }
      if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        store.pasteToActiveVoice();
        return;
      }

      if (mod || e.altKey) return;

      // Space: Play / Stop preview
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        store.togglePlayback();
        return;
      }

      // Duration keys 1-5
      if (KEY_TO_DURATION[e.key]) {
        e.preventDefault();
        store.setSelectedDuration(KEY_TO_DURATION[e.key]);
        if (store.interactionMode === 'select') {
          store.setInteractionMode('input');
        }
        return;
      }

      // Dotted
      if (e.key === '.') {
        e.preventDefault();
        store.toggleDotted();
        return;
      }

      // Triplet
      if (e.key.toLowerCase() === 't') {
        e.preventDefault();
        store.toggleTriplet();
        return;
      }

      // Chord mode toggle
      if (e.key.toLowerCase() === 'c') {
        e.preventDefault();
        store.toggleChordMode();
        return;
      }

      // Toggle Input / Select mode
      if (e.key.toLowerCase() === 'v' || e.key.toLowerCase() === 's') {
        e.preventDefault();
        store.setInteractionMode(store.interactionMode === 'input' ? 'select' : 'input');
        return;
      }

      // Tie toggle
      if (e.key.toLowerCase() === 'l') {
        e.preventDefault();
        store.toggleTieOnSelected();
        return;
      }

      const hasSelection =
        store.selectedNote !== null ||
        store.selectedNotes.length > 0 ||
        store.selectedMeasureRange !== null;

      // Pitch shift for selected note(s) or measure(s)
      if (e.key === 'ArrowUp' && hasSelection) {
        e.preventDefault();
        store.shiftSelectedNote(1);
        return;
      }
      if (e.key === 'ArrowDown' && hasSelection) {
        e.preventDefault();
        store.shiftSelectedNote(-1);
        return;
      }

      // Delete selected note(s) or measure(s)
      if ((e.key === 'Delete' || e.key === 'Backspace') && hasSelection) {
        e.preventDefault();
        store.deleteSelectedNote();
        return;
      }

      // Clear selection / return to input mode
      if (e.key === 'Escape') {
        store.clearSelection();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
