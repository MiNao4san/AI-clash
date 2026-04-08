const MODELS = ["gpt-4o", "gpt-4o-mini"];
const MAX_TEXT_LENGTH = 3000;
const HISTORY_LIMIT = 50;
const STORAGE_KEYS = {
  settings: "aicc_settings",
  history: "aicc_history",
  apiKey: "aicc_session_api_key",
};

const BREAKDOWN_ITEMS = [
  { key: "humanization", label: "人間味の演出痕跡" },
  { key: "style_variation", label: "文体の意図的な揺らし" },
  { key: "specificity_padding", label: "具体性の足し込み痕跡" },
  { key: "verbosity", label: "冗長な言い換え・回りくどさ" },
  { key: "residual_ai_traits", label: "AIらしさの残存と隠し方の混在" },
  { key: "naturalness_mismatch", label: "全体自然さとの不整合" },
];

const DEFAULT_SETTINGS = {
  autoSaveHistory: true,
  defaultModel: "gpt-4o-mini",
  lastMode: "single",
};

const el = {
  modeSelect: document.getElementById("modeSelect"),
  modelSelect: document.getElementById("modelSelect"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  saveApiKeyBtn: document.getElementById("saveApiKeyBtn"),
  clearApiKeyBtn: document.getElementById("clearApiKeyBtn"),
  singleInputArea: document.getElementById("singleInputArea"),
  compareInputArea: document.getElementById("compareInputArea"),
  singleText: document.getElementById("singleText"),
  beforeText: document.getElementById("beforeText"),
  afterText: document.getElementById("afterText"),
  singleCount: document.getElementById("singleCount"),
  beforeCount: document.getElementById("beforeCount"),
  afterCount: document.getElementById("afterCount"),
  autoSaveHistoryCheckbox: document.getElementById("autoSaveHistoryCheckbox"),
  analyzeBtn: document.getElementById("analyzeBtn"),
  statusMessage: document.getElementById("statusMessage"),
  errorMessage: document.getElementById("errorMessage"),
  resultEmpty: document.getElementById("resultEmpty"),
  resultCard: document.getElementById("resultCard"),
  copyResultBtn: document.getElementById("copyResultBtn"),
  historyList: document.getElementById("historyList"),
  clearHistoryBtn: document.getElementById("clearHistoryBtn"),
  historyDetailSection: document.getElementById("historyDetailSection"),
  historyDetailCard: document.getElementById("historyDetailCard"),
  closeDetailBtn: document.getElementById("closeDetailBtn"),
};

let state = {
  settings: loadSettings(),
  history: loadHistory(),
  lastResult: null,
  lastResultAt: null,
  loading: false,
};

init();

function init() {
  renderModelOptions();
  el.modeSelect.value = state.settings.lastMode;
  el.modelSelect.value = state.settings.defaultModel;
  el.autoSaveHistoryCheckbox.checked = state.settings.autoSaveHistory;
  const savedApiKey = sessionStorage.getItem(STORAGE_KEYS.apiKey) || "";
  el.apiKeyInput.value = savedApiKey;

  bindEvents();
  updateModeUI();
  updateCountViews();
  renderHistoryList();
}

function bindEvents() {
  el.modeSelect.addEventListener("change", () => {
    state.settings.lastMode = el.modeSelect.value;
    saveSettings();
    updateModeUI();
  });

  el.modelSelect.addEventListener("change", () => {
    state.settings.defaultModel = el.modelSelect.value;
    saveSettings();
  });

  el.autoSaveHistoryCheckbox.addEventListener("change", () => {
    state.settings.autoSaveHistory = el.autoSaveHistoryCheckbox.checked;
    saveSettings();
  });

  [el.singleText, el.beforeText, el.afterText].forEach((textarea) => {
    textarea.addEventListener("input", updateCountViews);
  });

  el.saveApiKeyBtn.addEventListener("click", () => {
    const key = el.apiKeyInput.value.trim();
    if (!key) {
      showError("APIキーを入力してください");
      return;
    }
    sessionStorage.setItem(STORAGE_KEYS.apiKey, key);
    showStatus("APIキーをセッションに保存しました");
  });

  el.clearApiKeyBtn.addEventListener("click", () => {
    sessionStorage.removeItem(STORAGE_KEYS.apiKey);
    el.apiKeyInput.value = "";
    showStatus("APIキーを消去しました");
  });

  el.analyzeBtn.addEventListener("click", handleAnalyze);
  el.copyResultBtn.addEventListener("click", copyLastResult);
  el.clearHistoryBtn.addEventListener("click", clearHistoryAll);
  el.closeDetailBtn.addEventListener("click", () => {
    el.historyDetailSection.classList.add("hidden");
  });
}

function renderModelOptions() {
  el.modelSelect.innerHTML = "";
  MODELS.forEach((model) => {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    el.modelSelect.append(option);
  });
}

function updateModeUI() {
  const mode = el.modeSelect.value;
  const isSingle = mode === "single";
  el.singleInputArea.classList.toggle("hidden", !isSingle);
  el.compareInputArea.classList.toggle("hidden", isSingle);
}

function updateCountViews() {
  el.singleCount.textContent = el.singleText.value.length;
  el.beforeCount.textContent = el.beforeText.value.length;
  el.afterCount.textContent = el.afterText.value.length;
}

async function handleAnalyze() {
  if (state.loading) {
    return;
  }
  clearMessages();

  const apiKeyFromInput = el.apiKeyInput.value.trim();
  const apiKey = (apiKeyFromInput || sessionStorage.getItem(STORAGE_KEYS.apiKey) || "").trim();
  if (apiKeyFromInput) {
    sessionStorage.setItem(STORAGE_KEYS.apiKey, apiKeyFromInput);
  }
  const model = el.modelSelect.value;
  const mode = el.modeSelect.value;

  const validationError = validateInputs({ mode, apiKey, model });
  if (validationError) {
    showError(validationError);
    return;
  }

  const payload = buildInputPayload(mode);
  state.loading = true;
  setLoadingState(true);

  try {
    const result = await requestAnalysis({ mode, model, apiKey, payload });
    const normalized = normalizeResponse(result, mode, model);
    state.lastResult = normalized;
    state.lastResultAt = new Date().toISOString();
    renderResult(normalized, state.lastResultAt, model);

    if (state.settings.autoSaveHistory) {
      saveHistoryItem({
        mode,
        model,
        inputs: payload,
        result: normalized,
      });
    }

    showStatus("判定が完了しました");
  } catch (error) {
    showError(error.message || "判定に失敗しました");
  } finally {
    state.loading = false;
    setLoadingState(false);
  }
}

function setLoadingState(isLoading) {
  el.analyzeBtn.disabled = isLoading;
  el.analyzeBtn.textContent = isLoading ? "判定中..." : "判定実行";
}

function validateInputs({ mode, apiKey, model }) {
  if (!apiKey) {
    return "APIキーを入力してください";
  }
  if (!model) {
    return "モデルを選択してください";
  }

  if (mode === "single") {
    const text = el.singleText.value.trim();
    if (!text) {
      return "本文を入力してください";
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return "本文は3000文字以内で入力してください";
    }
    if (!isLikelyJapanese(text)) {
      return "日本語として極端に不適切な入力です";
    }
    return null;
  }

  const before = el.beforeText.value.trim();
  const after = el.afterText.value.trim();
  if (!before && !after) {
    return "添削前本文と添削後本文を入力してください";
  }
  if (!before || !after) {
    return "比較モードでは添削前本文と添削後本文の両方を入力してください";
  }
  if (before.length > MAX_TEXT_LENGTH || after.length > MAX_TEXT_LENGTH) {
    return "添削前本文・添削後本文はそれぞれ3000文字以内で入力してください";
  }
  if (!isLikelyJapanese(before) || !isLikelyJapanese(after)) {
    return "日本語として極端に不適切な入力です";
  }
  return null;
}

function isLikelyJapanese(text) {
  const normalized = text.replace(/\s/g, "");
  if (!normalized) {
    return false;
  }
  const jaChars = normalized.match(/[ぁ-んァ-ン一-龥々ー]/g) || [];
  return jaChars.length / normalized.length >= 0.2;
}

function buildInputPayload(mode) {
  if (mode === "single") {
    return { text: el.singleText.value.trim() };
  }
  return {
    beforeText: el.beforeText.value.trim(),
    afterText: el.afterText.value.trim(),
  };
}

function buildSystemPrompt() {
  return [
    "あなたは日本語文章の分析アシスタントです。",
    "目的: AIチェッカー回避のために人間らしさを付加した痕跡を推定評価する。",
    "出力は必ずJSONのみ。説明文やコードフェンスは禁止。",
    "事実認定ではなく推定評価として書く。",
    "ラベルは次の5段階: とても低い, 低い, 中程度, 高い, とても高い。",
    "breakdownは次の6項目(key固定)を含める: humanization, style_variation, specificity_padding, verbosity, residual_ai_traits, naturalness_mismatch。",
    "suggestionsは最大3件。回避の断定的攻略法は禁止。",
    "score/breakdown.scoreは0-100の整数。",
  ].join("\n");
}

function buildUserPrompt(mode, payload, model) {
  const shared = {
    target_language: "ja",
    model,
    requested_json_schema: {
      mode,
      score: "number",
      label: "string",
      summary: "string",
      reasons: ["string"],
      breakdown: [
        {
          key: "string",
          label: "string",
          score: "number",
          comment: "string",
        },
      ],
      suggestions: ["string"],
      warnings: ["string"],
      meta: {
        language: "ja",
        model,
      },
    },
  };

  if (mode === "single") {
    return JSON.stringify({
      ...shared,
      task: "単文判定: AIチェッカー対策済みっぽさを推定評価してください",
      mode: "single",
      input: payload,
      score_definition: {
        0: "AIチェッカー対策済みっぽさがほぼない",
        100: "AIチェッカー対策済みっぽさが非常に強い",
      },
      warning_requirement: "単文判定の限界に言及すること",
    });
  }

  return JSON.stringify({
    ...shared,
    task: "比較判定: 添削によるAIチェッカー対策導入度を推定評価してください",
    mode: "compare",
    input: payload,
    score_definition: {
      0: "添削による対策導入がほぼない",
      100: "添削により対策導入が非常に強い",
    },
    warning_requirement: "比較ベースの推定評価である旨を含めること",
  });
}

async function requestAnalysis({ mode, model, apiKey, payload }) {
  const body = {
    model,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: buildSystemPrompt() }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: buildUserPrompt(mode, payload, model) }],
      },
    ],
    text: {
      format: {
        type: "json_object",
      },
    },
  };

  const call = async () => {
    let response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (_error) {
      throw new Error(
        "通信に失敗しました。ネットワーク状態を確認してください（補足: file:// ではなく http(s) で開いているか、CORS/拡張機能による遮断がないか確認してください）"
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error("APIキーが無効、または権限不足です");
    }
    if (!response.ok) {
      let errorDetail = "";
      try {
        const errorBody = await response.json();
        errorDetail = errorBody?.error?.message ? ` (${errorBody.error.message})` : "";
      } catch (_error) {
        errorDetail = "";
      }

      if (response.status === 429) {
        throw new Error(`モデル呼び出しに失敗しました。利用制限に達している可能性があります${errorDetail}`);
      }
      if (response.status >= 500) {
        throw new Error("モデル呼び出しに失敗しました。モデル設定または利用状況を確認してください");
      }
      if (response.status >= 400) {
        throw new Error(`モデル呼び出しに失敗しました。モデル設定または利用状況を確認してください${errorDetail}`);
      }
      throw new Error(`通信に失敗しました。ネットワーク状態を確認してください${errorDetail}`);
    }

    const data = await response.json();
    const textOutput =
      typeof data?.output_text === "string"
        ? data.output_text
        : extractTextFromResponse(data?.output);
    if (typeof textOutput !== "string") {
      throw new Error("判定結果の解析に失敗しました。再試行してください");
    }
    return textOutput;
  };

  try {
    const raw = await call();
    return JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) {
      try {
        const rawRetry = await call();
        return JSON.parse(rawRetry);
      } catch (errorRetry) {
        throw new Error("判定結果の解析に失敗しました。再試行してください");
      }
    }
    throw error;
  }
}

