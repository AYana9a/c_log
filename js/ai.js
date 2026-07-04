// Claude APIを使った意味理解ベースの心理機能分析。
//
// キーワード頻度方式(functions.js の scoreFunctions)は、口語のフィラーや
// 会話の話題・テンポといった「個人の性格以外の要因」に強く引っ張られ、
// 同一人物でも話し相手が変わると結果が大きく変わってしまう問題があった。
// LLMは文脈・意味を理解した上で判断できるため、話し相手ごとの語彙頻度の
// 偏りに引きずられにくく、「一般的な行動パターンとしての絶対評価」を
// 直接指示することでこの問題を軽減できる。
//
// 送信するのは選択した話者本人のメッセージのみ。API呼び出しはブラウザから
// 直接 Anthropic のエンドポイントへ行われ(BYOK: ユーザー自身のAPIキー)、
// このアプリのサーバーというもの自体が存在しないため、キー・ログの内容は
// このアプリの開発者を含め誰にも経由しない。

import { FUNCTIONS, FUNCTION_INFO } from "./functions.js";

export const AI_MODELS = [
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5(高速・低コスト)" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5(高精度)" },
];

const MAX_INPUT_CHARS = 60000; // 概ね2万トークン前後を目安にした上限

/**
 * メッセージ数が多い場合、時系列全体から均等にサンプリングして
 * 文字数上限に収める。直近だけに偏らないよう、関係全体の傾向を反映する。
 * @param {string[]} messages
 * @param {number} maxChars
 * @returns {{ sample: string[], sampled: boolean }}
 */
export function sampleMessages(messages, maxChars = MAX_INPUT_CHARS) {
  const totalChars = messages.reduce((sum, m) => sum + m.length + 1, 0);
  if (totalChars <= maxChars) {
    return { sample: messages, sampled: false };
  }

  // 均等間隔で間引きながら、文字数上限に達するまで採用する
  const picked = [];
  let used = 0;
  const n = messages.length;
  // 間引きの目標件数を大まかに見積もる(平均文字数から逆算)
  const avgLen = totalChars / n;
  const targetCount = Math.max(1, Math.floor(maxChars / (avgLen + 1)));
  const step = n / targetCount;
  for (let i = 0; i < n && used < maxChars; i += step) {
    const msg = messages[Math.floor(i)];
    if (used + msg.length + 1 > maxChars) break;
    picked.push(msg);
    used += msg.length + 1;
  }
  return { sample: picked, sampled: true };
}

function buildFunctionDefinitionsText() {
  return FUNCTIONS.map((fn) => `- ${fn}(${FUNCTION_INFO[fn].name}): ${FUNCTION_INFO[fn].desc}`).join("\n");
}

/**
 * Claude API に送るプロンプトを組み立てる。
 * @param {string} speakerName
 * @param {string[]} messages 分析対象話者本人の発言のみ(相手の発言は含めない)
 */
export function buildPrompt(speakerName, messages) {
  const transcript = messages.map((m) => `・${m.replace(/\n/g, " ")}`).join("\n");
  return `あなたはユング心理学/MBTIの心理機能(認知機能)理論に詳しい分析者です。
以下の8つの心理機能の定義に基づいて、特定の人物の発言だけを読み、各機能について
0〜100のスコアを付けてください。

【重要】これは1対1の会話から抜き出した、話者「${speakerName}」本人の発言のみです。
評価は「この会話の相手と比べてどうか」ではなく、一般的な人間の行動パターンとして
「この人がどれだけその心理機能を発揮する言動を見せているか」という絶対評価で
行ってください。相手の発言や会話の話題・ノリに引きずられた評価をしないよう
注意してください。

【心理機能の定義】
${buildFunctionDefinitionsText()}

【${speakerName}の発言(抜粋、時系列順)】
${transcript}

次のJSON形式のみを出力してください。前後に説明文や\`\`\`のようなコードフェンスは付けないでください。
{
  "scores": { "Ne": 数値, "Ni": 数値, "Se": 数値, "Si": 数値, "Te": 数値, "Ti": 数値, "Fe": 数値, "Fi": 数値 },
  "reasoning": { "Ne": "一言理由", "Ni": "一言理由", "Se": "一言理由", "Si": "一言理由", "Te": "一言理由", "Ti": "一言理由", "Fe": "一言理由", "Fi": "一言理由" }
}`;
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("応答にJSONが含まれていません");
  return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * Claude API を呼び出し、8機能のスコアと理由を取得する。
 * @param {{ apiKey: string, model: string, speakerName: string, messages: string[] }} params
 */
export async function analyzeWithClaude({ apiKey, model, speakerName, messages }) {
  const { sample, sampled } = sampleMessages(messages);
  const prompt = buildPrompt(speakerName, sample);

  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (e) {
    throw new Error("Claude APIに接続できませんでした。ネットワーク環境やAPIキーをご確認ください。");
  }

  if (!res.ok) {
    if (res.status === 401) throw new Error("APIキーが無効です。正しいAnthropic APIキーを入力してください。");
    if (res.status === 429) throw new Error("APIのレート制限に達しました。しばらく待ってから再試行してください。");
    const body = await res.text().catch(() => "");
    throw new Error(`Claude APIがエラーを返しました(HTTP ${res.status})。${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = (data.content || []).map((block) => block.text || "").join("");
  let parsed;
  try {
    parsed = extractJson(text);
  } catch (e) {
    throw new Error("Claudeの応答を解析できませんでした。もう一度お試しください。");
  }

  const scores = {};
  for (const fn of FUNCTIONS) {
    const v = Number(parsed.scores && parsed.scores[fn]);
    scores[fn] = Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
  }
  const reasoning = {};
  for (const fn of FUNCTIONS) {
    reasoning[fn] = (parsed.reasoning && parsed.reasoning[fn]) || "";
  }

  return { scores, reasoning, sampled, sampleSize: sample.length, totalSize: messages.length };
}
