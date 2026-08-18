const CONFIG = window.QUEST_COPILOT_CONFIG || {};

const ELEMENTS = {
  copilotMode: document.getElementById("copilotModeButton"),
  localMode: document.getElementById("localModeButton"),
  engineStatus: document.getElementById("engineStatusNote"),
  composerNote: document.getElementById("composerNote"),
  chat: document.getElementById("chatBody"),
  form: document.getElementById("chatForm"),
  question: document.getElementById("questionInput"),
  send: document.getElementById("sendButton"),
  newChat: document.getElementById("newChatButton"),
  template: document.getElementById("messageTemplate"),
  status: document.getElementById("privacyStatus"),
};

const STATE = {
  mode: "local",
  directLine: null,
  directLineSubscription: null,
  connecting: null,
  pending: null,
  userId: `quest-hub-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`,
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function configured() {
  return Boolean(
    CONFIG.enabled &&
    typeof CONFIG.tokenEndpoint === "string" &&
    /^https:\/\//i.test(CONFIG.tokenEndpoint.trim())
  );
}

function agentName() {
  return CONFIG.agentName || "Quest Insight Engine";
}

function setTopStatus(text, mode = "ready") {
  if (!ELEMENTS.status) return;
  ELEMENTS.status.classList.remove("status-ready", "status-loading", "status-error");
  ELEMENTS.status.classList.add(`status-${mode}`);
  ELEMENTS.status.innerHTML = `<span class="status-dot"></span>${escapeHtml(text)}`;
}

function appendMessage(role, html) {
  const fragment = ELEMENTS.template.content.cloneNode(true);
  const article = fragment.querySelector(".message");
  const avatar = fragment.querySelector(".message-avatar");
  const label = fragment.querySelector(".message-label");
  const text = fragment.querySelector(".message-text");
  article.classList.add(role);
  avatar.textContent = role === "assistant" ? "MS" : "You";
  label.textContent = role === "assistant" ? agentName() : "You";
  text.innerHTML = role === "assistant" ? html : `<p>${escapeHtml(html)}</p>`;
  ELEMENTS.chat.appendChild(fragment);
  ELEMENTS.chat.scrollTop = ELEMENTS.chat.scrollHeight;
}

function renderSetupRequired() {
  appendMessage(
    "assistant",
    `<p><strong>${escapeHtml(agentName())} is not connected yet.</strong></p>` +
      `<p>Open <code>copilot-config.js</code> and paste the Copilot Studio <strong>Token Endpoint</strong>, then set <code>enabled: true</code>. Do not paste a Direct Line secret into GitHub.</p>`
  );
}

function regionalSettingsUrl(tokenEndpoint) {
  const marker = "/powervirtualagents";
  const markerIndex = tokenEndpoint.indexOf(marker);
  if (markerIndex < 0) throw new Error("The configured Copilot Studio token endpoint format is not recognized.");
  const url = new URL(tokenEndpoint);
  const apiVersion = url.searchParams.get("api-version");
  if (!apiVersion) throw new Error("The Copilot Studio token endpoint is missing api-version.");
  return `${tokenEndpoint.slice(0, markerIndex)}/powervirtualagents/regionalchannelsettings?api-version=${encodeURIComponent(apiVersion)}`;
}

function collectCardText(value, output = []) {
  if (!value) return output;
  if (Array.isArray(value)) {
    value.forEach((item) => collectCardText(item, output));
    return output;
  }
  if (typeof value !== "object") return output;
  for (const [key, item] of Object.entries(value)) {
    if (["text", "title", "subtitle"].includes(key) && typeof item === "string" && item.trim()) {
      output.push(item.trim());
    } else if (typeof item === "object") {
      collectCardText(item, output);
    }
  }
  return output;
}

function activityText(activity) {
  const parts = [];
  if (typeof activity?.text === "string" && activity.text.trim()) parts.push(activity.text.trim());
  for (const attachment of activity?.attachments || []) {
    collectCardText(attachment?.content, parts);
  }
  return [...new Set(parts)].join("\n\n");
}

function settlePendingSoon() {
  if (!STATE.pending || !STATE.pending.parts.length) return;
  clearTimeout(STATE.pending.settleTimer);
  STATE.pending.settleTimer = setTimeout(() => {
    if (!STATE.pending) return;
    const pending = STATE.pending;
    STATE.pending = null;
    clearTimeout(pending.timeoutTimer);
    pending.resolve([...new Set(pending.parts)].join("\n\n"));
  }, 900);
}

function onActivity(activity) {
  if (!STATE.pending) return;
  if (activity?.type !== "message") return;
  if (activity?.from?.id === STATE.userId) return;
  const text = activityText(activity);
  if (!text) return;
  STATE.pending.parts.push(text);
  settlePendingSoon();
}

async function connect() {
  if (STATE.directLine) return STATE.directLine;
  if (STATE.connecting) return STATE.connecting;
  if (!configured()) throw new Error("Quest Insight Engine is not configured.");
  if (!window.WebChat?.createDirectLine) throw new Error("Microsoft Bot Framework Web Chat failed to load.");

  STATE.connecting = (async () => {
    setTopStatus(`Connecting to ${agentName()}...`, "loading");
    const tokenEndpoint = CONFIG.tokenEndpoint.trim();
    const [regionalResponse, tokenResponse] = await Promise.all([
      fetch(regionalSettingsUrl(tokenEndpoint), { cache: "no-store" }),
      fetch(tokenEndpoint, { cache: "no-store" }),
    ]);
    if (!regionalResponse.ok) throw new Error(`Regional channel settings failed (${regionalResponse.status}).`);
    if (!tokenResponse.ok) throw new Error(`Copilot token request failed (${tokenResponse.status}).`);

    const regional = await regionalResponse.json();
    const conversation = await tokenResponse.json();
    const directLineUrl = regional?.channelUrlsById?.directline;
    if (!directLineUrl) throw new Error("Copilot Studio did not return a Direct Line URL.");
    if (!conversation?.token) throw new Error("Copilot Studio did not return a conversation token.");

    STATE.directLine = window.WebChat.createDirectLine({
      domain: `${directLineUrl}v3/directline`,
      token: conversation.token,
    });
    STATE.directLineSubscription = STATE.directLine.activity$.subscribe({
      next: onActivity,
      error: (error) => console.error("Copilot Direct Line activity error", error),
    });

    STATE.directLine.postActivity({
      type: "event",
      name: "startConversation",
      channelData: { postBack: true },
      from: { id: STATE.userId },
      locale: navigator.language || "en-US",
    }).subscribe({ error: (error) => console.warn("Unable to send startConversation event", error) });

    setTopStatus(`${agentName()} connected`, "ready");
    return STATE.directLine;
  })();

  try {
    return await STATE.connecting;
  } catch (error) {
    setTopStatus(`${agentName()} connection failed`, "error");
    throw error;
  } finally {
    STATE.connecting = null;
  }
}

function resetConnection() {
  if (STATE.pending) {
    clearTimeout(STATE.pending.settleTimer);
    clearTimeout(STATE.pending.timeoutTimer);
    STATE.pending.reject(new Error("Conversation reset."));
    STATE.pending = null;
  }
  STATE.directLineSubscription?.unsubscribe?.();
  STATE.directLineSubscription = null;
  STATE.directLine?.end?.();
  STATE.directLine = null;
  STATE.connecting = null;
}

async function askCopilot(question) {
  const directLine = await connect();
  if (STATE.pending) throw new Error("Please wait for the current agent response to finish.");

  const response = new Promise((resolve, reject) => {
    const timeoutTimer = setTimeout(() => {
      if (!STATE.pending) return;
      STATE.pending = null;
      reject(new Error(`${agentName()} did not respond before the timeout.`));
    }, Number(CONFIG.responseTimeoutMs) || 45000);
    STATE.pending = { resolve, reject, parts: [], settleTimer: null, timeoutTimer };
  });

  directLine.postActivity({
    type: "message",
    from: { id: STATE.userId },
    text: question,
    locale: navigator.language || "en-US",
  }).subscribe({
    error: (error) => {
      if (!STATE.pending) return;
      const pending = STATE.pending;
      STATE.pending = null;
      clearTimeout(pending.timeoutTimer);
      pending.reject(error);
    },
  });

  return response;
}

function formatAgentAnswer(text) {
  return `<p>${escapeHtml(text).replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;
}

function renderCopilotWelcome() {
  ELEMENTS.chat.innerHTML = `<div class="welcome-card" id="welcomeCard">
    <div class="copilot-avatar">MS</div>
    <h2>Ask ${escapeHtml(agentName())}</h2>
    <p>Questions in this mode are sent to your Microsoft Copilot Studio agent and answered using the knowledge and actions configured in that agent.</p>
    <div class="suggestion-grid">
      <button class="suggestion">What are the most important project findings?</button>
      <button class="suggestion">Summarize the latest PMR evidence.</button>
      <button class="suggestion">What themes recur across expert interviews?</button>
      <button class="suggestion">What evidence supports the recommendations?</button>
    </div>
  </div>`;
}

function refreshModeUi() {
  const copilot = STATE.mode === "copilot";
  ELEMENTS.copilotMode?.classList.toggle("active", copilot);
  ELEMENTS.localMode?.classList.toggle("active", !copilot);
  ELEMENTS.copilotMode?.setAttribute("aria-pressed", String(copilot));
  ELEMENTS.localMode?.setAttribute("aria-pressed", String(!copilot));

  if (copilot) {
    ELEMENTS.engineStatus.textContent = configured()
      ? `${agentName()} mode: questions go to Copilot Studio. Uploaded browser files are not automatically sent to the agent.`
      : `${agentName()} mode is not configured yet. Add the Copilot Studio Token Endpoint in copilot-config.js.`;
    ELEMENTS.composerNote.textContent = configured()
      ? `Connected mode: the question is sent to ${agentName()} through a short-lived Copilot Studio conversation token.`
      : "Setup required: add the Copilot Studio Token Endpoint. Never add a Direct Line secret to this public repository.";
    ELEMENTS.question.placeholder = configured()
      ? `Ask ${agentName()}...`
      : "Configure Quest Insight Engine, or switch to Local uploaded files...";
  } else {
    ELEMENTS.engineStatus.textContent = "Local uploaded-files mode: files stay in the browser and the local document agent answers only from those files.";
    ELEMENTS.composerNote.textContent = "Local mode: uploaded files are parsed and processed in the browser. No Copilot Studio connection is used.";
    ELEMENTS.question.placeholder = "Ask a question about the files you uploaded...";
  }
}

function setMode(mode) {
  if (!["copilot", "local"].includes(mode)) return;
  STATE.mode = mode;
  refreshModeUi();
  if (mode === "copilot") {
    renderCopilotWelcome();
    if (configured()) setTopStatus(`${agentName()} mode selected`, "ready");
    else setTopStatus("Copilot setup required - local fallback available", "error");
  } else {
    setTopStatus("Local uploaded-files mode", "ready");
    document.getElementById("newChatButton")?.click();
  }
}

async function handleCopilotQuestion(question) {
  const trimmed = String(question || "").trim();
  if (!trimmed) return;
  document.getElementById("welcomeCard")?.remove();
  appendMessage("user", trimmed);
  if (!configured()) {
    renderSetupRequired();
    return;
  }
  ELEMENTS.send.disabled = true;
  try {
    const answer = await askCopilot(trimmed);
    appendMessage("assistant", formatAgentAnswer(answer));
  } catch (error) {
    console.error(error);
    appendMessage(
      "assistant",
      `<p><strong>${escapeHtml(agentName())} could not answer.</strong></p><p>${escapeHtml(error?.message || "Connection error")}</p><p>You can switch to <strong>Local uploaded files</strong> and continue using the browser-side document agent.</p>`
    );
  } finally {
    ELEMENTS.send.disabled = false;
  }
}

ELEMENTS.copilotMode?.addEventListener("click", () => setMode("copilot"));
ELEMENTS.localMode?.addEventListener("click", () => setMode("local"));

ELEMENTS.form?.addEventListener("submit", (event) => {
  if (STATE.mode !== "copilot") return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const question = ELEMENTS.question.value;
  if (!question.trim()) return;
  ELEMENTS.question.value = "";
  ELEMENTS.question.style.height = "auto";
  handleCopilotQuestion(question);
}, true);

document.addEventListener("click", (event) => {
  if (STATE.mode !== "copilot") return;
  const suggestion = event.target.closest?.(".suggestion");
  if (!suggestion) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  handleCopilotQuestion(suggestion.textContent);
}, true);

ELEMENTS.newChat?.addEventListener("click", (event) => {
  if (STATE.mode !== "copilot") return;
  event.preventDefault();
  event.stopImmediatePropagation();
  resetConnection();
  renderCopilotWelcome();
  if (configured()) setTopStatus(`${agentName()} new conversation`, "ready");
}, true);

const initialMode = configured() && CONFIG.defaultMode === "copilot" ? "copilot" : "local";
STATE.mode = initialMode;
refreshModeUi();
if (initialMode === "copilot") {
  renderCopilotWelcome();
  setTopStatus(`${agentName()} ready to connect`, "ready");
}
