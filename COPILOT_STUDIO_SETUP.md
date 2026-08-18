# Quest Insight Engine Web app integration

Insights Copilot is configured to embed the published Microsoft Copilot Studio agent **Quest Insight Engine** directly inside the GitHub Pages chatbot panel.

## Current connection

The Web app iframe URL supplied from Copilot Studio is configured in `copilot-config.js`.

Architecture:

```text
Quest-Intelligence-Hub (GitHub Pages)
        |
        | iframe
        v
Microsoft Copilot Studio Web app
        |
        v
Quest Insight Engine
        |
        +--> knowledge sources configured in the agent
        +--> topics, actions, and agent instructions
```

The existing **Local uploaded files** engine remains available as a separate fallback for browser-only analysis of PDF, DOCX, PPTX, XLSX/XLS, CSV, JSON, TXT, and Markdown files.

## Why iframe is used

Copilot Studio supplied a Web app embed snippet containing an iframe. The repository uses the iframe URL directly instead of storing a Direct Line secret or trying to recreate the Copilot chat protocol in the browser.

No Direct Line secret, API key, client secret, password, or bearer token is stored in the repository.

## How to use

1. Publish Quest Insight Engine in Copilot Studio.
2. In Copilot Studio, open **Channels > Web app**.
3. Copy the current embed code if the agent URL changes.
4. Update only `embedUrl` in `copilot-config.js`.
5. Open the GitHub Pages site.
6. Select **Quest Insight Engine** to use the embedded Microsoft agent.
7. Select **Local uploaded files** to use browser-side file analysis instead.

## Important file-upload distinction

The iframe URL supplied by Copilot Studio includes `enableFileAttachment=false`, so the Microsoft agent's embedded chat does not provide file attachment in the iframe.

The file uploader on the left side of Insights Copilot belongs to **Local uploaded files** mode only. Those files are parsed in the browser and are not automatically sent to Quest Insight Engine.

If Quest Insight Engine should answer from project files, add the approved files to the knowledge source configured for that Microsoft agent, such as an approved SharePoint or OneDrive location, subject to your organization's policies.

## Security warning

Microsoft's Web app embed code is available for the no-authentication web experience. Treat the embedded agent as publicly reachable if the GitHub Pages site is public.

Do not expose confidential PMR reports, expert transcripts, respondent-level survey data, client information, credentials, or internal-only knowledge through a no-authentication public agent.

For sensitive/internal deployment, use the authenticated Copilot Studio / Microsoft Entra integration pattern and an access-controlled host rather than public GitHub Pages.

## New chat

When **Quest Insight Engine** mode is selected, the **New chat** button reloads the Microsoft iframe and starts a fresh embedded session.
