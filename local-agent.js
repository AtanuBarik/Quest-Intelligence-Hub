const STATE = {
  docs: [],
  chunks: [],
  qa: null,
  generator: null,
  qaLoading: null,
  generatorLoading: null,
  qaFailed: false,
  generatorFailed: false,
};

const QA_MODEL = "Xenova/distilbert-base-uncased-distilled-squad";
const GENERATOR_MODEL = "Xenova/flan-t5-small";
const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";

const STOP_WORDS = new Set(
  "a an and are as at be been being but by can could did do does for from had has have how i if in into is it its may might more most of on or our should so than that the their them there these they this those to was we were what when where which who why will with would you your about across based please tell say says".split(" ")
);

const UI = {
  fileInput: document.getElementById("fileInput"),
  browse: document.getElementById("browseFilesButton"),
  dropZone: document.getElementById("dropZone"),
  fileList: document.getElementById("fileList"),
  fileCount: document.getElementById("fileCount"),
  chunkCount: document.getElementById("chunkCount"),
  wordCount: document.getElementById("wordCount"),
  clearFiles: document.getElementById("clearFilesButton"),
  chat: document.getElementById("chatBody"),
  form: document.getElementById("chatForm"),
  question: document.getElementById("questionInput"),
  send: document.getElementById("sendButton"),
  newChat: document.getElementById("newChatButton"),
  template: document.getElementById("messageTemplate"),
  status: document.getElementById("privacyStatus"),
};

const compactNumber = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

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
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function fileExtension(name) {
  const parts = String(name).toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() : "file";
}

function splitSentences(text) {
  return (normalizeText(text).replace(/\n+/g, " ").match(/[^.!?]+(?:[.!?]+|$)/g) || [])
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 25);
}

function sourceLabel(chunk) {
  return chunk.locator && chunk.locator !== "Document"
    ? `${chunk.fileName} - ${chunk.locator}`
    : chunk.fileName;
}

function setStatus(text, mode = "ready") {
  UI.status.classList.remove("status-ready", "status-loading", "status-error");
  UI.status.classList.add(`status-${mode}`);
  UI.status.innerHTML = `<span class="status-dot"></span>${escapeHtml(text)}`;
}

function showBanner(text) {
  hideBanner();
  const banner = document.createElement("div");
  banner.id = "processingBanner";
  banner.className = "processing-banner";
  banner.textContent = text;
  UI.chat.prepend(banner);
}

function hideBanner() {
  document.getElementById("processingBanner")?.remove();
}

function makeChunks(text, fileName, locator, documentId, target = 1250, overlap = 180) {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const chunks = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + target, normalized.length);
    if (end < normalized.length) {
      const boundary = normalized.lastIndexOf(" ", end);
      if (boundary > start + target * 0.65) end = boundary;
    }
    const value = normalized.slice(start, end).trim();
    if (value) {
      const tokens = tokenize(value);
      chunks.push({
        id: `chunk-${Date.now()}-${Math.random()}`,
        documentId,
        fileName,
        locator,
        text: value,
        tokens,
        tokenSet: new Set(tokens),
      });
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
    const text = content.items.map((item) => item.str).join(" ");
    if (text.trim()) sections.push({ text, locator: `Page ${pageNumber}` });
  }
  return sections;
}

async function parseDocx(file) {
  if (!window.mammoth) throw new Error("DOCX parser unavailable.");
  const result = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return [{ text: result.value, locator: "Document" }];
}

async function parseWorkbook(file) {
  if (!window.XLSX) throw new Error("Spreadsheet parser unavailable.");
  const workbook = window.XLSX.read(await file.arrayBuffer(), {
    type: "array",
    cellDates: true,
  });
  return workbook.SheetNames.map((sheetName) => ({
    text: window.XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName], { blankrows: false }),
    locator: `Sheet: ${sheetName}`,
  })).filter((section) => section.text.trim());
}

function numericSuffix(path) {
  const match = path.match(/(\d+)(?=\.xml$)/);
  return match ? Number(match[1]) : 0;
}

