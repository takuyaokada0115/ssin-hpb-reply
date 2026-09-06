# SSIN STUDIO下北沢 — 店舗業務ツール

サロンの日常業務をClaudeで自動化する、2つのツールをまとめたNetlifyサイトです。
APIキーはNetlify Functions（サーバー側）にのみ保存し、ブラウザには露出しません。

| ツール | 画面 | 用途 |
|--------|------|------|
| HPB口コミ返信 自動生成 | `index.html` | 口コミを貼り付けると、熱量に合わせた返信コメントを作成 |
| スタッフ日報 自動生成 | `daily-report.html` | サロンボードの予約表から、スタッフごとの日報を作成 |

## ① HPB口コミ返信 自動生成ツール（`index.html`）

ホットペッパービューティー（HPB）の口コミを貼り付けると、投稿者のニックネームに対して、
口コミの熱量・感情に合わせた「お店からの返信コメント」を自動生成します。
スタッフは生成された文章をコピーして、HPBの返信欄に貼り付けるだけで完了します。

- 入力：口コミのテキスト貼り付け、またはスクリーンショット画像（ペースト／ドロップ／選択）
- 生成：Claude（Opus 4.8）が口コミを読み取り、熱量に応じてお礼／お詫びの返信を作成

## ② スタッフ日報 自動生成ツール（`daily-report.html`）

サロンボードの予約表（1日分）を貼り付けると、担当スタッフごとに分けた日報を作成します。
スタッフ本人へそのまま共有できる形になっているので、コピーしてLINE等に貼り付けるだけです。

- 入力：予約表のスクリーンショット（最大4枚／ペースト・ドロップ・選択）またはテキスト貼り付け
- 日付：空欄なら予約表から自動で読み取り。指定した場合はその日付を使用
- 出力：スタッフごとに以下の形式。文面はその場で編集してからコピーできます

```
ミサキ
9/6
10:00 サクライキョウコ様　まつぱ
11:00 ニシナアカリ様　眉ワックスまつぱ
12:30 タハラハルカ様　眉ワックス
```

- メニュー名は短縮表記に統一します（まつ毛パーマ→「まつぱ」、眉毛ワックス→「眉ワックス」、
  眉毛パーマ→「眉パーマ」、うなじシェービング→「うなじ」）。複数メニューは
  「眉ワックスまつぱ」のように連結します。
- 予約が0件のスタッフは「予約なし」と表示します。
- 読み取りに自信がない箇所は「確認をおすすめする箇所」としてまとめて表示されるので、
  送信前にその部分だけ確認してください。

### 読み取り精度・生成時間の調整

`netlify/functions/daily-report.js` の `output_config.effort` は `"low"`（速度優先）です。
名前やメニューの取りこぼしが目立つ場合は `"medium"` / `"high"` に上げてください（精度は上がり、生成時間は延びます）。

なお、Netlify Functionsには実行時間の上限（標準10秒）があります。予約表が大きく
タイムアウトする場合は、スクリーンショットをスタッフ数名ずつに分けて実行してください。

## 構成

```
index.html                        … 口コミ返信ツールの画面（静的・自己完結）
daily-report.html                 … スタッフ日報ツールの画面（静的・自己完結）
netlify/functions/generate.js     … 口コミ返信を生成する関数
netlify/functions/daily-report.js … 予約表を読み取り日報データを返す関数
netlify.toml                      … Netlify設定
package.json                      … 依存（@anthropic-ai/sdk）
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
口コミ返信は1件あたりおおよそ数円程度（Opus 4.8・画像あり時）。
日報は1日分（画像1〜4枚）でおおよそ十数円程度（Opus 5）。
コストを抑えたい場合は、各関数の `model` を
`claude-haiku-4-5`（安価・高速）や `claude-sonnet-5`（中間）に変更できます。
