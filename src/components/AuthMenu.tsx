import React from 'react';
import { Cloud, CloudOff, Loader2, LogIn, LogOut } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';

export const AuthMenu: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const isConfigured = useAuthStore((s) => s.isConfigured);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const signOut = useAuthStore((s) => s.signOut);

  if (!isConfigured) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 text-[11px] font-medium"
        title="Supabase 環境変数が未設定のためローカル保存モードで動作中です"
      >
        <CloudOff className="w-3.5 h-3.5 text-slate-400" />
        <span className="hidden lg:inline">ローカル</span>
      </span>
    );
  }

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      </span>
    );
  }

  if (!user) {
    return (
      <button
        type="button"
        onClick={() => void signInWithGoogle()}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 font-medium text-xs transition-colors shadow-2xs"
        title="Googleアカウントでログインしてクラウド同期を有効化"
      >
        <LogIn className="w-3.5 h-3.5 text-blue-700" />
        <span className="hidden sm:inline">ログイン</span>
      </button>
    );
  }

  const avatarUrl =
    typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null;
  const displayName =
    (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name) ||
    user.email ||
    'ユーザー';

  return (
    <div className="inline-flex items-center gap-1.5 pl-1.5 pr-1 py-0.5 rounded-lg border border-emerald-200 bg-emerald-50/60">
      <Cloud className="w-3.5 h-3.5 text-emerald-600 hidden sm:block" />
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={displayName}
          className="w-5 h-5 rounded-full object-cover border border-emerald-200"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="w-5 h-5 rounded-full bg-emerald-700 text-white text-[10px] font-bold flex items-center justify-center">
          {displayName.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span
        className="text-[11px] font-medium text-slate-700 max-w-24 truncate hidden lg:inline"
        title={user.email ?? displayName}
      >
        {displayName}
      </span>
      <button
        type="button"
        onClick={() => {
          if (window.confirm('ログアウトしてローカルモードに戻りますか？')) {
            void signOut();
          }
        }}
        className="p-1 rounded-md text-slate-500 hover:text-rose-600 hover:bg-white transition-colors"
        title="ログアウト"
        aria-label="ログアウト"
      >
        <LogOut className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
