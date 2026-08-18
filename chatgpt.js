const API_ENDPOINT = document.querySelector('meta[name="insights-api-endpoint"]')?.content || "/api/chat";

const copilot = {
  chunks: [],
  documents: new Map(),
  history: [],
  backendReady: false,
  model: null
};

const STOP_WORDS = new Set([
  "a","an","and","are","as","at","be","been","being","but","by","can","could","did","do","does","for","from","had","has","have","how","i","if","in","into","is","it","its","may","might","more","most","of","on","or","our","should","so","than","that","the","their","them","there","these","they","this","those","to","was","we","were","what","when","where","which","who","why","will","with","would","you","your","about","across","based","please","tell","say","says"
]);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function tokenize(text) {
  return (String(text).toLowerCase().match(/[a-z0-9][a-z0-9'%-]*/g) || [])
    .map(token => token.replace(/^'+|'+$/g, ""))
    .filter(token => token.length > 1 && !STOP_WORDS.has(token));
}

function extensionOf(name) {
  const parts = String(name).toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() : "file";
}

function chunkText(text, source, locator, targetSize = 1800, overlap = 220) {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const chunks = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + targetSize, normalized.length);
    if (end < normalized.length) {
      const boundary = normalized.lastIndexOf("\n", end);
      if (boundary > start + targetSize * 0.55) end = boundary;
    }
    const value = normalized.slice(start, end).trim();
    if (value) {
      const tokens = tokenize(value);
      chunks.push({ source, locator, text: value, tokens, tokenSet: new Set(tokens) });
    }
    if (end >= normalized.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

async function ensurePdfJs() {
  if (window.__insightsPdfJs) return window.__insightsPdfJs;
  const pdfjs = await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";
  window.__insightsPdfJs = pdfjs;
  return pdfjs;
}

async function parsePdf(file) {
  const pdfjs = await ensurePdfJs();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const sections = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map(item => item.str).join(" ");
    if (text.trim()) sections.push({ text, locator: `Page ${pageNumber}` });
  }
  return sections;
}

async function parseDocx(file) {
  if (!window.mammoth) throw new Error("DOCX parser is unavailable.");
  const result = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return [{ text: result.value, locator: "Document" }];
}

async function parseWorkbook(file) {
  if (!window.XLSX) throw new Error("Spreadsheet parser is unavailable.");
  const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  return workbook.SheetNames.map(sheetName => ({
    locator: `Sheet: ${sheetName}`,
    text: window.XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName], { blankrows: false })
  })).filter(section => section.text.trim());
}

async function parseText(file) {
  return [{ text: await file.text(), locator: "Document" }];
}

async function parseFile(file) {
  const ext = extensionOf(file.name);
  if (ext === "pdf") return parsePdf(file);
  if (ext === "docx") return parseDocx(file);
  if (["xlsx", "xls"].includes(ext)) return parseWorkbook(file);
  if (["txt", "md", "csv", "json"].includes(ext)) return parseText(file);
  return [];
}

async function indexFiles(fileList) {
  const files = Array.from(fileList || []);
  for (const file of files) {
    const key = `${file.name}:${file.size}`;
    if (copilot.documents.has(key)) continue;
    try {
      const sections = await parseFile(file);
      const chunks = sections.flatMap(section => chunkText(section.text, file.name, section.locator));
      if (chunks.length) {
        copilot.documents.set(key, { name: file.name, size: file.size });
        copilot.chunks.push(...chunks);
      }
    } catch (error) {
      console.warn(`Insights Copilot could not index ${file.name} for ChatGPT grounding.`, error);
    }
  }
}

async function loadManifestFiles() {
  try {
    const response = await fetch("project-files/manifest.json", { cache: "no-store" });
    if (!response.ok) return;
    const manifest = await response.json();
    const entries = Array.isArray(manifest.files) ? manifest.files : [];
    const files = [];
    for (const entry of entries) {
      const path = typeof entry === "string" ? entry : entry?.path;
      if (!path) continue;
      try {
        const fileResponse = await fetch(encodeURI(path), { cache: "no-store" });
        if (!fileResponse.ok) continue;
        const blob = await fileResponse.blob();
        const name = typeof entry === "object" && entry.name
          ? entry.name
          : decodeURIComponent(path.split("/").pop());
        files.push(new File([blob], name, { type: blob.type }));
      } catch (_) {
        // Keep loading the rest of the project evidence.
      }
    }
    await indexFiles(files);
  } catch (_) {
    // Manual uploads remain available when no manifest exists.
  }
}

function evidenceLabel(chunk) {
  return chunk.locator && chunk.locator !== "Document"
    ? `${chunk.source} — ${chunk.locator}`
    : chunk.source;
}

function retrieveEvidence(question, limit = 8) {
  const queryTokens = tokenize(question);
  if (!queryTokens.length || !copilot.chunks.length) return [];

  const df = new Map();
  for (const token of [...new Set(queryTokens)]) {
    df.set(token, copilot.chunks.reduce((count, chunk) => count + (chunk.tokenSet.has(token) ? 1 : 0), 0));
  }

  const ranked = copilot.chunks.map(chunk => {
    let score = 0;
    const lowerSource = chunk.source.toLowerCase();
    for (const token of queryTokens) {
      const occurrences = chunk.tokens.reduce((count, value) => count + (value === token ? 1 : 0), 0);
      const idf = Math.log(1 + (copilot.chunks.length + 1) / ((df.get(token) || 0) + 1));
      score += Math.min(occurrences, 8) * idf;
      if (lowerSource.includes(token)) score += 2;
    }
    return { chunk, score };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);

  const selected = [];
  const perSource = new Map();
  for (const item of ranked) {
    const used = perSource.get(item.chunk.source) || 0;
    if (used >= 3) continue;
    selected.push({ source: evidenceLabel(item.chunk), text: item.chunk.text.slice(0, 5000) });
    perSource.set(item.chunk.source, used + 1);
    if (selected.length >= limit) break;
  }
  return selected;
}

function appendMessage(role, content, sources = [], options = {}) {
  const template = document.getElementById("messageTemplate")?.content.cloneNode(true);
  if (!template) return null;
  const article = template.querySelector(".message");
  const avatar = template.querySelector(".message-avatar");
  const label = template.querySelector(".message-label");
  const text = template.querySelector(".message-text");
  const sourceContainer = template.querySelector(".sources");

  article.classList.add(role);
  if (options.pending) article.classList.add("ai-pending");
  avatar.textContent = role === "assistant" ? "✦" : "You";
  label.textContent = role === "assistant" ? "Insights Copilot" : "You";
  text.innerHTML = role === "assistant"
    ? `<p>${escapeHtml(content).replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`
    : `<p>${escapeHtml(content)}</p>`;

  if (sources.length) {
    sourceContainer.innerHTML = sources.map((source, index) =>
      `<span class="source-chip" title="${escapeHtml(source)}">[${index + 1}] ${escapeHtml(source)}</span>`
    ).join("");
  }

  const chatBody = document.getElementById("chatBody");
  chatBody.appendChild(template);
  chatBody.scrollTop = chatBody.scrollHeight;
  return chatBody.lastElementChild;
}

function citedSources(answer, evidence) {
  const indexes = [...String(answer).matchAll(/\[(\d+)\]/g)]
    .map(match => Number(match[1]) - 1)
    .filter(index => index >= 0 && index < evidence.length);
  const unique = [...new Set(indexes)];
  return (unique.length ? unique : evidence.slice(0, 3).map((_, index) => index))
    .map(index => evidence[index]?.source)
    .filter(Boolean);
}

function updateStatus(mode, text) {
  const pill = document.getElementById("privacyStatus");
  if (!pill) return;
  pill.classList.remove("ready", "error", "connecting");
  pill.classList.add(mode);
  pill.innerHTML = `<span class="status-dot"></span>${escapeHtml(text)}`;
}

async function checkBackend() {
  updateStatus("connecting", "Connecting to ChatGPT…");
  try {
    const response = await fetch(API_ENDPOINT, { method: "GET", cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    copilot.backendReady = response.ok && Boolean(data.configured);
    copilot.model = data.model || null;
    if (copilot.backendReady) {
      updateStatus("ready", `ChatGPT ready · ${copilot.model || "OpenAI"}`);
    } else if (response.ok) {
      updateStatus("error", "ChatGPT needs OPENAI_API_KEY");
    } else {
      updateStatus("error", "ChatGPT backend unavailable");
    }
  } catch (_) {
    copilot.backendReady = false;
    updateStatus("error", "ChatGPT backend unavailable");
  }
}

async function askChatGPT(question) {
  const trimmed = String(question || "").trim();
  if (!trimmed) return;
  document.getElementById("welcomeCard")?.remove();
  appendMessage("user", trimmed);

  if (!copilot.chunks.length) {
    appendMessage("assistant", "I don't have project evidence yet. Upload a Final Report, expert transcript, survey file, or other project material first.");
    return;
  }

  const evidence = retrieveEvidence(trimmed, 8);
  if (!evidence.length) {
    appendMessage("assistant", "I couldn't find sufficiently relevant evidence in the loaded project files for that question. Try using terms that appear in the project material.");
    return;
  }

  const pending = appendMessage("assistant", "Processing the relevant project evidence with ChatGPT…", [], { pending: true });
  const history = copilot.history.slice(-8);

  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: trimmed, evidence, history })
    });
    const data = await response.json().catch(() => ({}));
    pending?.remove();

    if (!response.ok || !data.answer) {
      const message = data.error || "ChatGPT could not generate a response. Check the server configuration and try again.";
      appendMessage("assistant", message);
      if (response.status === 503) updateStatus("error", "ChatGPT needs OPENAI_API_KEY");
      return;
    }

    const sources = citedSources(data.answer, evidence);
    appendMessage("assistant", data.answer, sources);
    copilot.history.push({ role: "user", content: trimmed });
    copilot.history.push({ role: "assistant", content: data.answer });
    copilot.history = copilot.history.slice(-10);
  } catch (_) {
    pending?.remove();
    appendMessage("assistant", "The ChatGPT service is currently unreachable. Deploy this repository with its serverless API route and configure OPENAI_API_KEY, then try again.");
    updateStatus("error", "ChatGPT backend unavailable");
  }
}

function submitQuestionFromComposer() {
  const input = document.getElementById("questionInput");
  const question = input?.value || "";
  if (!question.trim()) return;
  input.value = "";
  input.style.height = "auto";
  askChatGPT(question);
}

document.addEventListener("submit", event => {
  if (event.target?.id !== "chatForm") return;
  event.preventDefault();
  event.stopImmediatePropagation();
  submitQuestionFromComposer();
}, true);

document.addEventListener("click", event => {
  const suggestion = event.target.closest?.(".suggestion");
  if (suggestion) {
    event.preventDefault();
    event.stopImmediatePropagation();
    askChatGPT(suggestion.textContent || "");
    return;
  }

  if (event.target.closest?.("#newChatButton")) {
    copilot.history = [];
  }

  if (event.target.closest?.("#clearFilesButton")) {
    copilot.chunks = [];
    copilot.documents.clear();
  }
}, true);

document.addEventListener("change", event => {
  if (event.target?.id === "fileInput") indexFiles(event.target.files);
}, true);

document.addEventListener("drop", event => {
  if (event.target.closest?.("#dropZone")) indexFiles(event.dataTransfer?.files);
}, true);

loadManifestFiles();
checkBackend();