async function parsePptx(file) {
  if (!window.JSZip) throw new Error("PowerPoint parser unavailable.");
  const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
  const slidePaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
    .sort((a, b) => numericSuffix(a) - numericSuffix(b));
  const sections = [];
  for (const path of slidePaths) {
    const xml = await zip.files[path].async("text");
    const documentXml = new DOMParser().parseFromString(xml, "application/xml");
    const textNodes = [...documentXml.getElementsByTagNameNS("*", "t")];
    const text = textNodes.map((node) => node.textContent || "").join(" ").trim();
    if (text) sections.push({ text, locator: `Slide ${numericSuffix(path)}` });
  }
  return sections;
}

async function parseText(file) {
  const extension = fileExtension(file.name);
  let text = await file.text();
  if (extension === "json") {
    try {
      text = JSON.stringify(JSON.parse(text), null, 2);
    } catch (_) {
      // Keep readable raw JSON when parsing fails.
    }
  }
  return [{ text, locator: "Document" }];
}

async function parseFile(file) {
  const extension = fileExtension(file.name);
  if (extension === "pdf") return parsePdf(file);
  if (extension === "docx") return parseDocx(file);
  if (["xlsx", "xls"].includes(extension)) return parseWorkbook(file);
  if (extension === "pptx") return parsePptx(file);
  if (["txt", "md", "csv", "json"].includes(extension)) return parseText(file);
  if (["doc", "ppt"].includes(extension)) {
    throw new Error(`Legacy .${extension} is not supported in-browser. Save it as .${extension}x and upload again.`);
  }
  throw new Error(`Unsupported file type: .${extension}`);
}

function renderFiles() {
  const ready = STATE.docs.filter((doc) => doc.ready);
  UI.fileCount.textContent = ready.length;
  UI.chunkCount.textContent = compactNumber.format(STATE.chunks.length);
  UI.wordCount.textContent = compactNumber.format(
    ready.reduce((sum, doc) => sum + doc.wordCount, 0)
  );

  if (!STATE.docs.length) {
    UI.fileList.innerHTML = '<div class="empty-files">No project files loaded yet.</div>';
    return;
  }

  UI.fileList.innerHTML = STATE.docs.map((doc) => {
    const type = escapeHtml(fileExtension(doc.name).toUpperCase().slice(0, 5));
    const meta = doc.error
      ? escapeHtml(doc.error)
      : doc.ready
        ? `${doc.chunkCount} evidence chunks`
        : "Reading file...";
    return `<div class="file-row ${doc.error ? "error" : ""}">
      <div class="file-type">${type}</div>
      <div>
        <div class="file-name" title="${escapeHtml(doc.name)}">${escapeHtml(doc.name)}</div>
        <div class="file-meta">${meta}</div>
      </div>
      <button class="file-remove" type="button" data-remove="${doc.id}" aria-label="Remove ${escapeHtml(doc.name)}">x</button>
    </div>`;
  }).join("");

  UI.fileList.querySelectorAll("[data-remove]").forEach((button) => {
    button.onclick = () => {
      STATE.docs = STATE.docs.filter((doc) => doc.id !== button.dataset.remove);
      STATE.chunks = STATE.chunks.filter((chunk) => chunk.documentId !== button.dataset.remove);
      renderFiles();
      if (!STATE.chunks.length) setStatus("Upload files to begin");
    };
  });
}

async function addFiles(fileList) {
  const files = [...(fileList || [])];
  if (!files.length) return;
  showBanner(`Reading and indexing ${files.length} project file${files.length === 1 ? "" : "s"}...`);
  UI.send.disabled = true;

  for (const file of files) {
    if (STATE.docs.some((doc) => doc.name === file.name && doc.size === file.size)) continue;
    const document = {
      id: `doc-${Date.now()}-${Math.random()}`,
      name: file.name,
      size: file.size,
      ready: false,
      error: null,
      chunkCount: 0,
      wordCount: 0,
    };
    STATE.docs.push(document);
    renderFiles();
    try {
      const sections = await parseFile(file);
      const chunks = sections.flatMap((section) =>
        makeChunks(section.text, file.name, section.locator, document.id)
      );
      if (!chunks.length) throw new Error("No readable text was found in this file.");
      STATE.chunks.push(...chunks);
      document.ready = true;
      document.chunkCount = chunks.length;
      document.wordCount = chunks.reduce((sum, chunk) => sum + chunk.tokens.length, 0);
    } catch (error) {
      document.error = error?.message || "File could not be read.";
    }
    renderFiles();
  }

  hideBanner();
  UI.send.disabled = false;
  UI.fileInput.value = "";
  const count = STATE.docs.filter((doc) => doc.ready).length;
  if (count) setStatus(`${count} file${count === 1 ? "" : "s"} ready for local agent`);
}

