# Quest Intelligence Hub - Insights Copilot

**Insights Copilot** provides two response modes in the same frontend:

1. **Quest Insight Engine** - embeds the published Microsoft Copilot Studio Web app directly inside the chatbot panel.
2. **Local uploaded files** - processes project files in the browser with no paid inference API and answers only from those uploaded files.

## Quest Insight Engine mode

The Microsoft agent is configured in `copilot-config.js` using the Web app iframe URL copied from Copilot Studio **Channels > Web app**.

The frontend does not store or use a Direct Line secret, API key, client secret, password, or long-lived bearer token.

When **Quest Insight Engine** is selected, the chat panel displays the Microsoft Copilot Studio agent itself. The Microsoft iframe owns the message box and conversation UI in this mode.

See **[COPILOT_STUDIO_SETUP.md](COPILOT_STUDIO_SETUP.md)** for integration and security details.

## Local uploaded-files mode

The browser-side document agent remains available for ad-hoc project-file analysis.

Workflow:

1. Upload project files using **Choose files** or drag-and-drop.
2. The browser parses and chunks the readable content.
3. The local agent classifies the question as direct QA, quantitative, summary, or comparison.
4. Relevant evidence is retrieved.
5. Local browser models answer or synthesize from that evidence only.
6. The response shows file, PDF page, PowerPoint slide, or Excel sheet sources where available.

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

## File upload and Microsoft Copilot

The Web app iframe supplied by Copilot Studio currently includes `enableFileAttachment=false`. Therefore, the Microsoft agent does not expose its own file-upload control in the embedded chat.

The uploader in the left panel belongs to **Local uploaded files** mode. Browser-uploaded files are not automatically sent to Quest Insight Engine.

If Quest Insight Engine should answer from project documents, add those approved documents to the knowledge sources configured for the Microsoft agent, such as an approved SharePoint or OneDrive location.

## Use the chatbot

GitHub Pages:

`https://atanubarik.github.io/Quest-Intelligence-Hub/`

- Select **Quest Insight Engine** to use the embedded Copilot Studio agent.
- Select **Local uploaded files** to analyze files directly in the browser.
- In Quest Insight Engine mode, **New chat** reloads the Microsoft Web app to start a fresh conversation.

## Local AI models

Local uploaded-files mode uses Transformers.js with:

- `Xenova/distilbert-base-uncased-distilled-squad` for direct question answering.
- `Xenova/flan-t5-small` for summaries and comparisons.

These run in the browser and require no OpenAI API key or paid inference backend.

## Security and privacy

This repository and its GitHub Pages site are public.

The Copilot Studio Web app embed experience is suitable only when the agent's authentication and knowledge exposure match that public deployment. Do not expose confidential PMR reports, expert transcripts, respondent-level survey data, client information, internal-only material, or credentials through a no-authentication public agent.

For sensitive enterprise use, move to an authenticated Microsoft Entra / Copilot Studio deployment and an access-controlled host.

Do not commit confidential project files into this public repository. The local browser upload option can be used for ad-hoc local analysis, subject to your organization's data-handling requirements.
