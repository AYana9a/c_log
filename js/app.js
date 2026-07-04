import { parseLog, groupBySpeaker } from "./parser.js";
import { FUNCTIONS, FUNCTION_INFO, scoreFunctions, normalizeScores } from "./functions.js";
import { TYPE_STACKS, TYPE_INFO, matchTypes } from "./mbti.js";
import { drawRadar } from "./radar.js";

const els = {
  formatSelect: document.getElementById("format-select"),
  fileInput: document.getElementById("file-input"),
  logInput: document.getElementById("log-input"),
  parseBtn: document.getElementById("parse-btn"),
  parseStatus: document.getElementById("parse-status"),
  speakerSection: document.getElementById("speaker-section"),
  speakerList: document.getElementById("speaker-list"),
  analyzeBtn: document.getElementById("analyze-btn"),
  resultSection: document.getElementById("result-section"),
  radarChart: document.getElementById("radar-chart"),
  estimatedType: document.getElementById("estimated-type"),
  estimatedTypeName: document.getElementById("estimated-type-name"),
  stackDetail: document.getElementById("stack-detail"),
  candidateList: document.getElementById("candidate-list"),
  functionDetail: document.getElementById("function-detail"),
};

let speakerMap = new Map(); // speaker -> messages[]
let selectedSpeaker = null;

// 巨大なログを貼り付けるとテキストエリアの内部スクロール量が数十万pxになり、
// カーソルが乗っているだけでページ全体のスクロールを吸い込んでしまう。
// 編集フォーカス中でない限りはホイール操作をページのスクロールへ流す。
els.logInput.addEventListener(
  "wheel",
  (e) => {
    if (document.activeElement !== els.logInput) {
      e.preventDefault();
      window.scrollBy(0, e.deltaY);
    }
  },
  { passive: false }
);

els.fileInput.addEventListener("change", async () => {
  const file = els.fileInput.files[0];
  if (!file) return;
  const text = await file.text();
  els.logInput.value = text;
});

els.parseBtn.addEventListener("click", () => {
  const text = els.logInput.value;
  if (!text.trim()) {
    els.parseStatus.textContent = "ログを入力してください。";
    return;
  }
  const format = els.formatSelect.value;
  const parsed = parseLog(text, format);
  speakerMap = groupBySpeaker(parsed);

  if (speakerMap.size === 0) {
    els.parseStatus.textContent =
      "話者を検出できませんでした。フォーマットを指定してみてください。";
    els.speakerSection.classList.add("hidden");
    return;
  }

  els.parseStatus.textContent = `${parsed.length}件のメッセージ、${speakerMap.size}人の話者を検出しました。`;
  renderSpeakerList();
  els.speakerSection.classList.remove("hidden");
  els.resultSection.classList.add("hidden");
});

function renderSpeakerList() {
  els.speakerList.innerHTML = "";
  selectedSpeaker = null;
  els.analyzeBtn.disabled = true;

  const sorted = [...speakerMap.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [speaker, messages] of sorted) {
    const item = document.createElement("label");
    item.className = "speaker-item";
    item.innerHTML = `
      <input type="radio" name="speaker" value="${escapeHtml(speaker)}" />
      <span>${escapeHtml(speaker)}</span>
      <span class="count">${messages.length}件</span>
    `;
    const radio = item.querySelector("input");
    radio.addEventListener("change", () => {
      selectedSpeaker = speaker;
      els.analyzeBtn.disabled = false;
    });
    els.speakerList.appendChild(item);
  }
}

els.analyzeBtn.addEventListener("click", () => {
  if (!selectedSpeaker) return;
  const messages = speakerMap.get(selectedSpeaker);
  const raw = scoreFunctions(messages);
  const normalized = normalizeScores(raw);
  const ranking = matchTypes(normalized);

  renderRadar(normalized);
  renderTypeResult(ranking, normalized, messages.length);
  renderFunctionDetail(normalized);

  els.resultSection.classList.remove("hidden");
  els.resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
});

function renderRadar(normalized) {
  const labels = FUNCTIONS;
  const values = labels.map((f) => normalized[f]);
  drawRadar(els.radarChart, labels, values);
}

function renderTypeResult(ranking, normalized, msgCount) {
  const top = ranking[0];
  els.estimatedType.textContent = top.type;
  els.estimatedTypeName.textContent = TYPE_INFO[top.type] ? `(${TYPE_INFO[top.type]}タイプ)` : "";

  const stack = TYPE_STACKS[top.type];
  const stackLabels = ["主機能", "補助機能", "第三機能", "劣勢機能"];
  els.stackDetail.innerHTML =
    `<strong>${top.type}</strong> の機能スタック: ` +
    stack.map((fn, i) => `${stackLabels[i]}=${fn}`).join(" / ") +
    `<br/>分析に使用したメッセージ数: ${msgCount}件`;

  els.candidateList.innerHTML = "";
  ranking.slice(0, 3).forEach((r) => {
    const li = document.createElement("li");
    li.textContent = `${r.type}(${TYPE_INFO[r.type]}) — 適合度 ${r.percent.toFixed(1)}%`;
    els.candidateList.appendChild(li);
  });
}

function renderFunctionDetail(normalized) {
  els.functionDetail.innerHTML = "";
  const sorted = [...FUNCTIONS].sort((a, b) => normalized[b] - normalized[a]);
  for (const fn of sorted) {
    const info = FUNCTION_INFO[fn];
    const value = normalized[fn];
    const div = document.createElement("div");
    div.className = "function-card";
    div.innerHTML = `
      <div class="fname"><span>${info.name}</span><span>${value}</span></div>
      <div class="fshort">${info.short}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${value}%"></div></div>
      <div class="fdesc">${info.desc}</div>
    `;
    els.functionDetail.appendChild(div);
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
