const state = {
  documents: [],
  chunks: [],
  messages: []
};

const STOP_WORDS = new Set([
  "a","an","and","are","as","at","be","been","being","but","by","can","could","did","do","does","for","from","had","has","have","how","i","if","in","into","is","it","its","may","might","more","most","of","on","or","our","should","so","than","that","the","their","them","there","these","they","this","those","to","was","we","were","what","when","where","which","who","why","will","with","would","you","your","about","across","based","please","tell","say","says"
]);

const GENERIC_QUERY_WORDS = new Set([
  "important","finding","findings","key","main","summary","summarize","overview","theme","themes","insight","insights","project","report","reports","data","evidence"
]);

const els = {
  fileInput: document.getElementById("fileInput"),
  dropZone: document.getElementById("dropZone"),
  fileList: document.getElementById("fileList"),
  fileCount: document.getElementById("fileCount"),
  chunkCount: document.getElementById("chunkCount"),
  wordCount: document.getElementById("wordCount"),
  clearFilesButton: document.getElementById("clearFilesButton"),
  newChatButton: document.getElementById("newChatButton"),
  chatBody: document.getElementById("chatBody"),
  chatForm: document.getElementById("chatForm"),
  questionInput: document.getElementById("questionInput"),
  sendButton: document.getElementById("sendButton"),
  welcomeCard: document.getElementById("welcomeCard"),
  messageTemplate: document.getElementById("messageTemplate")
};

const formatNumber = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

