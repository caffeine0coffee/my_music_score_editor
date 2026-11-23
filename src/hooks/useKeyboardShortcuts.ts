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

      if (mod || e.altKey) return;

      // Duration keys 1-5
      if (KEY_TO_DURATION[e.key]) {
        e.preventDefault();
        store.setSelectedDuration(KEY_TO_DURATION[e.key]);
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

      // Pitch shift for selected note
      if (e.key === 'ArrowUp' && store.selectedNote) {
        e.preventDefault();
        store.shiftSelectedNote(1);
        return;
      }
      if (e.key === 'ArrowDown' && store.selectedNote) {
        e.preventDefault();
        store.shiftSelectedNote(-1);
        return;
      }

      // Delete selected note
      if ((e.key === 'Delete' || e.key === 'Backspace') && store.selectedNote) {
        e.preventDefault();
        store.deleteSelectedNote();
        return;
      }

      // Clear selection
      if (e.key === 'Escape') {
        store.setSelectedNote(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
