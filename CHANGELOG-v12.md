# CUTLINE v12 変更内容

- v11のUI・キャッチコピー「減量を1本の線に」を維持。
- Netlify React Start構成を、Cloudflare Pagesで安定しやすいVite + React SPAへ変更。
- Netlify FunctionsをCloudflare Pages Functionsへ移植。
- Netlify Database / PostgreSQL依存をCloudflare D1 / SQLiteへ移植。
- D1のテーブルを初回APIアクセス時に自動作成。
- CloudflareのD1 binding名を `DB` に統一。
- セッションCookie、ユーザー別データ分離、同一オリジンチェックを維持。
- パスワードはCloudflare Web CryptoのPBKDF2-SHA256でハッシュ化。
- パスワード再設定トークンはSHA-256ハッシュのみ保存。
- Resendによるパスワード再設定メールに対応。
- Cloudflare Pagesのbuild outputを `dist` に統一。
- Functions呼び出しを `/api/*` のみに限定する `_routes.json` を追加。
