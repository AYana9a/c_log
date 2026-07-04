import { parseLog, groupBySpeaker } from "./parser.js";
import { FUNCTIONS, FUNCTION_INFO, scoreFunctions, normalizeScores } from "./functions.js";
import { TYPE_STACKS, TYPE_INFO, matchTypes } from "./mbti.js";
import { drawRadar } from "./radar.js";
import { AI_MODELS, analyzeWithClaude } from "./ai.js";

const API_KEY_STORAGE_KEY = "mbti-log-analyzer:anthropic-api-key";

const els = {
  formatSelect: document.getElementById("format-select"),
  fileInput: document.getElementById("file-input"),
  logInput: document.getElementById("log-input"),
  parseBtn: document.getElementById("parse-btn"),
  parseStatus: document.getElementById("parse-status"),
  speakerSection: document.getElementById("speaker-section"),
  speakerList: document.getElementById("speaker-list"),
  modeRadios: document.querySelectorAll('input[name="analyze-mode"]'),
  aiOptions: document.getElementById("ai-options"),
  apiKeyInput: document.getElementById("api-key-input"),
  modelSelect: document.getElementById("model-select"),
  saveKeyCheckbox: document.getElementById("save-key-checkbox"),
  analyzeBtn: document.getElementById("analyze-btn"),
  analyzeStatus: document.getElementById("analyze-status"),
  resultSection: document.getElementById("result-section"),
  resultModeNote: document.getElementById("result-mode-note"),
  radarChart: document.getElementById("radar-chart"),
  estimatedType: document.getElementById("estimated-type"),
  estimatedTypeName: document.getElementById("estimated-type-name"),
  stackDetail: document.getElementById("stack-detail"),
  candidateList: document.getElementById("candidate-list"),
  functionDetail: document.getElementById("function-detail"),
};

let speakerMap = new Map(); // speaker -> messages[]
let selectedSpeaker = null;

for (const model of AI_MODELS) {
  const opt = document.createElement("option");
  opt.value = model.id;
  opt.textContent = model.label;
  els.modelSelect.appendChild(opt);
}

const savedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
if (savedKey) {
  els.apiKeyInput.value = savedKey;
  els.saveKeyCheckbox.checked = true;
}

function currentMode() {
  return document.querySelector('input[name="analyze-mode"]:checked').value;
}

for (const radio of els.modeRadios) {
  radio.addEventListener("change", () => {
    els.aiOptions.classList.toggle("hidden", currentMode() !== "ai");
  });
}

els.saveKeyCheckbox.addEventListener("change", () => {
  if (!els.saveKeyCheckbox.checked) {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  } else if (els.apiKeyInput.value) {
    localStorage.setItem(API_KEY_STORAGE_KEY, els.apiKeyInput.value);
  }
});

els.apiKeyInput.addEventListener("input", () => {
  if (els.saveKeyCheckbox.checked) {
    localStorage.setItem(API_KEY_STORAGE_KEY, els.apiKeyInput.value);
  }
});

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

els.analyzeBtn.addEventListener("click", async () => {
  if (!selectedSpeaker) return;
  const messages = speakerMap.get(selectedSpeaker);
  const mode = currentMode();

  if (mode === "local") {
    const raw = scoreFunctions(messages);
    const normalized = normalizeScores(raw);
    const ranking = matchTypes(normalized);

    els.resultModeNote.textContent = "解析方式: ローカル解析(キーワード方式)";
    renderRadar(normalized);
    renderTypeResult(ranking, messages.length);
    renderFunctionDetail(normalized, null);

    els.resultSection.classList.remove("hidden");
    els.resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const apiKey = els.apiKeyInput.value.trim();
  if (!apiKey) {
    els.analyzeStatus.textContent = "Anthropic APIキーを入力してください。";
    return;
  }

  els.analyzeBtn.disabled = true;
  els.analyzeStatus.textContent = "Claudeに解析を依頼しています…(数秒〜数十秒かかります)";

  try {
    const result = await analyzeWithClaude({
      apiKey,
      model: els.modelSelect.value,
      speakerName: selectedSpeaker,
      messages,
    });
    const ranking = matchTypes(result.scores);

    els.resultModeNote.textContent = result.sampled
      ? `解析方式: AI解析(Claude API) — メッセージ数が多いため${result.totalSize}件中${result.sampleSize}件を時系列で均等サンプリングして分析しました。`
      : "解析方式: AI解析(Claude API)";
    renderRadar(result.scores);
    renderTypeResult(ranking, messages.length);
    renderFunctionDetail(result.scores, result.reasoning);

    els.resultSection.classList.remove("hidden");
    els.resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
    els.analyzeStatus.textContent = "";
  } catch (e) {
    els.analyzeStatus.textContent = e.message || "解析中にエラーが発生しました。";
  } finally {
    els.analyzeBtn.disabled = false;
  }
});

function renderRadar(normalized) {
  const labels = FUNCTIONS;
  const values = labels.map((f) => normalized[f]);
  drawRadar(els.radarChart, labels, values);
}

function renderTypeResult(ranking, msgCount) {
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

function renderFunctionDetail(normalized, reasoning) {
  els.functionDetail.innerHTML = "";
  const sorted = [...FUNCTIONS].sort((a, b) => normalized[b] - normalized[a]);
  for (const fn of sorted) {
    const info = FUNCTION_INFO[fn];
    const value = Math.round(normalized[fn]);
    const div = document.createElement("div");
    div.className = "function-card";
    const reasonHtml =
      reasoning && reasoning[fn] ? `<div class="fai-reason">${escapeHtml(reasoning[fn])}</div>` : "";
    div.innerHTML = `
      <div class="fname"><span>${info.name}</span><span>${value}</span></div>
      <div class="fshort">${info.short}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${value}%"></div></div>
      <div class="fdesc">${info.desc}</div>
      ${reasonHtml}
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