function queryIntent(question) {
  const lower = question.toLowerCase();
  if (/summar|overview|key findings|main findings|important findings|top findings|themes?/.test(lower)) return "summary";
  if (/compare|comparison|versus|\bvs\b|difference|disagree|conflict|contradict/.test(lower)) return "comparison";
  if (/percent|percentage|how many|how much|number|rate|share|average|mean|median|survey/.test(lower)) return "quantitative";
  return "direct";
}

function retrievalScore(chunk, question, tokens, documentFrequency) {
  let score = 0;
  const lowerName = chunk.fileName.toLowerCase();
  const lowerText = chunk.text.toLowerCase();
  for (const token of tokens) {
    const occurrences = chunk.tokens.reduce((sum, value) => sum + (value === token ? 1 : 0), 0);
    const df = documentFrequency.get(token) || 0;
    const idf = Math.log(1 + (STATE.chunks.length + 1) / (df + 1));
    score += Math.min(occurrences, 8) * idf;
    if (lowerName.includes(token)) score += 2;
  }
  const phrase = question.toLowerCase().trim();
  if (phrase.length > 8 && lowerText.includes(phrase)) score += 8;
  return score;
}

function retrieve(question, limit = 7) {
  if (!STATE.chunks.length) return [];
  const tokens = tokenize(question);
  const df = new Map();
  for (const token of [...new Set(tokens)]) {
    df.set(token, STATE.chunks.reduce((count, chunk) => count + (chunk.tokenSet.has(token) ? 1 : 0), 0));
  }

  let ranked = STATE.chunks.map((chunk) => ({
    chunk,
    score: retrievalScore(chunk, question, tokens, df),
  })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);

  const intent = queryIntent(question);
  if (!ranked.length && ["summary", "comparison"].includes(intent)) {
    ranked = STATE.chunks.map((chunk) => ({ chunk, score: 0.5 }));
  }

  const selected = [];
  const perDocument = new Map();
  for (const item of ranked) {
    const used = perDocument.get(item.chunk.documentId) || 0;
    if (used >= 3) continue;
    selected.push(item);
    perDocument.set(item.chunk.documentId, used + 1);
    if (selected.length >= limit) break;
  }
  return selected;
}

function bestSupportingSentence(text, question, answer = "") {
  const sentences = splitSentences(text);
  const answerLower = answer.toLowerCase();
  const exact = sentences.find((sentence) => answerLower && sentence.toLowerCase().includes(answerLower));
  if (exact) return exact;
  const queryTokens = new Set(tokenize(question));
  return sentences.sort((a, b) => {
    const scoreA = tokenize(a).filter((token) => queryTokens.has(token)).length;
    const scoreB = tokenize(b).filter((token) => queryTokens.has(token)).length;
    return scoreB - scoreA;
  })[0] || text.slice(0, 360);
}

async function importTransformers() {
  const mod = await import(TRANSFORMERS_URL);
  mod.env.allowLocalModels = false;
  return mod;
}

async function getQaModel() {
  if (STATE.qa) return STATE.qa;
  if (STATE.qaFailed) throw new Error("Local QA model unavailable.");
  if (STATE.qaLoading) return STATE.qaLoading;
  STATE.qaLoading = (async () => {
    setStatus("Loading local QA model...", "loading");
    showBanner("Downloading the free local QA model. The first use can take longer; the browser may cache it for later use.");
    try {
      const { pipeline } = await importTransformers();
      STATE.qa = await pipeline("question-answering", QA_MODEL, { dtype: "q8" });
      return STATE.qa;
    } catch (error) {
      console.error(error);
      STATE.qaFailed = true;
      throw error;
    } finally {
      STATE.qaLoading = null;
      hideBanner();
    }
  })();
  return STATE.qaLoading;
}