function uid(prefix = "id") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function tokenize(text) {
  return (String(text).toLowerCase().match(/[a-z0-9][a-z0-9'%-]*/g) || [])
    .map(token => token.replace(/^'+|'+$/g, ""))
    .filter(token => token.length > 1 && !STOP_WORDS.has(token));
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function splitSentences(text) {
  const cleaned = normalizeText(text).replace(/\n+/g, " ");
  if (!cleaned) return [];
  const matches = cleaned.match(/[^.!?]+(?:[.!?]+|$)/g) || [cleaned];
  return matches.map(s => s.trim()).filter(s => s.length >= 30);
}

function chunkSection(text, locator, document, targetSize = 1250, overlap = 180) {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const chunks = [];
  let buffer = "";

  const pushBuffer = () => {
    const value = buffer.trim();
    if (!value) return;
    const tokens = tokenize(value);
    chunks.push({
      id: uid("chunk"),
      documentId: document.id,
      fileName: document.name,
      fileType: document.extension,
      locator,
      text: value,
      tokens,
      tokenSet: new Set(tokens)
    });
  };

  for (const paragraph of paragraphs.length ? paragraphs : [normalized]) {
    if (paragraph.length > targetSize * 1.5) {
      if (buffer) {
        pushBuffer();
        buffer = "";
      }
      let start = 0;
      while (start < paragraph.length) {
        const end = Math.min(start + targetSize, paragraph.length);
        const slice = paragraph.slice(start, end);
        buffer = slice;
        pushBuffer();
        buffer = "";
        if (end === paragraph.length) break;
        start = Math.max(0, end - overlap);
      }
      continue;
    }

    const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    if (candidate.length > targetSize && buffer) {
      const previous = buffer;
      pushBuffer();
      const carry = previous.slice(Math.max(0, previous.length - overlap));
      buffer = `${carry}\n\n${paragraph}`;
    } else {
      buffer = candidate;
    }
  }

  if (buffer) pushBuffer();
  return chunks;
}

function extensionOf(name) {
  const parts = String(name).toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() : "file";
}

function documentCategory(name) {
  const n = name.toLowerCase();
  if (/transcript|interview|expert|qualitative|idi/.test(n)) return "Expert transcript";
  if (/survey|respondent|quant|crosstab|cross-tab|questionnaire/.test(n)) return "Survey data";
  if (/final|report|deliverable|executive|summary/.test(n)) return "Report";
  if (/appendix|support|evidence|source|reference/.test(n)) return "Supporting evidence";
  return "Project file";
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
  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
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
  if (!window.mammoth) throw new Error("DOCX parser failed to load. Check the browser network connection and retry.");
  const result = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return [{ text: result.value, locator: "Document" }];
}

async function parseWorkbook(file) {
  if (!window.XLSX) throw new Error("Spreadsheet parser failed to load. Check the browser network connection and retry.");
  const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sections = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = window.XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (csv.trim()) sections.push({ text: csv, locator: `Sheet: ${sheetName}` });
  }
  return sections;
}

async function parseTextFile(file) {
  let text = await file.text();
  if (extensionOf(file.name) === "json") {
    try {
      text = JSON.stringify(JSON.parse(text), null, 2);
    } catch (_) {
      // Keep raw text when the JSON is malformed; retrieval can still use readable fragments.
    }
  }
  return [{ text, locator: "Document" }];
}

async function parseFile(file) {
  const ext = extensionOf(file.name);
  if (ext === "pdf") return parsePdf(file);
  if (ext === "docx") return parseDocx(file);
  if (["xlsx", "xls"].includes(ext)) return parseWorkbook(file);
  if (["txt", "md", "csv", "json"].includes(ext)) return parseTextFile(file);
  throw new Error(`Unsupported file type: .${ext}`);
}

async function addFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;

  showProcessing(`Indexing ${files.length} project file${files.length === 1 ? "" : "s"}…`);
  els.sendButton.disabled = true;

  for (const file of files) {
    const duplicate = state.documents.find(doc => doc.name === file.name && doc.size === file.size);
    if (duplicate) continue;

    const document = {
      id: uid("doc"),
      name: file.name,
      size: file.size,
      extension: extensionOf(file.name),
      category: documentCategory(file.name),
      status: "processing",
      chunkCount: 0,
      wordCount: 0,
      error: null
    };
    state.documents.push(document);
    renderFiles();

    try {
      const sections = await parseFile(file);
      const documentChunks = sections.flatMap(section => chunkSection(section.text, section.locator, document));
      if (!documentChunks.length) throw new Error("No readable text was found in this file.");
      document.status = "ready";
      document.chunkCount = documentChunks.length;
      document.wordCount = documentChunks.reduce((sum, chunk) => sum + chunk.tokens.length, 0);
      state.chunks.push(...documentChunks);
    } catch (error) {
      document.status = "error";
      document.error = error?.message || "This file could not be read.";
    }
    renderFiles();
    renderStats();
  }

  hideProcessing();
  els.sendButton.disabled = false;
  els.fileInput.value = "";
}

function removeDocument(documentId) {
  state.documents = state.documents.filter(doc => doc.id !== documentId);
  state.chunks = state.chunks.filter(chunk => chunk.documentId !== documentId);
  renderFiles();
  renderStats();
}

function clearFiles() {
  state.documents = [];
  state.chunks = [];
  renderFiles();
  renderStats();
}

function renderFiles() {
  if (!state.documents.length) {
    els.fileList.innerHTML = '<div class="empty-files">Upload files to create a project knowledge base.</div>';
    return;
  }

  els.fileList.innerHTML = state.documents.map(doc => {
    const ext = escapeHtml(doc.extension.toUpperCase().slice(0, 5));
    const meta = doc.status === "processing"
      ? "Indexing…"
      : doc.status === "error"
        ? escapeHtml(doc.error)
        : `${escapeHtml(doc.category)} · ${doc.chunkCount} chunks`;
    return `
      <div class="file-row ${doc.status === "error" ? "error" : ""}">
        <div class="file-type">${ext}</div>
        <div>
          <div class="file-name" title="${escapeHtml(doc.name)}">${escapeHtml(doc.name)}</div>
          <div class="file-meta">${meta}</div>
        </div>
        <button class="file-remove" type="button" data-remove-doc="${doc.id}" aria-label="Remove ${escapeHtml(doc.name)}">×</button>
      </div>`;
  }).join("");

  els.fileList.querySelectorAll("[data-remove-doc]").forEach(button => {
    button.addEventListener("click", () => removeDocument(button.dataset.removeDoc));
  });
}

function renderStats() {
  const readyDocs = state.documents.filter(doc => doc.status === "ready");
  els.fileCount.textContent = readyDocs.length;
  els.chunkCount.textContent = formatNumber.format(state.chunks.length);
  const words = readyDocs.reduce((sum, doc) => sum + doc.wordCount, 0);
  els.wordCount.textContent = formatNumber.format(words);
}

function queryProfile(query) {
  const rawTokens = tokenize(query);
  const specificTokens = rawTokens.filter(token => !GENERIC_QUERY_WORDS.has(token));
  const lower = query.toLowerCase();
  return {
    rawTokens,
    specificTokens,
    wantsSummary: /summar|overview|key findings|main findings|important findings|most important|top findings/.test(lower),
    wantsDisagreement: /disagree|disagreement|conflict|contradict|different view|different perspective|sources differ/.test(lower),
    wantsExperts: /expert|interview|transcript|qualitative|respondent quote/.test(lower),
    wantsSurvey: /survey|quant|respondent|percentage|percent|crosstab|cross-tab|sample/.test(lower),
    wantsComparison: /compare|comparison|versus| vs |difference|differ between/.test(lower)
  };
}

function buildDocumentFrequency(tokens) {
  const df = new Map();
  const uniqueQuery = [...new Set(tokens)];
  for (const token of uniqueQuery) {
    let count = 0;
    for (const chunk of state.chunks) {
      if (chunk.tokenSet.has(token) || chunk.fileName.toLowerCase().includes(token)) count += 1;
    }
    df.set(token, count);
  }
  return df;
}

function lexicalScore(chunk, query, profile, df) {
  const lowerText = chunk.text.toLowerCase();
  const lowerName = chunk.fileName.toLowerCase();
  let score = 0;

  for (const token of profile.rawTokens) {
    const occurrence = chunk.tokens.reduce((sum, value) => sum + (value === token ? 1 : 0), 0);
    const docFreq = df.get(token) || 0;
    const idf = Math.log(1 + (state.chunks.length + 1) / (docFreq + 1));
    score += Math.min(occurrence, 6) * idf;
    if (lowerName.includes(token)) score += 2.2;
  }

  const phrase = query.toLowerCase().trim();
  if (phrase.length > 8 && lowerText.includes(phrase)) score += 8;
  if (profile.wantsExperts && documentCategory(chunk.fileName) === "Expert transcript") score += 3.2;
  if (profile.wantsSurvey && documentCategory(chunk.fileName) === "Survey data") score += 3.2;
  if (profile.wantsSummary && documentCategory(chunk.fileName) === "Report") score += 1.8;

  const uniqueRatio = chunk.tokenSet.size / Math.max(chunk.tokens.length, 1);
  score += Math.min(uniqueRatio * 2, 1.2);
  return score;
}

function diversifyRanked(ranked, limit = 7) {
  const selected = [];
  const perDoc = new Map();
  for (const item of ranked) {
    const used = perDoc.get(item.chunk.documentId) || 0;
    if (used >= 3) continue;
    selected.push(item);
    perDoc.set(item.chunk.documentId, used + 1);
    if (selected.length >= limit) break;
  }
  return selected;
}

function fallbackEvidence(profile, limit = 7) {
  let pool = [...state.chunks];
  if (profile.wantsExperts) {
    const expert = pool.filter(chunk => documentCategory(chunk.fileName) === "Expert transcript");
    if (expert.length) pool = expert;
  } else if (profile.wantsSurvey) {
    const survey = pool.filter(chunk => documentCategory(chunk.fileName) === "Survey data");
    if (survey.length) pool = survey;
  } else if (profile.wantsSummary) {
    const reports = pool.filter(chunk => documentCategory(chunk.fileName) === "Report");
    if (reports.length) pool = reports;
  }

  return diversifyRanked(pool.map(chunk => ({
    chunk,
    score: 0.4 + Math.min(chunk.tokenSet.size / 120, 1)
  })).sort((a, b) => b.score - a.score), limit);
}

function searchEvidence(query, limit = 7) {
  const profile = queryProfile(query);
  const df = buildDocumentFrequency(profile.rawTokens);
  const ranked = state.chunks
    .map(chunk => ({ chunk, score: lexicalScore(chunk, query, profile, df) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const top = diversifyRanked(ranked, limit);
  const meaningfulTokens = profile.specificTokens.length ? profile.specificTokens : profile.rawTokens;
  const weakRetrieval = !top.length || (meaningfulTokens.length && top[0]?.score < 0.9);
  return {
    profile,
    results: weakRetrieval && (profile.wantsSummary || profile.wantsExperts || profile.wantsSurvey)
      ? fallbackEvidence(profile, limit)
      : top
  };
}

function sentenceScore(sentence, queryTokens) {
  const tokens = tokenize(sentence);
  const set = new Set(tokens);
  let score = 0;
  for (const token of queryTokens) {
    if (set.has(token)) score += 2;
  }
  if (/\b\d+(?:\.\d+)?%\b/.test(sentence)) score += 0.8;
  if (/\b(increase|decrease|higher|lower|majority|most|primary|key|because|however|but|risk|opportunity|priority|challenge|driver)\b/i.test(sentence)) score += 0.6;
  if (sentence.length >= 70 && sentence.length <= 320) score += 0.5;
  return score;
}

function pickEvidenceSentences(results, profile, maxSentences = 5) {
  const candidates = [];
  const queryTokens = profile.specificTokens.length ? profile.specificTokens : profile.rawTokens;

  results.forEach((result, resultIndex) => {
    splitSentences(result.chunk.text).forEach(sentence => {
      candidates.push({
        sentence,
        resultIndex,
        score: sentenceScore(sentence, queryTokens) + Math.max(0, result.score / 4)
      });
    });
  });

  candidates.sort((a, b) => b.score - a.score);
  const selected = [];
  const seen = new Set();
  const perSource = new Map();
  for (const item of candidates) {
    const key = item.sentence.toLowerCase().replace(/[^a-z0-9]+/g, " ").slice(0, 120);
    if (seen.has(key)) continue;
    const sourceCount = perSource.get(item.resultIndex) || 0;
    if (sourceCount >= 2) continue;
    selected.push(item);
    seen.add(key);
    perSource.set(item.resultIndex, sourceCount + 1);
    if (selected.length >= maxSentences) break;
  }
  return selected;
}

function trimSentence(sentence, max = 360) {
  if (sentence.length <= max) return sentence;
  return `${sentence.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

function evidenceLabel(chunk) {
  return chunk.locator && chunk.locator !== "Document"
    ? `${chunk.fileName} — ${chunk.locator}`
    : chunk.fileName;
}

function generateAnswer(query) {
  if (!state.chunks.length) {
    return {
      html: "<p><strong>I don’t have project evidence yet.</strong> Upload a Final Report, expert transcript, survey file, or other project material and ask again.</p>",
      sources: []
    };
  }

  const { profile, results } = searchEvidence(query);
  if (!results.length) {
    return {
      html: "<p>I couldn’t find evidence in the uploaded files that is sufficiently related to that question. Try using terms that appear in the project material, or upload an additional source.</p>",
      sources: []
    };
  }

  const selected = pickEvidenceSentences(results, profile, profile.wantsComparison || profile.wantsDisagreement ? 6 : 5);
  if (!selected.length) {
    return {
      html: "<p>I found potentially relevant project material, but not enough readable sentence-level evidence to form a grounded answer.</p>",
      sources: results.slice(0, 3).map(item => evidenceLabel(item.chunk))
    };
  }

  const uniqueSources = [];
  const sourceIndex = new Map();
  const indexForResult = resultIndex => {
    const label = evidenceLabel(results[resultIndex].chunk);
    if (!sourceIndex.has(label)) {
      uniqueSources.push(label);
      sourceIndex.set(label, uniqueSources.length);
    }
    return sourceIndex.get(label);
  };

  const bullets = selected.map(item => {
    const citation = indexForResult(item.resultIndex);
    return `<li>${escapeHtml(trimSentence(item.sentence))} <strong>[${citation}]</strong></li>`;
  }).join("");

  let intro = "The uploaded project evidence points to the following:";
  if (profile.wantsSummary) intro = "The most salient findings I can ground in the uploaded project files are:";
  if (profile.wantsExperts) intro = "Across the expert/interview evidence currently loaded, the strongest relevant signals are:";
  if (profile.wantsSurvey) intro = "From the survey/quantitative evidence currently loaded, the strongest relevant signals are:";
  if (profile.wantsDisagreement) intro = "The uploaded sources show these relevant perspectives; differences should be interpreted in the context of each cited source:";
  if (profile.wantsComparison) intro = "The clearest evidence for the requested comparison is:";

  const topScore = results[0]?.score || 0;
  const confidence = topScore > 7 ? "High evidence match" : topScore > 2.5 ? "Moderate evidence match" : "Exploratory evidence match";

  return {
    html: `<p>${escapeHtml(intro)}</p><ul>${bullets}</ul><span class="confidence">${confidence} · ${uniqueSources.length} cited source${uniqueSources.length === 1 ? "" : "s"}</span>`,
    sources: uniqueSources
  };
}

function appendMessage(role, content, sources = []) {
  const template = els.messageTemplate.content.cloneNode(true);
  const article = template.querySelector(".message");
  const avatar = template.querySelector(".message-avatar");
  const label = template.querySelector(".message-label");
  const text = template.querySelector(".message-text");
  const sourceContainer = template.querySelector(".sources");

  article.classList.add(role);
  avatar.textContent = role === "assistant" ? "✦" : "You";
  label.textContent = role === "assistant" ? "Insights Copilot" : "You";
  text.innerHTML = role === "assistant" ? content : `<p>${escapeHtml(content)}</p>`;

  if (sources.length) {
    sourceContainer.innerHTML = sources.map((source, index) =>
      `<span class="source-chip" title="${escapeHtml(source)}">[${index + 1}] ${escapeHtml(source)}</span>`
    ).join("");
  }

  els.chatBody.appendChild(template);
  els.chatBody.scrollTop = els.chatBody.scrollHeight;
}

function askQuestion(question) {
  const trimmed = String(question || "").trim();
  if (!trimmed) return;
  if (document.getElementById("welcomeCard")) document.getElementById("welcomeCard").remove();

  appendMessage("user", trimmed);
  state.messages.push({ role: "user", content: trimmed });

  const answer = generateAnswer(trimmed);
  window.setTimeout(() => {
    appendMessage("assistant", answer.html, answer.sources);
    state.messages.push({ role: "assistant", content: answer.html, sources: answer.sources });
  }, 120);
}

function resetChat() {
  state.messages = [];
  els.chatBody.innerHTML = `
    <div class="welcome-card" id="welcomeCard">
      <div class="copilot-avatar">✦</div>
      <h2>What would you like to know?</h2>
      <p>Ask questions across the project files currently loaded in this browser session.</p>
      <div class="suggestion-grid">
        <button class="suggestion">What are the most important findings?</button>
        <button class="suggestion">What themes recur across expert interviews?</button>
        <button class="suggestion">What does the survey data say about customer priorities?</button>
        <button class="suggestion">Where do the sources disagree?</button>
      </div>
    </div>`;
  bindSuggestionButtons();
}

function showProcessing(message) {
  hideProcessing();
  const banner = document.createElement("div");
  banner.id = "processingBanner";
  banner.className = "processing-banner";
  banner.textContent = message;
  els.chatBody.prepend(banner);
}

function hideProcessing() {
  document.getElementById("processingBanner")?.remove();
}

function autoResizeTextarea() {
  els.questionInput.style.height = "auto";
  els.questionInput.style.height = `${Math.min(els.questionInput.scrollHeight, 150)}px`;
}

function bindSuggestionButtons() {
  document.querySelectorAll(".suggestion").forEach(button => {
    button.addEventListener("click", () => askQuestion(button.textContent));
  });
}

els.fileInput.addEventListener("change", event => addFiles(event.target.files));

["dragenter", "dragover"].forEach(eventName => {
  els.dropZone.addEventListener(eventName, event => {
    event.preventDefault();
    els.dropZone.classList.add("is-dragging");
  });
});

["dragleave", "drop"].forEach(eventName => {
  els.dropZone.addEventListener(eventName, event => {
    event.preventDefault();
    els.dropZone.classList.remove("is-dragging");
  });
});

els.dropZone.addEventListener("drop", event => addFiles(event.dataTransfer.files));
els.clearFilesButton.addEventListener("click", clearFiles);
els.newChatButton.addEventListener("click", resetChat);
els.questionInput.addEventListener("input", autoResizeTextarea);
els.questionInput.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    els.chatForm.requestSubmit();
  }
});
els.chatForm.addEventListener("submit", event => {
  event.preventDefault();
  const question = els.questionInput.value;
  if (!question.trim()) return;
  els.questionInput.value = "";
  autoResizeTextarea();
  askQuestion(question);
});

bindSuggestionButtons();
renderFiles();
renderStats();
