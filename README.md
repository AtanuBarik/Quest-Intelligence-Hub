# Quest Intelligence Hub - Insights Copilot

**Insights Copilot** is a zero-cost, browser-based document agent for asking questions about project files such as Final Reports, Expert Transcripts, Survey Data, PowerPoint decks, Word documents, spreadsheets, notes, and supporting evidence.

It does not require a paid ChatGPT or Microsoft Copilot API. The browser parses uploaded files locally, retrieves relevant evidence, and then chooses the appropriate local processing tool for the question.

## How the local agent works

1. The user uploads one or more project files using **Choose files** or drag-and-drop.
2. The browser parses the files and splits readable content into evidence chunks.
3. The agent classifies the question as direct QA, quantitative, summary, or comparison.
4. It retrieves the most relevant passages from the uploaded files.
5. Direct and quantitative questions use a local extractive QA model.
6. Summaries and comparisons use a small local text-to-text model over retrieved evidence.
7. A grounding check rejects weak synthesis and falls back to direct evidence extraction.
8. The answer shows supporting source chips including PDF page, PowerPoint slide, or spreadsheet sheet when available.
9. If the files do not support the question, the agent does not answer from outside knowledge.

## Local AI models

The frontend uses Transformers.js with:

- `Xenova/distilbert-base-uncased-distilled-squad` for direct question answering.
- `Xenova/flan-t5-small` for local summaries and comparisons.

The model files are downloaded by the browser when first needed and may be reused from browser cache. No OpenAI API key, ChatGPT API subscription, Vercel backend, Copilot Studio capacity, or per-question API payment is required for this mode.

## Supported project files

- PDF - page-aware source labels
- DOCX - Word documents
- PPTX - PowerPoint slides with slide-aware source labels
- XLSX / XLS - Excel workbooks with sheet-aware source labels
- CSV
- JSON
- TXT
- Markdown

Legacy binary `.doc` and `.ppt` files are not parsed by the static browser app. Save them as `.docx` or `.pptx` before uploading.

## Use the chatbot

Open the GitHub Pages site:

`https://atanubarik.github.io/Quest-Intelligence-Hub/`

Then:

1. Click **Choose files**.
2. Select one or more supported project files.
3. Wait until the Knowledge Base shows them as ready.
4. Ask a question about the files.
5. On first use, allow the browser time to download the required local model.
6. Review the answer and source chips.

Example questions:

- What percentage of respondents preferred option A?
- What did experts identify as the main barrier?
- Summarize the most important findings across the report and presentation.
- Compare the survey results with the expert interviews.
- Where do the report and PowerPoint deck disagree?
- What recommendation is supported by the strongest evidence?

## Repository-hosted project files

Non-sensitive project material can also be placed under `project-files/` and listed in `project-files/manifest.json`.

Example:

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

The app loads those files automatically when the page starts. Manual upload remains available.

## Privacy

Uploaded project files are parsed and searched locally in the browser. They are not sent to OpenAI, Microsoft Copilot, or another paid AI API in the zero-cost mode.

The browser does download the JavaScript libraries and pretrained local model files needed for parsing and inference. Those models then run in the browser against retrieved text from the uploaded project files.

**Important:** this GitHub repository is public. Do not commit confidential reports, expert transcripts, respondent-level survey data, personal data, client-confidential material, or other restricted content into `project-files/`. Use browser upload for sensitive material, subject to your organization's data-handling requirements.

## Optional enterprise path

If the organization already has an eligible Microsoft 365 Copilot or Copilot Studio entitlement, a future enterprise version can connect the same frontend concept to a Microsoft agent. That is a separate licensed deployment path and is not required for the zero-cost local-agent mode.