async function getGenerator() {
  if (STATE.generator) return STATE.generator;
  if (STATE.generatorFailed) throw new Error("Local generator unavailable.");
  if (STATE.generatorLoading) return STATE.generatorLoading;
  STATE.generatorLoading = (async () => {
    setStatus("Loading local synthesis model...", "loading");
    showBanner("Downloading the free local synthesis model for summaries and comparisons.");
    try {
      const { pipeline } = await importTransformers();
      STATE.generator = await pipeline("text2text-generation", GENERATOR_MODEL, { dtype: "q8" });
      return STATE.generator;
    } catch (error) {
      console.error(error);
      STATE.generatorFailed = true;
      throw error;
    } finally {
      STATE.generatorLoading = null;
      hideBanner();
    }
  })();
  return STATE.generatorLoading;
}

function extractiveFallback(question, results, prefix = "The strongest evidence in the uploaded files is:") {
  const queryTokens = new Set(tokenize(question));
  const candidates = [];
  results.forEach((result, resultIndex) => {
    splitSentences(result.chunk.text).forEach((sentence) => {
      candidates.push({
        sentence,
        resultIndex,
        score: tokenize(sentence).filter((token) => queryTokens.has(token)).length + result.score / 4,
      });
    });
  });
  candidates.sort((a, b) => b.score - a.score);
  const selected = [];
  const seen = new Set();
  for (const item of candidates) {
    const key = item.sentence.toLowerCase().replace(/[^a-z0-9]+/g, " ").slice(0, 100);
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(item);
    if (selected.length >= 5) break;
  }

  const sources = [];
  const sourceIndex = new Map();
  const citation = (resultIndex) => {
    const label = sourceLabel(results[resultIndex].chunk);
    if (!sourceIndex.has(label)) {
      sources.push(label);
      sourceIndex.set(label, sources.length);
    }
    return sourceIndex.get(label);
  };

  return {
    html: `<p>${escapeHtml(prefix)}</p><ul>${selected.map((item) =>
      `<li>${escapeHtml(item.sentence)} <strong>[${citation(item.resultIndex)}]</strong></li>`
    ).join("")}</ul>`,
    sources,
  };
}

async function answerDirect(question, results) {
  let qa;
  try {
    qa = await getQaModel();
  } catch (_) {
    return extractiveFallback(question, results, "The local QA model could not load, so here is the strongest direct evidence from the files:");
  }

  showBanner("Agent tool: running question answering over the most relevant file passages...");
  const hits = [];
  try {
    for (let i = 0; i < results.length; i += 1) {
      try {
        const output = await qa(question, results[i].chunk.text, { top_k: 1 });
        const hit = Array.isArray(output) ? output[0] : output;
        const answer = String(hit?.answer || "").trim();
        const score = Number(hit?.score || 0);
        if (answer.length > 1 && score >= 0.025) {
          hits.push({
            answer,
            score,
            resultIndex: i,
            support: bestSupportingSentence(results[i].chunk.text, question, answer),
            combined: score * (1 + Math.min(results[i].score, 8) / 8),
          });
        }
      } catch (error) {
        console.warn(error);
      }
    }
  } finally {
    hideBanner();
  }

  hits.sort((a, b) => b.combined - a.combined);
  const unique = [];
  const seen = new Set();
  for (const hit of hits) {
    const key = hit.answer.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(hit);
    if (unique.length >= 4) break;
  }

  if (!unique.length) {
    return extractiveFallback(question, results, "The local QA model did not find a reliable answer span, so here is the strongest direct evidence:");
  }

  const sources = [];
  const sourceIndex = new Map();
  const citation = (resultIndex) => {
    const label = sourceLabel(results[resultIndex].chunk);
    if (!sourceIndex.has(label)) {
      sources.push(label);
      sourceIndex.set(label, sources.length);
    }
    return sourceIndex.get(label);
  };

  const top = unique[0];
  const topCitation = citation(top.resultIndex);
  let html = `<p><strong>Answer:</strong> ${escapeHtml(top.answer)} <strong>[${topCitation}]</strong></p>`;
  html += `<p><strong>Supporting evidence:</strong> ${escapeHtml(top.support)} <strong>[${topCitation}]</strong></p>`;
  if (unique[1] && unique[1].score >= 0.04) {
    const secondCitation = citation(unique[1].resultIndex);
    html += `<p><strong>Additional evidence:</strong> ${escapeHtml(unique[1].support)} <strong>[${secondCitation}]</strong></p>`;
  }
  html += `<span class="confidence">${top.score >= 0.3 ? "Strong" : top.score >= 0.08 ? "Moderate" : "Low-confidence"} local QA match - grounded in uploaded files</span>`;
  return { html, sources };
}

