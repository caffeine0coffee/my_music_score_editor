import React, { useEffect } from 'react';
import { TopToolbar } from './components/TopToolbar';
import { StaffVoiceBar } from './components/StaffVoiceBar';
import { NoteToolbar } from './components/NoteToolbar';
import { ScoreCanvas } from './components/ScoreCanvas';
import { MobileBottomDock } from './components/MobileBottomDock';
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
      <main className="flex-1 px-3 sm:px-4 pt-3 sm:pt-5 pb-32 md:pb-8">
        <StaffVoiceBar />
        <NoteToolbar />
        <ScoreCanvas />
      </main>
      <MobileBottomDock />
    </div>
  );
};

export default App;
