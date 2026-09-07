# CUTLINE v12.2 — Cloudflare安全版（GitHub対応）

この版は **Cloudflare Workers を推奨**しつつ、Cloudflare Pages の「Build output directory」画面でもビルドできるようにしたハイブリッド構成です。

## 推奨：Cloudflare Workers Builds

Cloudflareで `Workers & Pages` → `Create application` → **Import a repository** からGitHubリポジトリを接続してください。

- Worker name: `cutline-mma`
- Production branch: `main`
- Build command: 空欄でOK
- Deploy command: `npx wrangler deploy`
- Root directory: 空欄

`wrangler.jsonc` の custom build が `npm run build` を実行します。
D1は `DB` binding をIDなしで定義してあり、対応するWranglerでは初回デプロイ時に自動プロビジョニングされます。

> 注意：Workers Buildsの設定画面には通常「Build output directory」はありません。もしその入力欄が出ている場合は Pages の作成画面です。

## 今の画面が Cloudflare Pages の場合

Pagesでもこの版はビルドできます。

- Framework preset: Vite（または None）
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: 空欄

Pagesでは `dist/_worker.js` がAPIを処理します。ただしD1はPages側で `DB` という名前のBindingを追加してください。

## GitHubへアップロードする方法

ZIPを解凍して、**中のファイル全部をリポジトリ直下**へアップロードしてください。
フォルダを新しく作る必要はありません。

## パスワード再設定メール

必要になったらCloudflareのVariables / Secretsに追加します。

- `RESEND_API_KEY`（Secret）
- `PASSWORD_RESET_FROM`
- `PASSWORD_RESET_BASE_URL`（独自ドメイン利用時）

これらが未設定でも通常のビルド・ログイン機能のデプロイ自体はできます。パスワード再設定メールだけが使えません。

## ローカル確認コマンド

依存関係を入れた後に次を実行できます。

```bash
npm install
npm run check
```

`npm run check` は TypeScript確認 → Viteビルド → Pages用Workerビルド → smoke test の順に実行します。