function synthesisEvidence(results, maxChars = 2600) {
  const pieces = [];
  let used = 0;
  for (let i = 0; i < results.length; i += 1) {
    const label = sourceLabel(results[i].chunk);
    const excerpt = results[i].chunk.text.slice(0, 650);
    const piece = `[${i + 1}] ${label}: ${excerpt}`;
    if (used + piece.length > maxChars && pieces.length >= 2) break;
    pieces.push(piece);
    used += piece.length;
  }
  return pieces.join("\n");
}

function generationLooksGrounded(text, evidence) {
  const generatedTokens = tokenize(text);
  if (!generatedTokens.length) return false;
  const evidenceTokens = new Set(tokenize(evidence));
  const overlap = generatedTokens.filter((token) => evidenceTokens.has(token)).length / generatedTokens.length;
  return overlap >= 0.18;
}

async function answerWithSynthesis(question, results, intent) {
  let generator;
  try {
    generator = await getGenerator();
  } catch (_) {
    return extractiveFallback(question, results, "The local synthesis model could not load, so here are the strongest evidence points from the files:");
  }

  const evidence = synthesisEvidence(results);
  const instruction = intent === "comparison"
    ? "Compare the evidence and explain agreements and differences."
    : "Summarize the most important findings that answer the question.";
  const prompt = `Use ONLY the evidence below. Do not use outside facts. If the evidence is insufficient, say that clearly. ${instruction}\nQuestion: ${question}\nEvidence:\n${evidence}\nAnswer:`;

  showBanner("Agent tool: synthesizing the retrieved evidence locally in your browser...");
  try {
    const output = await generator(prompt, {
      max_new_tokens: 180,
      do_sample: false,
    });
    const item = Array.isArray(output) ? output[0] : output;
    const text = String(item?.generated_text || "").trim();
    if (!text || !generationLooksGrounded(text, evidence)) {
      return extractiveFallback(question, results, "The local synthesis was not sufficiently grounded, so I am returning the strongest direct evidence instead:");
    }
    const sources = [...new Set(results.map((result) => sourceLabel(result.chunk)))].slice(0, 5);
    return {
      html: `<p><strong>Local agent synthesis:</strong></p><p>${escapeHtml(text).replace(/\n/g, "<br>")}</p><span class="confidence">Generated locally from retrieved file evidence; source chips show the passages used</span>`,
      sources,
    };
  } catch (error) {
    console.error(error);
    return extractiveFallback(question, results, "The local synthesis step failed, so here are the strongest direct evidence points:");
  } finally {
    hideBanner();
  }
}

async function runAgent(question) {
  if (!STATE.chunks.length) {
    return {
      html: "<p><strong>No project file is loaded.</strong> Click Choose files or drag files into the upload area, then ask again.</p>",
      sources: [],
    };
  }

  const intent = queryIntent(question);
  const results = retrieve(question, intent === "comparison" ? 8 : 7);
  if (!results.length) {
    return {
      html: "<p>I could not find relevant evidence in the uploaded files for that question. I will not answer from outside knowledge.</p>",
      sources: [],
    };
  }

  setStatus(`Agent plan: ${intent} -> retrieve -> ${["summary", "comparison"].includes(intent) ? "synthesize" : "QA"}`, "loading");
  let response;
  if (["summary", "comparison"].includes(intent)) {
    response = await answerWithSynthesis(question, results, intent);
  } else {
    response = await answerDirect(question, results);
  }
  setStatus(`${STATE.docs.filter((doc) => doc.ready).length} file${STATE.docs.filter((doc) => doc.ready).length === 1 ? "" : "s"} ready - local agent`, "ready");
  return response;
}

