# Quest Intelligence Hub - Insights Copilot

**Insights Copilot** is a free, browser-based chatbot for asking questions about project files such as Final Reports, Expert Transcripts, Survey Data, spreadsheets, notes, and supporting evidence.

The current version does not use dummy answers and does not call a paid AI API. It parses the uploaded files in the browser, retrieves the most relevant evidence, and runs a local question-answering model over those passages.

## How it works

1. The user uploads project files through the **Choose files** button or drag-and-drop area.
2. The browser parses the files and splits the readable content into evidence chunks.
3. The user's question is matched against the most relevant chunks.
4. Insights Copilot loads a free browser-side question-answering model on the first question.
5. The model answers the question from the retrieved project evidence.
6. The response shows the supporting file and, where available, PDF page or spreadsheet sheet.
7. If the local model cannot load, the app falls back to direct evidence extraction from the uploaded files rather than showing canned content.
8. If the files do not support the question, the chatbot says so instead of using outside knowledge.

## Local AI model

The frontend uses Transformers.js with the `Xenova/distilbert-base-uncased-distilled-squad` question-answering model. The model is downloaded to the browser the first time a question is asked and can then be reused from the browser cache.

No OpenAI API key, ChatGPT API subscription, Vercel backend, or per-question payment is required.

## Supported project files

- PDF - page-aware source labels
- DOCX
- XLSX / XLS - sheet-aware source labels
- CSV
- JSON
- TXT
- Markdown

## Use the chatbot

Open the GitHub Pages site:

`https://atanubarik.github.io/Quest-Intelligence-Hub/`

Then:

1. Click **Choose files**.
2. Select one or more project files.
3. Wait until the Knowledge Base shows the files as ready.
4. Type a question about those files.
5. On the first question, allow the browser time to download the free local QA model.
6. Review the answer and its source chips.

For best results, ask focused questions such as:

- What percentage of respondents preferred option A?
- What reason did experts give for the decline in demand?
- What is the recommended market-entry approach?
- What did the report identify as the primary risk?
- Which customer segment showed the highest interest?

Broader questions such as "What are the most important findings?" are answered by running the local QA model across multiple high-ranking passages and combining the strongest evidence-backed answers.

## Repository-hosted project files

Non-sensitive project material can also be placed under `project-files/` and listed in `project-files/manifest.json`.

Example:

```json
{
  "files": [
    "project-files/final-report.pdf",
    "project-files/expert-transcripts.docx",
    "project-files/survey-data.xlsx"
  ]
}
```

The app loads those files automatically when the page starts. Manual upload remains available.

## Privacy

Uploaded project files are parsed and searched locally in the browser. The project files are not sent to OpenAI or another paid AI service.

The browser does download the Transformers.js library and pretrained QA model from their public hosting/CDN when needed. That model then runs in the browser against the retrieved text passages.

**Important:** this GitHub repository is public. Do not commit confidential reports, expert transcripts, respondent-level survey data, personal data, client-confidential material, or other restricted content into `project-files/`. Use the browser upload option for sensitive material, subject to your organization's data-handling requirements.

## Grounding safeguards

Insights Copilot is designed to:

- answer only from the currently loaded project files;
- retrieve relevant passages before running the QA model;
- keep file, page, and sheet source labels;
- show supporting evidence with the answer;
- avoid outside knowledge when project evidence is missing;
- fall back to direct evidence extraction if the browser-side AI model cannot load.
