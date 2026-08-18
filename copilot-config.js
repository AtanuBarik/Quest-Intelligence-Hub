// Quest Insight Engine connection settings.
//
// IMPORTANT:
// - Put ONLY the Copilot Studio Web/Custom Website TOKEN ENDPOINT here.
// - NEVER put a Direct Line secret, client secret, password, or API key in this public repository.
// - The token endpoint is the value Microsoft provides for browser/web-channel integration.
window.QUEST_COPILOT_CONFIG = Object.freeze({
  enabled: false,
  agentName: "Quest Insight Engine",
  tokenEndpoint: "",
  defaultMode: "copilot",
  responseTimeoutMs: 45000
});
