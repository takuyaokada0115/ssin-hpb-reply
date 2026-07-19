# SSIN STUDIO下北沢 — HPB口コミ返信 自動生成ツール

ホットペッパービューティー（HPB）の口コミを貼り付けると、投稿者のニックネームに対して、
口コミの熱量・感情に合わせた「お店からの返信コメント」を自動生成するツールです。
スタッフは生成された文章をコピーして、HPBの返信欄に貼り付けるだけで完了します。

- 入力：口コミのテキスト貼り付け、またはスクリーンショット画像（ペースト／ドロップ／選択）
- 生成：Claude（Opus 4.8）が口コミを読み取り、熱量に応じてお礼／お詫びの返信を作成
- APIキーはNetlify Functions（サーバー側）にのみ保存し、ブラウザには露出しません

## 構成

```
index.html                     … スタッフが使う画面（静的・自己完結）
netlify/functions/generate.js  … Claude APIを呼び出す関数（APIキーはここだけ）
netlify.toml                   … Netlify設定
package.json                   … 依存（@anthropic-ai/sdk）
```

## デプロイ手順（Netlify）

### 1. Anthropic APIキーを用意
[console.anthropic.com](https://console.anthropic.com) でAPIキー（`sk-ant-...`）を発行しておく。

### 2. Netlifyへデプロイ
どちらか片方でOK。

**A. Netlify CLIで公開**
```bash
cd ssin-hpb-reply
npm install
npx netlify deploy --prod
```

**B. GitHubリポジトリ連携**
1. このフォルダをGitHubリポジトリにpush
2. Netlifyの「Add new site」→「Import from Git」で連携
3. Publish directory は `.`、Functions は自動認識

### 3. 環境変数にAPIキーを設定（重要）
Netlifyのサイト設定 → **Site configuration → Environment variables** で以下を追加：

| Key | Value |
|-----|-------|
| `ANTHROPIC_API_KEY` | `sk-ant-...`（発行したキー） |

設定後、再デプロイすると反映されます。

## ローカルで動作確認

```bash
cd ssin-hpb-reply
npm install
export ANTHROPIC_API_KEY=sk-ant-...
npx netlify dev
```
表示されたローカルURLを開くと、関数込みで動作確認できます。
（`index.html`を直接ブラウザで開くと、関数が動かないため生成はできません）

## コストについて
1返信あたりおおよそ数円程度（Opus 4.8・画像あり時）。
コストを抑えたい場合は `netlify/functions/generate.js` の `model` を
`claude-haiku-4-5`（安価・高速）や `claude-sonnet-5`（中間）に変更できます。