function extractTextFromResponse(output) {
  if (!Array.isArray(output)) {
    return null;
  }
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === "string" && part.text.trim()) {
        return part.text;
      }
    }
  }
  return null;
}

function normalizeResponse(result, mode, model) {
  if (!result || typeof result !== "object") {
    throw new Error("判定結果の解析に失敗しました。再試行してください");
  }

  const score = clampInt(result.score);
  const label = mapScoreToLabel(score);
  const reasons = Array.isArray(result.reasons) ? result.reasons.slice(0, 5) : [];
  const suggestions = Array.isArray(result.suggestions) ? result.suggestions.slice(0, 3) : [];
  const warnings = Array.isArray(result.warnings) ? result.warnings : [];
  const sourceBreakdown = Array.isArray(result.breakdown) ? result.breakdown : [];

  const breakdown = BREAKDOWN_ITEMS.map((item) => {
    const hit = sourceBreakdown.find((part) => part && part.key === item.key) || {};
    return {
      key: item.key,
      label: item.label,
      score: clampInt(hit.score),
      comment: typeof hit.comment === "string" ? hit.comment : "コメントなし",
    };
  });

  return {
    mode,
    score,
    label,
    summary: typeof result.summary === "string" ? result.summary : "総評なし",
    reasons,
    breakdown,
    suggestions,
    warnings,
    meta: {
      language: "ja",
      model,
    },
  };
}

