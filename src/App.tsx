import React, { useEffect } from 'react';
import { TopToolbar } from './components/TopToolbar';
import { NoteToolbar } from './components/NoteToolbar';
import { ScoreCanvas } from './components/ScoreCanvas';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useScoreStore } from './store/useScoreStore';

export const App: React.FC = () => {
  const hydrate = useScoreStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useKeyboardShortcuts();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <TopToolbar />
      <main className="flex-1 px-3 sm:px-4 py-4 sm:py-6">
        <NoteToolbar />
        <ScoreCanvas />
      </main>
    </div>
  );
};

export default App;
