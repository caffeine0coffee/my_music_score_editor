# デプロイ・クラウド連携ガイド (Supabase + Cloudflare Pages)

本アプリは環境変数未設定時でもローカル保存モード（`LocalStorage`）で動作しますが、Supabase と Cloudflare Pages を設定することで **Google ログインによるクラウド自動同期** と **本番公開** が有効になります。

---

## 1. Supabase プロジェクトのセットアップ

1. [Supabase](https://supabase.com/) で新規プロジェクトを作成します。
2. 左メニューの **SQL Editor** を開き、[`supabase/schema.sql`](../supabase/schema.sql) の内容を貼り付けて実行します。
   - `public.scores` テーブル（複合主キー `(user_id, id)`）
   - `updated_at` 自動更新トリガー
   - Row Level Security (RLS) ポリシー（本人の譜面のみ SELECT / INSERT / UPDATE / DELETE 可能）
3. 左メニューの **Project Settings** から以下の 2 つの値を控えます（画面上部の **Connect → App Frameworks** からもまとめて確認できます）。
   - **Data API → Project URL** → `VITE_SUPABASE_URL`
   - **API Keys → Publishable key** (`sb_publishable_...`) → `VITE_SUPABASE_PUBLISHABLE_KEY`
     （※ Secret key はブラウザ側には絶対に設定しないでください）

---

## 2. Google OAuth ログイン設定

1. [Google Cloud Console](https://console.cloud.google.com/) で OAuth 2.0 クライアント ID（ウェブアプリケーション）を作成します。
   - **承認済みのリダイレクト URI**:
     `https://<your-project-id>.supabase.co/auth/v1/callback`
2. Supabase Dashboard の **Authentication → Providers → Google** を有効化し、Google の Client ID / Client Secret を入力して保存します。
3. Supabase Dashboard の **Authentication → URL Configuration** で以下を設定します。
   - **Site URL**: 本番 URL（例: `https://<your-app>.pages.dev`）
   - **Redirect URLs**:
     - `https://<your-app>.pages.dev`
     - `https://<your-app>.pages.dev/**`
     - ローカル開発用: `http://127.0.0.1:5173`（必要に応じて Tailscale の `https://*.ts.net` URL も追加）

---

## 3. ローカルでの動作確認

リポジトリルートに `.env.local` を作成します（`.env.example` を参照）。

```bash
cp .env.example .env.local
# VITE_SUPABASE_URL と VITE_SUPABASE_PUBLISHABLE_KEY を記入
npm run dev
```

- `.env.local` を設定しない場合は、自動的に **ローカル保存モード** で起動します（Tailscale 経由の実機テスト時もそのまま動作します）。

---

## 4. Cloudflare Workers（Static Assets）または Pages へのデプロイ

### A. Cloudflare Workers（Static Assets）でデプロイする場合（推奨）
リポジトリルートに [`wrangler.jsonc`](../wrangler.jsonc) を配置済みです。

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages → Create → Import a repository** で本リポジトリを接続します。
2. 設定画面で以下のように入力します：
   - **Project name**: `my-music-score-editor`
   - **Build command**: `npm run build`
   - **Deploy command**: `npx wrangler deploy`
3. **Advanced settings → Variables and secrets（Build variables）** に以下を設定します：
   - `VITE_SUPABASE_URL`: Supabase Project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: Supabase Publishable key (`sb_publishable_...`)
4. **Deploy** をクリックします。デプロイ完了後、公開 URL（`https://my-music-score-editor.<subdomain>.workers.dev`）を Supabase の **Authentication → URL Configuration**（Site URL / Redirect URLs）に登録して完了です。

### B. Cloudflare Pages でデプロイする場合
1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages → Create → Pages → Import an existing Git repository** で本リポジトリを接続します。
2. ビルド設定を以下のように入力します。
   - **Framework preset**: `Vite`（または None）
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
3. **Environment variables**（Production / Preview）に以下を設定します。
   - `NODE_VERSION`: `20`（または `22`）
   - `VITE_SUPABASE_URL`: Supabase Project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: Supabase Publishable key (`sb_publishable_...`)
4. デプロイ完了後、公開 URL（`https://<your-app>.pages.dev`）を Supabase の **Authentication → URL Configuration** に登録して完了です。

> **SPA ルーティング**: Workers では `wrangler.jsonc` の `not_found_handling: "single-page-application"` により、Pages でも `404.html` を置かない構成により自動的に `index.html` へフォールバックされるため、OAuth コールバックや直接 URL アクセス時も正常に動作します。
