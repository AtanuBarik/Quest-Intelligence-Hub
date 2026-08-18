# Quest Intelligence Hub — Insights Copilot

**Insights Copilot** is an evidence-grounded research chatbot for asking questions across Final Reports, Expert Transcripts, Survey Data, supporting evidence and research notes. The frontend retrieves the most relevant evidence locally, then uses the OpenAI Responses API to generate a cited answer.

## How it works

1. Project files are parsed in the browser.
2. The files are broken into searchable evidence chunks.
3. The user's question is matched against those chunks.
4. Only the highest-ranking excerpts, the question and limited conversation history are sent to the serverless `/api/chat` route.
5. The server calls OpenAI and instructs the model to answer only from the supplied evidence, cite source numbers, surface conflicts and state when evidence is insufficient.
6. The frontend renders the answer with the corresponding file/page/sheet source labels.

Supported formats: PDF, DOCX, XLSX/XLS, CSV, JSON, TXT and Markdown. PDF citations retain page locations and spreadsheets retain sheet names where available.

## Secure OpenAI integration

The OpenAI API key is never placed in browser code. The serverless route reads it from the deployment environment:

```text
OPENAI_API_KEY=your_server_side_key
OPENAI_MODEL=gpt-5.6
```

`OPENAI_MODEL` is optional. The application defaults to `gpt-5.6`.

The OpenAI request uses the Responses API with `store: false`. Project files themselves remain in the browser; only retrieved excerpts needed for a question are transmitted to the API.

## Deploy the working frontend

This repository now includes a Vercel-compatible serverless function at `api/chat.js`. GitHub Pages alone cannot securely host an OpenAI API secret, so use a serverless host for the ChatGPT-enabled version.

### Vercel

1. Import this GitHub repository into Vercel.
2. Add `OPENAI_API_KEY` under the Vercel project's environment variables.
3. Optionally add `OPENAI_MODEL` to override the default model.
4. Deploy.
5. Open the deployed URL. The header should show `ChatGPT ready` when the backend is configured.

For local serverless development, install the Vercel CLI and run `vercel dev` after creating a local `.env.local` containing your key. `.env.local` is ignored by Git.

## Repository-hosted project files

Place non-sensitive project material under `project-files/` and add each path to `project-files/manifest.json`:

```json
{
  "files": [
    "project-files/final-report.pdf",
    "project-files/expert-transcripts.docx",
    "project-files/survey-data.xlsx"
  ]
}
```

The application will load and index those files automatically. Users can also add additional files with drag-and-drop.

**Important:** this GitHub repository is public. Do not commit confidential reports, expert transcripts, respondent-level survey data, personal data, client-confidential material or other restricted content to `project-files/`. For sensitive material, use browser upload and protect the deployed application with your organization's authentication/access controls.

## Privacy and security behavior

- API credentials stay server-side.
- Browser-uploaded files are parsed locally.
- Only retrieved excerpts are sent to OpenAI for each question.
- The backend caps evidence and conversation payload sizes.
- The model is instructed to treat uploaded evidence as untrusted data, not as executable instructions.
- Responses must cite supplied evidence and should decline to invent unsupported findings.
- `.env` and Vercel local configuration are excluded by `.gitignore`.

For production use, add corporate authentication/SSO, authorization, rate limiting, audit logging and approved data-governance controls around the deployment.
