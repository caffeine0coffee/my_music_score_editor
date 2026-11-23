# プロジェクト開発ガイドライン (GEMINI.md)

このリポジトリ（`my_music_score_editor`）で開発を進める際の基本ルールと方針。

## 参照ドキュメント
- 設計・アーキテクチャ・ロードマップ: [docs/design-plan.md](./docs/design-plan.md)
- 開発進捗: [progress.md](./progress.md)

## 実装タスク完了時の必須ルール
機能実装や修正タスクを完了させるたびに、以下を必ず実施すること。

1. **ビルド・テスト検証**
   - `npm run build`（型チェック＋本番ビルド）および `npm test`（単体テスト）を実行し、エラーがないことを確認する。
2. **進捗の記録（`progress.md` の更新）**
   - `progress.md` のチェックリストを更新し、「開発ログ」テーブルに日付と実装内容を追記する。
3. **Git コミットによる記録**
   - タスク単位で変更を整理し、わかりやすいコミットメッセージで `git commit` を実行する（`progress.md` の更新もあわせてコミットする）。

## アーキテクチャ・実行環境の両立方針
- **ローカル／Tailscale 実行とクラウド本番の両立**:
  - `vite.config.ts` の `server` 設定（`host: '127.0.0.1'`, `allowedHosts: ['.ts.net']`）はローカル／Tailscale 経由の動作確認用として維持する。
  - データ永続化は `ScoreRepository` インターフェース経由とし、環境変数未設定時（ローカル／Tailscale テスト時）でも `LocalStorageScoreRepository` で単体動作できるようにする。
