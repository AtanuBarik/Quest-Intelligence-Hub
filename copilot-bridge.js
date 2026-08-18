const CONFIG = window.QUEST_COPILOT_CONFIG || {};

const ELEMENTS = {
  copilotMode: document.getElementById("copilotModeButton"),
  localMode: document.getElementById("localModeButton"),
  engineStatus: document.getElementById("engineStatusNote"),
  chat: document.getElementById("chatBody"),
  form: document.getElementById("chatForm"),
  newChat: document.getElementById("newChatButton"),
  status: document.getElementById("privacyStatus"),
  frameHost: document.getElementById("copilotFrameHost"),
  frame: document.getElementById("copilotFrame"),
};

const STATE = {
  mode: "local",
  frameLoaded: false,
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function agentName() {
  return CONFIG.agentName || "Quest Insight Engine";
}

function configured() {
  return Boolean(
    CONFIG.enabled &&
    CONFIG.connectionMode === "iframe" &&
    typeof CONFIG.embedUrl === "string" &&
    /^https:\/\/copilotstudio\.microsoft\.com\//i.test(CONFIG.embedUrl.trim())
  );
}

function setTopStatus(text, mode = "ready") {
  if (!ELEMENTS.status) return;
  ELEMENTS.status.classList.remove("status-ready", "status-loading", "status-error");
  ELEMENTS.status.classList.add(`status-${mode}`);
  ELEMENTS.status.innerHTML = `<span class="status-dot"></span>${escapeHtml(text)}`;
}

function loadCopilotFrame(forceReload = false) {
  if (!configured() || !ELEMENTS.frame) return;
  const url = CONFIG.embedUrl.trim();
  if (forceReload) {
    STATE.frameLoaded = false;
    ELEMENTS.frame.src = "about:blank";
    window.setTimeout(() => {
      ELEMENTS.frame.src = url;
      setTopStatus(`Loading ${agentName()}...`, "loading");
    }, 50);
    return;
  }
  if (!ELEMENTS.frame.src || ELEMENTS.frame.src === "about:blank") {
    ELEMENTS.frame.src = url;
    setTopStatus(`Loading ${agentName()}...`, "loading");
  }
}

function refreshModeUi() {
  const copilot = STATE.mode === "copilot";
  ELEMENTS.copilotMode?.classList.toggle("active", copilot);
  ELEMENTS.localMode?.classList.toggle("active", !copilot);
  ELEMENTS.copilotMode?.setAttribute("aria-pressed", String(copilot));
  ELEMENTS.localMode?.setAttribute("aria-pressed", String(!copilot));

  if (ELEMENTS.frameHost) ELEMENTS.frameHost.hidden = !copilot;
  if (ELEMENTS.chat) ELEMENTS.chat.hidden = copilot;
  if (ELEMENTS.form) ELEMENTS.form.hidden = copilot;

  if (copilot) {
    if (ELEMENTS.engineStatus) {
      ELEMENTS.engineStatus.textContent = configured()
        ? `${agentName()} is embedded from Microsoft Copilot Studio. Use the chat box inside the Microsoft agent below.`
        : `${agentName()} is not configured. Switch to Local uploaded files.`;
    }
    if (configured()) {
      loadCopilotFrame();
      setTopStatus(STATE.frameLoaded ? `${agentName()} ready` : `Loading ${agentName()}...`, STATE.frameLoaded ? "ready" : "loading");
    } else {
      setTopStatus("Copilot setup required - local fallback available", "error");
    }
  } else {
    if (ELEMENTS.engineStatus) {
      ELEMENTS.engineStatus.textContent = "Local uploaded-files mode: files stay in the browser and the local document agent answers only from those files.";
    }
    setTopStatus("Local uploaded-files mode", "ready");
  }
}

function setMode(mode) {
  if (!["copilot", "local"].includes(mode)) return;
  STATE.mode = mode;
  refreshModeUi();
}

ELEMENTS.copilotMode?.addEventListener("click", () => setMode("copilot"));
ELEMENTS.localMode?.addEventListener("click", () => setMode("local"));

ELEMENTS.frame?.addEventListener("load", () => {
  if (!configured() || ELEMENTS.frame.src === "about:blank") return;
  STATE.frameLoaded = true;
  if (STATE.mode === "copilot") setTopStatus(`${agentName()} ready`, "ready");
});

ELEMENTS.newChat?.addEventListener("click", (event) => {
  if (STATE.mode !== "copilot") return;
  event.preventDefault();
  event.stopImmediatePropagation();
  loadCopilotFrame(true);
}, true);

const initialMode = configured() && CONFIG.defaultMode === "copilot" ? "copilot" : "local";
STATE.mode = initialMode;
refreshModeUi();