function clampInt(value) {
  const n = Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0;
  return Math.max(0, Math.min(100, n));
}

function mapScoreToLabel(score) {
  if (score <= 19) return "とても低い";
  if (score <= 39) return "低い";
  if (score <= 59) return "中程度";
  if (score <= 79) return "高い";
  return "とても高い";
}

function scoreContext(mode) {
  return mode === "single"
    ? "0=AIチェッカー対策済みっぽさがほぼない / 100=AIチェッカー対策済みっぽさが非常に強い"
    : "0=添削による対策導入がほぼない / 100=添削により対策導入が非常に強い";
}

function modeLabel(mode) {
  return mode === "single" ? "単文判定" : "比較判定";
}

function labelContext(mode, label) {
  return mode === "single"
    ? `AIチェッカー対策済みっぽさ: ${label}`
    : `添削によるAIチェッカー対策導入度: ${label}`;
}

function renderResult(result, createdAt, model) {
  el.resultEmpty.classList.add("hidden");
  el.resultCard.classList.remove("hidden");
  el.copyResultBtn.disabled = false;

  el.resultCard.innerHTML = `
    <div class="result-block"><strong>判定モード:</strong> ${modeLabel(result.mode)}</div>
    <div class="result-block"><strong>判定日時:</strong> ${formatDate(createdAt)}</div>
    <div class="result-block"><strong>使用モデル:</strong> ${model}</div>
    <div class="result-block"><strong>スコア意味:</strong> ${scoreContext(result.mode)}</div>
    <div class="result-block"><strong>総合スコア:</strong> ${result.score}</div>
    <div class="result-block"><strong>判定ラベル:</strong> ${labelContext(result.mode, result.label)}</div>
    <div class="result-block"><strong>総評:</strong> ${escapeHtml(result.summary)}</div>
    <div class="result-block"><strong>理由:</strong>${renderList(result.reasons)}</div>
    <div class="result-block"><strong>判定根拠の内訳:</strong>${renderBreakdown(result.breakdown)}</div>
    <div class="result-block"><strong>改善提案:</strong>${renderList(result.suggestions)}</div>
    <div class="result-block"><strong>注意書き:</strong>${renderList(result.warnings)}</div>
  `;
}