function appendMessage(role, html, sources = []) {
  const fragment = UI.template.content.cloneNode(true);
  const article = fragment.querySelector(".message");
  const avatar = fragment.querySelector(".message-avatar");
  const label = fragment.querySelector(".message-label");
  const text = fragment.querySelector(".message-text");
  const sourceContainer = fragment.querySelector(".sources");

  article.classList.add(role);
  avatar.textContent = role === "assistant" ? "AI" : "You";
  label.textContent = role === "assistant" ? "Insights Copilot" : "You";
  text.innerHTML = role === "assistant" ? html : `<p>${escapeHtml(html)}</p>`;
  if (sources.length) {
    sourceContainer.innerHTML = sources.map((source, index) =>
      `<span class="source-chip" title="${escapeHtml(source)}">[${index + 1}] ${escapeHtml(source)}</span>`
    ).join("");
  }
  UI.chat.appendChild(fragment);
  UI.chat.scrollTop = UI.chat.scrollHeight;
}

async function ask(question) {
  const trimmed = String(question || "").trim();
  if (!trimmed) return;
  document.getElementById("welcomeCard")?.remove();
  appendMessage("user", trimmed);
  UI.send.disabled = true;
  try {
    const response = await runAgent(trimmed);
    appendMessage("assistant", response.html, response.sources);
  } catch (error) {
    console.error(error);
    appendMessage("assistant", "<p>A browser-side processing error occurred. Reload the page, re-upload the file, and try again.</p>");
    setStatus("Local agent error", "error");
  } finally {
    UI.send.disabled = false;
  }
}

function bindSuggestions() {
  document.querySelectorAll(".suggestion").forEach((button) => {
    button.onclick = () => ask(button.textContent);
  });
}

function resetChat() {
  UI.chat.innerHTML = `<div class="welcome-card" id="welcomeCard">
    <div class="copilot-avatar">AI</div>
    <h2>Ask your uploaded project files</h2>
    <p>Choose files on the left, then ask a question. The local document agent selects the right processing tools, retrieves relevant evidence, and answers from those files only.</p>
    <div class="suggestion-grid">
      <button class="suggestion">What are the most important findings?</button>
      <button class="suggestion">What themes recur across expert interviews?</button>
      <button class="suggestion">What does the survey data say about customer priorities?</button>
      <button class="suggestion">Where do the sources disagree?</button>
    </div>
  </div>`;
  bindSuggestions();
}

async function loadManifest() {
  try {
    const response = await fetch("project-files/manifest.json", { cache: "no-store" });
    if (!response.ok) return;
    const manifest = await response.json();
    const files = [];
    for (const entry of Array.isArray(manifest.files) ? manifest.files : []) {
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
        // Keep loading the remaining manifest files.
      }
    }
    if (files.length) await addFiles(files);
  } catch (_) {
    // Manual upload remains available.
  }
}

UI.browse.onclick = (event) => {
  event.preventDefault();
  UI.fileInput.click();
};
UI.fileInput.onchange = (event) => addFiles(event.target.files);
["dragenter", "dragover"].forEach((eventName) => {
  UI.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    UI.dropZone.classList.add("is-dragging");
  });
});
["dragleave", "drop"].forEach((eventName) => {
  UI.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    UI.dropZone.classList.remove("is-dragging");
  });
});
UI.dropZone.ondrop = (event) => addFiles(event.dataTransfer.files);
UI.clearFiles.onclick = () => {
  STATE.docs = [];
  STATE.chunks = [];
  renderFiles();
  setStatus("Upload files to begin");
};
UI.newChat.onclick = resetChat;
UI.question.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    UI.form.requestSubmit();
  }
});
UI.question.addEventListener("input", () => {
  UI.question.style.height = "auto";
  UI.question.style.height = `${Math.min(UI.question.scrollHeight, 150)}px`;
});
UI.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const question = UI.question.value;
  if (!question.trim()) return;
  UI.question.value = "";
  UI.question.style.height = "auto";
  ask(question);
});

bindSuggestions();
renderFiles();
loadManifest();
