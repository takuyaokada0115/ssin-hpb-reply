// SSIN STUDIO下北沢 — スタッフ個別 日報 自動生成 Netlify Function
// サロンボードの予約表（スクリーンショット／テキスト）を読み取り、スタッフごとの予約一覧を返します。
// APIキーはサーバー側の環境変数 ANTHROPIC_API_KEY にのみ置き、ブラウザには一切露出させません。

const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic(); // ANTHROPIC_API_KEY を環境変数から読み込む

const MAX_IMAGES = 4;

const SYSTEM = `あなたは美容サロン「SSIN STUDIO下北沢」（まつ毛パーマ／ラッシュリフト・眉毛ワックスなどのアイ＆眉サロン）の予約管理を担当するスタッフです。
サロンボード（ホットペッパービューティーの店舗管理画面）の予約表を読み取り、スタッフごとの「その日の予約状況」を整理します。

【入力】サロンボードの予約表（スクリーンショット画像、またはコピーしたテキスト）。1日分の予約が、担当スタッフ別に並んでいます。
【出力】日付と、スタッフごとの予約リスト（開始時刻・お客様名・メニュー）。

■ 日付
- 予約表に表示されている日付を「9/6」のように「月/日」形式で返す。年は含めない。
- 利用者から日付が指定されている場合は、必ずその日付を使う。
- どこにも日付が見当たらない場合は空文字にする。

■ スタッフ
- 予約表に列や見出しとして現れる担当スタッフを、表示されている順にすべて挙げる。
- 予約が1件も入っていないスタッフも、reservations を空配列にして必ず含める。
- スタッフ名は予約表の表記のまま（例：「ミサキ」「Yuka」）。姓名がある場合もそのまま。

■ 予約
- time: 予約の開始時刻を24時間表記の「10:00」「16:15」形式で。終了時刻や所要時間は含めない。
- customer: お客様のお名前。カタカナ表記が読み取れる場合はカタカナで、姓と名の間にスペースを入れずに続けて書く（例：「サクライキョウコ」）。予約表が漢字表記の場合は、読みが確実でない限り推測せず、表示されている表記のままにする。「様」は付けない。
- 各スタッフの予約は開始時刻の早い順に並べる。
- 同じお客様の連続した枠が1件の予約として表示されている場合は、1件としてまとめる。

■ メニューの短縮表記（重要）
予約表のメニュー名は長いことが多いため、次の短縮表記に統一する。
- まつ毛パーマ／まつげパーマ／ラッシュリフト／パリジェンヌラッシュリフト → 「まつぱ」
- 眉毛ワックス／眉WAX／アイブロウワックス／眉スタイリング → 「眉ワックス」
- 眉毛パーマ／アイブロウラミネーション → 「眉パーマ」
- うなじシェービング／うなじ脱毛 → 「うなじ」
- まつ毛エクステ／マツエク → 「まつエク」
- 上記に当てはまらないメニューは、10文字以内で簡潔に要約する。
1件の予約に複数メニューが含まれる場合は、短縮表記を区切り文字なしで連結する。順序は「眉 → まつげ → その他」（例：「眉ワックスまつぱ」「眉ワックスうなじ」「眉パーマまつぱ」）。
オプション（トリートメント、コーティング等）は、メニュー名が長くなりすぎる場合は省略してよい。

■ 読み取りの原則
- 推測で埋めない。読み取れない項目は空文字にする。
- 画像が不鮮明で読み取りに自信がない箇所、判断に迷った箇所は notes に日本語で簡潔に書く（例：「11:00の枠のお客様名が不鮮明です」）。確認事項がなければ notes は空配列にする。
- キャンセル・ブロック枠・休憩・研修など、お客様の予約ではないものは含めない。`;

const SCHEMA = {
  type: "object",
  properties: {
    date: {
      type: "string",
      description: "予約表の日付。「9/6」形式。読み取れない場合は空文字。",
    },
    staff: {
      type: "array",
      description: "予約表に登場する担当スタッフ（予約0件のスタッフも含む）。",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "スタッフ名。" },
          reservations: {
            type: "array",
            description: "そのスタッフの予約。開始時刻の早い順。",
            items: {
              type: "object",
              properties: {
                time: { type: "string", description: "開始時刻。「10:00」形式。" },
                customer: {
                  type: "string",
                  description: "お客様名。「様」は付けない。読み取れない場合は空文字。",
                },
                menu: { type: "string", description: "短縮表記のメニュー名。" },
              },
              required: ["time", "customer", "menu"],
              additionalProperties: false,
            },
          },
        },
        required: ["name", "reservations"],
        additionalProperties: false,
      },
    },
    notes: {
      type: "array",
      description: "読み取りに自信がない箇所や確認事項。なければ空配列。",
      items: { type: "string" },
    },
  },
  required: ["date", "staff", "notes"],
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

  const { text, images, date } = payload;
  const hasText = typeof text === "string" && text.trim().length > 0;
  const imageList = Array.isArray(images)
    ? images
        .filter((img) => img && typeof img.data === "string" && img.data.length > 0)
        .slice(0, MAX_IMAGES)
    : [];

  if (!hasText && imageList.length === 0) {
    return json(400, {
      error: "予約表のスクリーンショットかテキストのどちらかを入力してください。",
    });
  }

  const content = imageList.map((img) => ({
    type: "image",
    source: {
      type: "base64",
      media_type: img.media_type || "image/jpeg",
      data: img.data,
    },
  }));

  const instructions = [];
  if (imageList.length > 0) {
    instructions.push(
      imageList.length === 1
        ? "添付画像はサロンボードの予約表です。画像から日付・担当スタッフ・予約を読み取ってください。"
        : `添付の${imageList.length}枚の画像は、同じ日のサロンボードの予約表です（複数枚に分かれています）。すべての画像をあわせて、日付・担当スタッフ・予約を読み取ってください。`
    );
  }
  if (hasText) {
    instructions.push(
      `以下はサロンボードの予約表のテキストです。\n\n---\n${text.trim()}\n---`
    );
  }
  if (typeof date === "string" && date.trim()) {
    instructions.push(`この予約表の日付は「${date.trim()}」です。date にはこの日付を使ってください。`);
  }
  content.push({ type: "text", text: instructions.join("\n\n") });

  try {
    const resp = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 8000,
      system: SYSTEM,
      messages: [{ role: "user", content }],
      // 読み取り中心の作業のため effort は low。取りこぼしが目立つ場合は
      // "medium" / "high" に上げてください（精度は上がり、生成時間は延びます）。
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: SCHEMA },
      },
    });

    if (resp.stop_reason === "refusal") {
      return json(422, {
        error: "この内容は読み取れませんでした。入力内容をご確認ください。",
      });
    }

    const textBlock = resp.content.find((b) => b.type === "text");
    if (!textBlock) {
      return json(502, { error: "日報を取得できませんでした。もう一度お試しください。" });
    }

    return json(200, JSON.parse(textBlock.text));
  } catch (err) {
    console.error("daily-report error:", err);
    return json(500, {
      error: "生成に失敗しました。時間をおいて再度お試しください。",
    });
  }
};