function renderList(items) {
  const arr = Array.isArray(items) && items.length ? items : ["該当なし"];
  return `<ul>${arr.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderBreakdown(items) {
  const blocks = items.map(
    (part) => `
      <div class="breakdown-item">
        <div><strong>${escapeHtml(part.label)}</strong></div>
        <div>スコア: ${part.score}</div>
        <div>短評: ${escapeHtml(part.comment)}</div>
      </div>
    `
  );
  return blocks.join("");
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

async function copyLastResult() {
  if (!state.lastResult || !state.lastResultAt) {
    showError("コピー対象の結果がありません");
    return;
  }

  const text = buildResultText(state.lastResult, state.lastResultAt, state.lastResult.meta.model);
  try {
    await navigator.clipboard.writeText(text);
    showStatus("結果をコピーしました");
  } catch (_error) {
    showError("クリップボードへのコピーに失敗しました");
  }
}

function buildResultText(result, createdAt, model) {
  return [
    `判定モード: ${modeLabel(result.mode)}`,
    `判定日時: ${formatDate(createdAt)}`,
    `使用モデル: ${model}`,
    `スコア意味: ${scoreContext(result.mode)}`,
    `総合スコア: ${result.score}`,
    `判定ラベル: ${labelContext(result.mode, result.label)}`,
    `総評: ${result.summary}`,
    `理由:`,
    ...result.reasons.map((item, i) => `  ${i + 1}. ${item}`),
    `判定根拠の内訳:`,
    ...result.breakdown.map((part) => `  - ${part.label}: ${part.score} (${part.comment})`),
    `改善提案:`,
    ...result.suggestions.map((item, i) => `  ${i + 1}. ${item}`),
    `注意書き:`,
    ...result.warnings.map((item, i) => `  ${i + 1}. ${item}`),
  ].join("\n");
}

function saveHistoryItem({ mode, model, inputs, result }) {
  const item = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    mode,
    model,
    inputs,
    result,
  };

  try {
    const nextHistory = [item, ...state.history].slice(0, HISTORY_LIMIT);
    state.history = nextHistory;
    persistHistory();
    renderHistoryList();
  } catch (_error) {
    showError("履歴の保存に失敗しました。保存容量を確認してください");
  }
}

function renderHistoryList() {
  el.historyList.innerHTML = "";
  if (!state.history.length) {
    const li = document.createElement("li");
    li.textContent = "履歴はありません。";
    el.historyList.append(li);
    return;
  }

  state.history.forEach((item) => {
    const li = document.createElement("li");
    li.className = "history-item";
    li.innerHTML = `
      <div><strong>${formatDate(item.createdAt)}</strong> / ${modeLabel(item.mode)} / スコア ${item.result.score}</div>
      <div>${escapeHtml(labelContext(item.mode, item.result.label))}</div>
      <div>${escapeHtml(item.result.summary)}</div>
      <div class="history-actions">
        <button type="button" data-action="detail" data-id="${item.id}" class="ghost">詳細</button>
        <button type="button" data-action="reuse" data-id="${item.id}" class="ghost">入力欄へ戻す</button>
        <button type="button" data-action="copy" data-id="${item.id}" class="ghost">コピー</button>
        <button type="button" data-action="delete" data-id="${item.id}" class="danger">削除</button>
      </div>
    `;

    li.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const id = target.dataset.id;
      const action = target.dataset.action;
      if (!id || !action) {
        return;
      }
      await handleHistoryAction(action, id);
    });

    el.historyList.append(li);
  });
}

async function handleHistoryAction(action, id) {
  const item = state.history.find((history) => history.id === id);
  if (!item) {
    return;
  }

  if (action === "detail") {
    renderHistoryDetail(item);
    return;
  }

  if (action === "reuse") {
    loadHistoryToInput(item);
    showStatus("履歴の本文を入力欄へ戻しました。再分析は「判定実行」を押してください");
    return;
  }

  if (action === "copy") {
    try {
      const text = buildResultText(item.result, item.createdAt, item.model);
      await navigator.clipboard.writeText(text);
      showStatus("履歴結果をコピーしました");
    } catch (_error) {
      showError("クリップボードへのコピーに失敗しました");
    }
    return;
  }

  if (action === "delete") {
    state.history = state.history.filter((history) => history.id !== id);
    persistHistory();
    renderHistoryList();
    el.historyDetailSection.classList.add("hidden");
    showStatus("履歴を削除しました");
  }
}

function renderHistoryDetail(item) {
  el.historyDetailSection.classList.remove("hidden");

  const inputHtml =
    item.mode === "single"
      ? `<div class="result-block"><strong>本文:</strong><pre>${escapeHtml(item.inputs.text || "")}</pre></div>`
      : `<div class="result-block"><strong>添削前本文:</strong><pre>${escapeHtml(item.inputs.beforeText || "")}</pre></div>
         <div class="result-block"><strong>添削後本文:</strong><pre>${escapeHtml(item.inputs.afterText || "")}</pre></div>`;

  el.historyDetailCard.innerHTML = `
    <div class="result-block"><strong>判定日時:</strong> ${formatDate(item.createdAt)}</div>
    <div class="result-block"><strong>判定モード:</strong> ${modeLabel(item.mode)}</div>
    <div class="result-block"><strong>使用モデル:</strong> ${item.model}</div>
    <div class="result-block"><strong>スコア意味:</strong> ${scoreContext(item.mode)}</div>
    ${inputHtml}
    <hr />
    ${buildResultHtml(item)}
  `;
}

function buildResultHtml(item) {
  const result = item.result;
  return `
    <div class="result-block"><strong>総合スコア:</strong> ${result.score}</div>
    <div class="result-block"><strong>判定ラベル:</strong> ${labelContext(item.mode, result.label)}</div>
    <div class="result-block"><strong>総評:</strong> ${escapeHtml(result.summary)}</div>
    <div class="result-block"><strong>理由:</strong>${renderList(result.reasons)}</div>
    <div class="result-block"><strong>判定根拠の内訳:</strong>${renderBreakdown(result.breakdown)}</div>
    <div class="result-block"><strong>改善提案:</strong>${renderList(result.suggestions)}</div>
    <div class="result-block"><strong>注意書き:</strong>${renderList(result.warnings)}</div>
  `;
}

function loadHistoryToInput(item) {
  el.modeSelect.value = item.mode;
  state.settings.lastMode = item.mode;
  saveSettings();
  updateModeUI();

  if (item.mode === "single") {
    el.singleText.value = item.inputs.text || "";
  } else {
    el.beforeText.value = item.inputs.beforeText || "";
    el.afterText.value = item.inputs.afterText || "";
  }

  el.modelSelect.value = item.model;
  state.settings.defaultModel = item.model;
  saveSettings();
  updateCountViews();
}

function clearHistoryAll() {
  state.history = [];
  persistHistory();
  renderHistoryList();
  el.historyDetailSection.classList.add("hidden");
  showStatus("履歴を全件削除しました");
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    if (!raw) {
      return { ...DEFAULT_SETTINGS };
    }
    const parsed = JSON.parse(raw);
    return {
      autoSaveHistory: typeof parsed.autoSaveHistory === "boolean" ? parsed.autoSaveHistory : true,
      defaultModel: MODELS.includes(parsed.defaultModel) ? parsed.defaultModel : DEFAULT_SETTINGS.defaultModel,
      lastMode: parsed.lastMode === "compare" ? "compare" : "single",
    };
  } catch (_error) {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.history);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, HISTORY_LIMIT) : [];
  } catch (_error) {
    return [];
  }
}

function persistHistory() {
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(state.history));
}

function clearMessages() {
  el.statusMessage.textContent = "";
  el.errorMessage.textContent = "";
}

function showStatus(message) {
  el.statusMessage.textContent = message;
}

function showError(message) {
  el.errorMessage.textContent = message;
}
