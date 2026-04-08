# AIチェッカーチェッカー

静的フロントエンド（GitHub Pages想定）の初版プロトタイプです。

## 使い方

1. `index.html` をブラウザで開く
2. OpenAI APIキーを入力して「保存」
3. 単文判定または比較判定を選択
4. 本文を入力して「判定実行」

## 補足

- APIキーは `sessionStorage` のみで保持し、`localStorage` には保存しません。
- 設定と履歴のみ `localStorage` に保存します。
- 履歴は最大50件です。
- `file://` 直開きでは環境により API 通信が失敗するため、`http(s)` で配信して開いてください（例: GitHub Pages / ローカルサーバー）。

## トラブルシュート（PRマージ時）

- GitHub のマージ画面で `<<<<<<<` / `=======` / `>>>>>>>` が表示される場合、それは実行時エラーではなく**マージコンフリクト**です。
- 今回の修正は `app.js` / `README.md` 側（Current change）を採用してください。
- 競合マーカーが残ったままマージされないよう、`.github/workflows/conflict-markers.yml` で自動検出しています。
