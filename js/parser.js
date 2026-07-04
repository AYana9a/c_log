// LINE / Discord のトーク履歴テキストを { speaker, text }[] にパースする

/**
 * LINEのトーク履歴書き出し形式をパースする。
 * 例:
 *   2023/01/01(日)
 *   10:23	Alice	こんにちは
 *   10:24	Bob	やあ元気?
 * 日付行やタブ区切り以外の行(スタンプ・写真通知や複数行メッセージの続き)も考慮する。
 */
function parseLine(text) {
  const lines = text.split(/\r\n|\r|\n/);
  // 名前欄は「メッセージの送信を取り消しました」等のシステム通知では空になるため [^\t]* で許容する
  const timeNamePattern = /^(\d{1,2}:\d{2})\t([^\t]*)\t(.*)$/;
  const dateHeaderPattern = /^\d{4}[./]\d{1,2}[./]\d{1,2}.*$/;
  const messages = [];
  let current = null;

  for (const line of lines) {
    if (dateHeaderPattern.test(line.trim())) {
      continue; // 日付ヘッダ行はスキップ
    }
    const m = line.match(timeNamePattern);
    if (m) {
      if (current) messages.push(current);
      const speaker = m[2].trim();
      // 名前が空 = メッセージ取消などのシステム通知行なので話者に紐付けない
      current = speaker ? { speaker, text: m[3] } : null;
    } else if (current && line.trim() !== "") {
      // 前のメッセージの続き(複数行メッセージ)
      current.text += "\n" + line;
    }
  }
  if (current) messages.push(current);
  return messages;
}

/**
 * DiscordChatExporter等でエクスポートしたプレーンテキスト形式をパースする。
 * 例:
 *   [2023/01/01 10:23 AM] Alice
 *   message text
 *
 *   [2023/01/01 10:24 AM] Bob
 *   message text
 */
function parseDiscord(text) {
  const lines = text.split(/\r\n|\r|\n/);
  const headerPattern = /^\[(\d{4}[/-]\d{1,2}[/-]\d{1,2}[^\]]*)\]\s+(.+)$/;
  const messages = [];
  let current = null;

  for (const line of lines) {
    const m = line.match(headerPattern);
    if (m) {
      if (current) messages.push(current);
      current = { speaker: m[2].trim(), text: "" };
    } else if (current) {
      if (line.trim() === "") continue;
      current.text += (current.text ? "\n" : "") + line;
    }
  }
  if (current) messages.push(current);
  return messages;
}

/**
 * "名前: メッセージ" / "名前：メッセージ" のような単純なコピペ形式のフォールバックパーサー。
 */
function parseGeneric(text) {
  const lines = text.split(/\r\n|\r|\n/);
  const namePattern = /^([^\s:：]{1,20})[:：]\s?(.*)$/;
  const messages = [];
  let current = null;

  for (const line of lines) {
    if (line.trim() === "") continue;
    const m = line.match(namePattern);
    if (m) {
      if (current) messages.push(current);
      current = { speaker: m[1].trim(), text: m[2] };
    } else if (current) {
      current.text += "\n" + line;
    }
  }
  if (current) messages.push(current);
  return messages;
}

/**
 * フォーマットを自動判定してパースする。
 * @param {string} text
 * @param {"auto"|"line"|"discord"|"generic"} format
 * @returns {{speaker: string, text: string}[]}
 */
export function parseLog(text, format = "auto") {
  if (format === "line") return parseLine(text);
  if (format === "discord") return parseDiscord(text);
  if (format === "generic") return parseGeneric(text);

  // auto: LINE/Discordは構文が厳密で誤検出しにくいため優先し、
  // どちらにも当てはまらない場合のみ汎用パーサー(「名前:メッセージ」)にフォールバックする。
  // 汎用パーサーは "19:15" のような時刻表記も「名前:本文」として誤認識してしまうため、
  // ヒット数だけで比較すると常に汎用パーサーが勝ってしまう問題があった。
  const lineResult = parseLine(text);
  const discordResult = parseDiscord(text);
  if (lineResult.length > 0 || discordResult.length > 0) {
    return lineResult.length >= discordResult.length ? lineResult : discordResult;
  }
  return parseGeneric(text);
}

/**
 * パース結果から話者ごとのメッセージ本文リストを作る。
 * @param {{speaker: string, text: string}[]} parsed
 */
export function groupBySpeaker(parsed) {
  const map = new Map();
  for (const { speaker, text } of parsed) {
    if (!text || !text.trim()) continue;
    if (!map.has(speaker)) map.set(speaker, []);
    map.get(speaker).push(text.trim());
  }
  return map;
}
