import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { TopToolbar } from './components/TopToolbar';
import { StaffVoiceBar } from './components/StaffVoiceBar';
import { NoteToolbar } from './components/NoteToolbar';
import { ScoreCanvas } from './components/ScoreCanvas';
import { MobileBottomDock } from './components/MobileBottomDock';
import { ScoreLibraryView } from './components/ScoreLibraryView';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useAuthStore } from './store/useAuthStore';
import { useScoreStore } from './store/useScoreStore';

type AppView = 'editor' | 'library';

export const App: React.FC = () => {
  const [view, setView] = useState<AppView>('editor');
  const initializeAuth = useAuthStore((s) => s.initialize);
  const authError = useAuthStore((s) => s.error);
  const clearAuthError = useAuthStore((s) => s.clearError);
  const flushSave = useScoreStore((s) => s.flushSave);

  useEffect(() => {
    void initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      void flushSave();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [flushSave]);

  useKeyboardShortcuts(view === 'editor');

  if (view === 'library') {
    return <ScoreLibraryView onBackToEditor={() => setView('editor')} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <TopToolbar onOpenLibrary={() => setView('library')} />
      {authError && (
        <div className="bg-rose-50 border-b border-rose-200 px-4 py-2 text-xs text-rose-700 flex items-center justify-between gap-2">
          <span>{authError}</span>
          <button
            type="button"
            onClick={clearAuthError}
            className="text-rose-500 hover:text-rose-800"
            aria-label="エラーを閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
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
