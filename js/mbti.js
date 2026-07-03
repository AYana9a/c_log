// 16タイプの機能スタック(主機能・補助機能・第三機能・劣勢機能)
// 出典: ユング/マイヤーズ=ブリッグスの認知機能理論における標準的なスタック定義

export const TYPE_STACKS = {
  INTJ: ["Ni", "Te", "Fi", "Se"],
  INTP: ["Ti", "Ne", "Si", "Fe"],
  ENTJ: ["Te", "Ni", "Se", "Fi"],
  ENTP: ["Ne", "Ti", "Fe", "Si"],
  INFJ: ["Ni", "Fe", "Ti", "Se"],
  INFP: ["Fi", "Ne", "Si", "Te"],
  ENFJ: ["Fe", "Ni", "Se", "Ti"],
  ENFP: ["Ne", "Fi", "Te", "Si"],
  ISTJ: ["Si", "Te", "Fi", "Ne"],
  ISFJ: ["Si", "Fe", "Ti", "Ne"],
  ESTJ: ["Te", "Si", "Ne", "Fi"],
  ESFJ: ["Fe", "Si", "Ne", "Ti"],
  ISTP: ["Ti", "Se", "Ni", "Fe"],
  ISFP: ["Fi", "Se", "Ni", "Te"],
  ESTP: ["Se", "Ti", "Fe", "Ni"],
  ESFP: ["Se", "Fi", "Te", "Ni"],
};

// スタック内の位置(主/補助/第三/劣勢)に応じた重み
const POSITION_WEIGHTS = [4, 3, 2, 1];

export const TYPE_INFO = {
  INTJ: "建築家",
  INTP: "論理学者",
  ENTJ: "指揮官",
  ENTP: "討論者",
  INFJ: "提唱者",
  INFP: "仲介者",
  ENFJ: "主人公",
  ENFP: "広報運動家",
  ISTJ: "管理者",
  ISFJ: "擁護者",
  ESTJ: "幹部",
  ESFJ: "領事",
  ISTP: "巨匠",
  ISFP: "冒険家",
  ESTP: "起業家",
  ESFP: "エンターテイナー",
};

/**
 * 正規化済みの8機能スコアから、各タイプとの適合度を計算する。
 * 適合度 = Σ( ユーザーのスコア[機能] × スタック内の重み ) を
 * その型のスタックに含まれる4機能について合計し、割合(%)に変換したもの。
 * @param {Record<string, number>} normalizedScores
 * @returns {{type: string, score: number, percent: number}[]} スコア降順の配列
 */
export function matchTypes(normalizedScores) {
  const raw = Object.entries(TYPE_STACKS).map(([type, stack]) => {
    let score = 0;
    stack.forEach((fn, idx) => {
      score += normalizedScores[fn] * POSITION_WEIGHTS[idx];
    });
    return { type, score };
  });

  const total = raw.reduce((sum, r) => sum + r.score, 0) || 1;
  const withPercent = raw.map((r) => ({
    ...r,
    percent: (r.score / total) * 100,
  }));

  withPercent.sort((a, b) => b.score - a.score);
  return withPercent;
}
