# 開発進捗 (Progress)

設計・ロードマップの詳細は [docs/design-plan.md](./docs/design-plan.md) を参照。

---

## マイルストーン別ステータス

### Milestone 1: プロジェクト基盤＆コア譜面エディタ（ローカル動作） — ✅ 完了
- [x] Vite + React + TypeScript + Tailwind CSS + Zustand (+ Immer) + Vitest のセットアップ
- [x] コアデータモデル（Tickベース: 1四分音符=480 ticks）と自動休符生成ロジックの実装・単体テスト
- [x] VexFlow（SVG）レンダラー＋インタラクション層（クリック／タップ配置、ゴースト音符プレビュー、単音上書き、和音モード、削除、Undo/Redo、PCショートカット）
- [x] 基本機能: ト音/ヘ音記号切替、調号プリセット、拍子記号・テンポ、小節追加/削除、基本音価（全〜16分・付点・3連符）、臨時記号（♯/♭/♮）
- [x] `ScoreRepository` 抽象化と `LocalStorageScoreRepository` によるローカル自動保存
- [x] Tailscale 経由（`tailscale serve`）でのローカル開発・実機確認環境対応（`vite.config.ts` の `host: '127.0.0.1'`, `allowedHosts: ['.ts.net']`）

### Milestone 2: 複数五線・複数声部・コピペ・記譜拡充 — ✅ 完了
- [x] 複数五線の追加/削除、各五線内の複数声部（1st, 2nd...）の色分け表示＆非アクティブ半透明化
- [x] 小節選択・音符範囲選択、アクティブ声部へのコピペ、別声部へのワンタップ複製
- [x] タイ（小節またぎ含む）、スラー、強弱記号、反復記号、ヘッダー（曲名・作曲者）編集
- [x] モバイル向け下部ドックツールバー・音高上下微調整ボタン・ピンチズーム対応

### Milestone 3: プレビュー再生・MIDI入出力・PDF/SVG/PNG出力 — ✅ 完了
- [x] Web Audio API による軽量ピアノ風シンセ再生＋プレイヘッド表示＋声部ミュート/ソロ
- [x] `@tonejs/midi` を使ったMIDIインポート（確認ダイアログ付き）＆MIDIエクスポート
- [x] A4自動組版レンダラー＋`jsPDF + svg2pdf.js` によるベクターPDF出力、SVG/PNG出力（黒一色／カラー切替）

### Milestone 4: Supabase認証・クラウド同期・Cloudflare Pagesデプロイ — ✅ 実装完了（本番デプロイ設定待ち）
- [x] Supabaseプロジェクト連携（Google OAuthログイン、PostgreSQLスキーマ・RLS設定 `supabase/schema.sql`、`SupabaseScoreRepository`）
- [x] マイ譜面一覧画面（新規作成・複製・削除・検索・ローカル→クラウド取り込み）とデバウンス自動クラウド保存（ローカル／Tailscale実行時はLocalStorageへフォールバック）
- [x] Cloudflare Pages へのデプロイ設定（`public/_redirects`, `.env.example`, `docs/deploy-guide.md`）
- [ ] 実機（PC・スマホ）での本番デプロイ＆最終動作確認

---

## 開発ログ

| 日付 | 内容 |
| :--- | :--- |
| 2026-11-21 | 設計・実装計画書（`docs/design-plan.md`）作成 |
| 2026-11-21 | Milestone 1 実装完了（基盤構築・Tickコア・自動休符・VexFlowレンダラー・基本UI・単体テスト19件） |
| 2026-11-23 | Tailscale 経由のローカル開発アクセス対応（`vite.config.ts`）、開発運用ルール（`GEMINI.md` / `progress.md`）整備 |
| 2026-11-23 | Milestone 2 実装完了（複数五線・複数声部の色分け＆半透明描画、小節/音符範囲選択・コピペ・別声部ワンタップ複製、タイ/スラー/強弱/反復/ヘッダー編集、モバイル下部ドック＆ピンチズーム、単体テスト26件） |
| 2026-11-24 | Milestone 3 実装完了（Web Audio ピアノ風シンセ再生・プレイヘッド・声部ミュート/ソロ、`@tonejs/midi` によるMIDIインポート確認ダイアログ＆エクスポート、A4自動組版レンダラー＆jsPDF/svg2pdf.jsによるベクターPDF/SVG/PNG出力、単体テスト31件） |
| 2026-11-24 | PDF/PNG/SVG出力の音楽記号欠落・日本語文字化け修正（VexFlow Canvas バックエンドによる 3x 高精細 A4 レンダリングへ移行、SVG出力への Bravura `@font-face` 埋め込み） |
| 2026-11-24 | Milestone 4 実装完了（Supabase Google OAuth 認証＆`SupabaseScoreRepository`＆RLSスキーマ、マイ譜面一覧画面の新規作成/複製/削除/検索/ローカル譜面取り込み、デバウンス自動保存＆保存ステータス表示、Cloudflare Pages デプロイ設定＆ガイド整備、単体テスト38件） |
