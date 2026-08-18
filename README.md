# Quest Intelligence Hub — Insights Copilot

**Insights Copilot** is a GitHub Pages-ready, evidence-grounded chatbot for asking questions across project materials such as Final Reports, Expert Transcripts, Survey Data, supporting evidence and research notes.

## What it does

- Upload and analyze PDF, DOCX, XLSX/XLS, CSV, JSON, TXT and Markdown files.
- Parse files directly in the browser.
- Break project material into searchable evidence chunks.
- Rank evidence against the user's question.
- Return concise, extractive answers with file/page/sheet citations where available.
- Keep user-uploaded files in the browser session rather than sending them to a remote AI service.
- Auto-load repository-hosted project files through `project-files/manifest.json` once paths are added there.

## Repository-hosted project files

Place project material under `project-files/` and add each file path to `project-files/manifest.json`.

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

When the site loads, Insights Copilot will attempt to load and index those files automatically. Users can still add additional files through drag-and-drop or the upload control.

## Supported formats

- PDF — page-aware citations
- DOCX
- XLSX / XLS — sheet-aware citations
- CSV
- JSON
- TXT
- Markdown

PDF, DOCX and spreadsheet parsing use browser libraries loaded from public CDNs. The site therefore needs internet access for those parsers unless they are vendored into the repository later.

## Run locally

Serve the repository through an HTTP server rather than opening `index.html` directly:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## GitHub Pages

In GitHub repository settings, enable Pages from the `main` branch and root folder after this feature is merged.

## Privacy and security

This implementation deliberately does **not** embed an OpenAI or other LLM API key in the public frontend. Uploaded files are processed in the browser. If a generative-model backend is added later, keep credentials server-side and send only approved retrieval context to that backend.

## Current answer mode

The current version uses local lexical retrieval plus extractive synthesis. It is designed to stay grounded in supplied project evidence and avoid inventing unsupported findings. A secure server-side LLM/RAG layer can be added later without changing the user-facing Insights Copilot workflow.
