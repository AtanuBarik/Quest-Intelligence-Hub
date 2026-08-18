# Quest Intelligence Hub - Insights Copilot

**Insights Copilot** now supports two response engines in the same frontend:

1. **Quest Insight Engine** - connects to the Microsoft Copilot Studio agent through the supported web-channel Token Endpoint.
2. **Local uploaded files** - processes project files in the browser with no paid API and answers only from those uploaded files.

The Microsoft connection is intentionally disabled until a valid Copilot Studio Token Endpoint is configured. No Direct Line secret or other credential is stored in this repository.

## Microsoft Copilot Studio mode

The frontend includes `copilot-bridge.js` and `copilot-config.js`.

When configured, questions sent in **Quest Insight Engine** mode are delivered to the Copilot Studio agent over a short-lived Direct Line conversation token obtained from the Microsoft Token Endpoint. The existing UI is retained; the agent becomes the response engine.

See **[COPILOT_STUDIO_SETUP.md](COPILOT_STUDIO_SETUP.md)** for the exact configuration steps and security guidance.

### Configuration

Edit `copilot-config.js`:

```js
window.QUEST_COPILOT_CONFIG = Object.freeze({
  enabled: true,
  agentName: "Quest Insight Engine",
  tokenEndpoint: "PASTE_THE_COPILOT_STUDIO_TOKEN_ENDPOINT_HERE",
  defaultMode: "copilot",
  responseTimeoutMs: 45000
});
```

**Never commit a Direct Line secret, client secret, API key, password, or long-lived bearer token.**

## Local uploaded-files mode

The browser-side document agent remains available as a fallback and for files that are uploaded directly by a user.

Workflow:

1. Upload project files using **Choose files** or drag-and-drop.
2. The browser parses and chunks the readable content.
3. The local agent classifies the question as direct QA, quantitative, summary, or comparison.
4. Relevant evidence is retrieved.
5. Local browser models answer or synthesize from that evidence only.
6. The response shows file, PDF page, PowerPoint slide, or Excel sheet sources where available.

Uploaded browser files are **not automatically sent to Quest Insight Engine**. If the Microsoft agent should answer from governed project documents, add those documents to its approved knowledge sources such as SharePoint or OneDrive.

## Supported local file types

- PDF - page-aware source labels
- DOCX - Word documents
- PPTX - PowerPoint slides with slide-aware source labels
- XLSX / XLS - Excel workbooks with sheet-aware source labels
- CSV
- JSON
- TXT
- Markdown

Legacy binary `.doc` and `.ppt` files should be saved as `.docx` or `.pptx` before upload.

## Local AI models

The local mode uses Transformers.js with:

- `Xenova/distilbert-base-uncased-distilled-squad` for direct question answering.
- `Xenova/flan-t5-small` for summaries and comparisons.

These run in the browser and require no OpenAI API key or paid inference backend.

## Use the chatbot

GitHub Pages:

`https://atanubarik.github.io/Quest-Intelligence-Hub/`

Select the response engine in the chat header:

- **Quest Insight Engine** for Copilot Studio knowledge and actions once configured.
- **Local uploaded files** for browser-only project-file analysis.

## Security and privacy

This repository and its GitHub Pages site are public.

- Do not store secrets in repository files.
- Do not commit confidential reports, expert transcripts, respondent-level survey data, personal data, or client-confidential material to `project-files/`.
- A no-authentication Copilot web channel should not expose sensitive enterprise knowledge on a public website.
- For internal/sensitive deployments, use your organization's approved Microsoft Entra ID / Copilot Studio authenticated integration and access-controlled hosting.

## Repository-hosted project files

Non-sensitive project files can optionally be listed in `project-files/manifest.json`:

```json
{
  "files": [
    "project-files/final-report.pdf",
    "project-files/expert-transcripts.docx",
    "project-files/survey-data.xlsx",
    "project-files/management-presentation.pptx"
  ]
}
```

The local document agent loads those files automatically when the page starts.
