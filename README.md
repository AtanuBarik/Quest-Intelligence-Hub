# Quest Intelligence Hub — Insights Copilot

**Insights Copilot** is a free, evidence-grounded project-file chatbot for asking questions across Final Reports, Expert Transcripts, Survey Data, supporting evidence and research notes.

It does **not** use a paid AI API. It processes the project files in the browser, retrieves the most relevant evidence, and generates a concise answer from that evidence only.

## How it works

1. Project files are parsed in the browser.
2. The content is split into searchable evidence chunks.
3. The user's question is matched against the most relevant chunks.
4. The local response engine selects the strongest supporting sentences and synthesizes them into an answer.
5. The answer cites the corresponding file, PDF page or spreadsheet sheet where available.
6. If the loaded files do not contain enough evidence, Insights Copilot says so instead of answering from outside knowledge.

## No API key or paid service required

Insights Copilot runs directly in the browser and requires no OpenAI API key, ChatGPT API subscription, serverless backend or per-question payment.

The only external resources used by the frontend are free browser libraries/CDNs for reading PDF, DOCX and spreadsheet formats.

## Supported project files

- PDF — page-aware source labels
- DOCX
- XLSX / XLS — sheet-aware source labels
- CSV
- JSON
- TXT
- Markdown

## Use the chatbot

Open the GitHub Pages site:

`https://atanubarik.github.io/Quest-Intelligence-Hub/`

Then:

1. Upload one or more project files.
2. Wait until the files are indexed in the Knowledge Base panel.
3. Ask a question in the Insights Copilot chat box.
4. Review the generated answer and its cited source chips.

Example questions:

- What are the most important findings?
- What themes recur across expert interviews?
- What does the survey data say about customer priorities?
- Where do the sources disagree?
- What evidence supports this recommendation?

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

When the site loads, Insights Copilot attempts to load and index those files automatically. Users can still add additional files using drag-and-drop or the upload control.

## Privacy

Browser-uploaded project files are processed locally in the user's browser. The application does not send the project content to OpenAI or another paid AI service.

**Important:** this GitHub repository is public. Do not commit confidential reports, expert transcripts, respondent-level survey data, personal data, client-confidential material or other restricted content into `project-files/`. For sensitive material, use the browser upload feature instead.

## Grounding behavior

The response engine is intentionally evidence-constrained. It is designed to:

- answer from the currently loaded project files only;
- prioritize evidence matching the user's question;
- retain PDF page and spreadsheet sheet locations where available;
- diversify evidence across source files;
- surface relevant quantitative findings and contrasting statements;
- show source citations for the evidence used;
- decline when the loaded files do not sufficiently support an answer.

Because this version does not use a large language model, its responses are more extractive and structured than ChatGPT. The advantage is that it is free, private for browser uploads, and tightly grounded in the project evidence.
