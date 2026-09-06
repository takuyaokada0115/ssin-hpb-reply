// SSIN STUDIO下北沢 — スタッフ個別 日報 自動生成 Netlify Function
// サロンボードの予約表（スクリーンショット／テキスト）を読み取り、スタッフごとの予約一覧を返します。
// APIキーはサーバー側の環境変数 ANTHROPIC_API_KEY にのみ置き、ブラウザには一切露出させません。

const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic(); // ANTHROPIC_API_KEY を環境変数から読み込む

const MAX_IMAGES = 4;

const SYSTEM = `あなたは美容サロン「SSIN STUDIO下北沢」（パリジェンヌ／まつ毛パーマ・眉毛ワックスなどのアイ＆眉サロン）の予約管理を担当するスタッフです。
サロンボード（ホットペッパービューティーの店舗管理画面）の予約表を読み取り、スタッフごとの「その日の予約状況」を整理します。

■ 対応する入力
次のいずれかの形式で渡されます。どの形式でも担当スタッフごとに予約を整理してください。
- 「予約一覧」画面：1行1予約の表。「来店日時」「ステータス」「お客様名（予約番号）」「スタッフ」「予約経路」「メニュー・店販割引・サービス・オプション」などの列がある。特定のスタッフで絞り込まれていることが多い。
- 「スケジュール」画面：時間帯×スタッフのタイムテーブル。列見出しがスタッフ名。
- CSV出力やコピーしたテキスト。
スマートフォンのスクリーンショットの場合、ブラウザのURLバー・タブ・時計などの画面要素は無視してください。

■ 日付
- 予約表の日付を「9/6」のように「月/日」形式で返す。年は含めない。
- 「来店日」の検索条件、「来店日時」列（「09/08」のような表記）などから読み取る。
- 利用者から日付が指定されている場合は、必ずその日付を使う。
- どこにも日付が見当たらない場合は空文字にする。

■ 含める予約・除外する予約（重要）
- ステータスが「受付待ち」「仮予約確定待ち」「施術中」「来店処理待ち」「済み」「会計済み」の予約は含める。
- ステータスが「お客様キャンセル」「サロンキャンセル」「無断キャンセル」「自動キャンセル」「お断り」の行は必ず除外する。
- 休憩・ブロック枠・研修など、お客様の予約ではないものは除外する。

■ スタッフ
- 「スタッフ」列、またはタイムテーブルの列見出しから担当スタッフを判定する。
- 1名分に絞り込まれた画面の場合は、そのスタッフ1名だけを返す。
- 予約が1件も残らないスタッフも、reservations を空配列にして含める。
- スタッフ名は表示されているとおり（例：「Itou」「ミサキ」）。

■ 予約
- time: 予約の開始時刻を24時間表記の「10:00」「16:15」形式で。「来店日時」列は「09/08」と「10:00」が上下に並ぶことがあるが、時刻部分だけを使う。終了時刻や所要時間は含めない。
- customer: お客様名。「様」は付けない。姓と名の間のスペースは詰める（「松山 奈央」→「松山奈央」）。
- 表記は予約表に表示されているまま。カタカナならカタカナ、漢字なら漢字。読みを推測して漢字をカタカナに変換してはいけない。
- お客様名が「外部」やハイフンのみで、実際の氏名が登録されていない予約は、customer を空文字にする。
- 各スタッフの予約は必ず開始時刻の早い順（昇順）に並べ替える。「予約一覧」画面は新しい順に並んでいることが多いので、並べ直すこと。

■ メニューの短縮表記（重要）
予約表のメニュー名は長いことが多いため、次の短縮表記に統一する。
- まつ毛パーマ／まつげパーマ／ラッシュリフト／パリジェンヌラッシュリフト → 「まつぱ」
- 眉毛ワックス／眉WAX／アイブロウワックス／眉スタイリング／眉毛の間引き・毛量調整 → 「眉ワックス」
- 眉毛パーマ／アイブロウラミネーション → 「眉パーマ」
- うなじシェービング／うなじ脱毛 → 「うなじ」
- まつ毛エクステ／マツエク → 「まつエク」
- 上記に当てはまらないメニューは、10文字以内で簡潔に要約する。
1件の予約に複数メニューが含まれる場合は、短縮表記を区切り文字なしで連結する。順序は「眉 → まつげ → その他」（例：「眉ワックスまつぱ」「眉ワックスうなじ」「眉パーマまつぱ」）。
「(クーポン)」「【人気No.1】」「【8月おすすめ】」などの装飾やキャンペーン名は落とし、施術内容だけを短縮表記にする。
オプション（トリートメント、コーティング等）は、メニュー名が長くなりすぎる場合は省略してよい。

■ メニューが読み取れない場合
- メニュー欄が「…」で途中までしか表示されていない場合は、読める範囲から施術内容を判断して短縮表記に当てはめる。どのメニューか確定できない場合は、読める範囲を10文字以内に切り詰めて menu に入れ、必ず notes に確認事項として書く。
- メニューが記載されていない予約（「-」など）で、予約経路が「外部」の場合は menu を「外部予約」とする。
- それ以外で読み取れない場合は menu を空文字にする。

■ 読み取りの原則
- 推測で埋めない。読み取れない項目は空文字にする。
- 次に当てはまる箇所は notes に日本語で簡潔に書く（例：「14:00の枠はメニュー名が途中で切れているため要確認です」）。確認事項がなければ notes は空配列にする。
  - 画像が不鮮明で読み取りに自信がない箇所
  - メニュー名が省略されていて施術内容を確定できない予約
  - お客様名が読み取れない、または登録されていない予約`;

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
      // 予約一覧は行数が多く、キャンセル行の除外と時刻の並べ替えが必要なため medium。
      // 速度を優先したい場合は "low"、取りこぼしが目立つ場合は "high" に変更できます。
      output_config: {
        effort: "medium",
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
