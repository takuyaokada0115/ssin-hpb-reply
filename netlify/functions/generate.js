// SSIN STUDIO下北沢 — HPB口コミ返信 自動生成 Netlify Function
// APIキーはサーバー側の環境変数 ANTHROPIC_API_KEY にのみ置き、ブラウザには一切露出させません。

const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic(); // ANTHROPIC_API_KEY を環境変数から読み込む

const SYSTEM = `あなたは美容サロン「SSIN STUDIO下北沢」（まつ毛パーマ／ラッシュリフト・眉毛ワックスなどのアイ＆眉サロン）の店舗スタッフです。
ホットペッパービューティー（HPB）に投稿されたお客様の口コミを読み、その口コミへの「お店からの返信コメント」を作成します。

【入力】お客様の口コミ（テキスト、またはHPB画面のスクリーンショット画像）。
【出力】そのままHPBの返信欄に貼り付けられる、自然で心のこもった日本語の返信文。

■ ニックネームの扱い
- 口コミ投稿者のニックネーム（例：「〇〇さん」「ゲスト」など）を読み取り、返信の冒頭で「〇〇様」と自然に呼びかける。
- 画像やテキストから明確なニックネームが読み取れない場合は nickname を "" とし、返信は「この度はご来店いただき〜」のように名前を使わず自然に書き出す。

■ 熱量・感情に合わせたトーン調整（最重要）
- とても満足していて、接客・担当スタッフの技術・仕上がりなどを強く賞賛している口コミには、同じくらいの熱量で、具体的に何を褒めてくれたか（メニュー・担当者・仕上がり・雰囲気など）に触れながら、心からの感謝を伝える。
- 満足度が控えめ・淡々とした口コミには、丁寧で温かいが過剰にならない、落ち着いた感謝を伝える。
- 不満・お叱りの口コミには、言い訳や防御をせず、真摯にお詫びし、具体的な点に触れて改善の意志を示し、また機会があればという気持ちを添える。
- 良い点と不満点が混在する口コミには、良い点への感謝と不満点へのお詫びを両方バランスよく含める。

■ 文体・品質
- サロンスタッフとして自然で人間味のある日本語。丁寧語（です・ます）。定型文っぽさ・機械的な印象を避ける。
- 口コミ本文の具体的な内容（受けたメニュー、担当スタッフ、仕上がり、雰囲気など）に触れ、その人だけへの返信に感じられるようにする。
- 絵文字は使わないか、使っても最小限（多くても1つ程度）。
- 長さの目安は100〜250文字程度。長すぎず、心がこもった分量に。
- 返信文は必ずそのまま貼り付けられる完成形で出力する（説明・注釈・前置きを含めない）。

■ 判定情報
- sentiment: 全体の評価を positive（満足・好意的）/ mixed（賛否混在）/ negative（不満・お叱り）/ unknown（判断不能）から選ぶ。
- enthusiasm: 口コミの熱量を1〜5の整数で表す（1=淡々／控えめ、5=非常に熱量が高く強い賞賛）。返信の熱量もこの値に合わせる。`;

const SCHEMA = {
  type: "object",
  properties: {
    nickname: {
      type: "string",
      description: "口コミ投稿者のニックネーム。読み取れない場合は空文字。",
    },
    sentiment: {
      type: "string",
      enum: ["positive", "mixed", "negative", "unknown"],
    },
    enthusiasm: {
      type: "integer",
      enum: [1, 2, 3, 4, 5],
    },
    reply: {
      type: "string",
      description: "HPB返信欄に貼り付ける完成した返信文。",
    },
  },
  required: ["nickname", "sentiment", "enthusiasm", "reply"],
  additionalProperties: false,
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method Not Allowed" });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "リクエストの形式が正しくありません。" });
  }

  const { text, image } = payload;
  const hasText = typeof text === "string" && text.trim().length > 0;
  const hasImage = image && typeof image.data === "string" && image.data.length > 0;

  if (!hasText && !hasImage) {
    return json(400, { error: "口コミのテキストか画像のどちらかを入力してください。" });
  }

  const content = [];
  if (hasImage) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: image.media_type || "image/png",
        data: image.data,
      },
    });
  }
  content.push({
    type: "text",
    text: hasText
      ? `以下がお客様の口コミです。この口コミへの返信文を作成してください。\n\n---\n${text.trim()}\n---`
      : "添付画像はHPBの口コミ画面です。画像内の口コミ本文とニックネームを読み取り、その口コミへの返信文を作成してください。",
  });

  try {
    const resp = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{ role: "user", content }],
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
    });

    if (resp.stop_reason === "refusal") {
      return json(422, {
        error: "この内容は生成できませんでした。口コミの内容をご確認ください。",
      });
    }

    const textBlock = resp.content.find((b) => b.type === "text");
    if (!textBlock) {
      return json(502, { error: "返信文を取得できませんでした。もう一度お試しください。" });
    }

    const data = JSON.parse(textBlock.text);
    return json(200, data);
  } catch (err) {
    console.error("generate error:", err);
    return json(500, {
      error: "生成に失敗しました。時間をおいて再度お試しください。",
    });
  }
};
