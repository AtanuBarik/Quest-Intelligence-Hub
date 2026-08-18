# Connect Insights Copilot to Quest Insight Engine

This repository is prepared to connect the Insights Copilot frontend to the Microsoft Copilot Studio agent **Quest Insight Engine** without storing a Direct Line secret in GitHub.

## Architecture

```text
Quest-Intelligence-Hub (GitHub Pages)
        |
        | short-lived conversation token
        v
Copilot Studio Web / Custom Website channel
        |
        v
Quest Insight Engine
        |
        +--> SharePoint / OneDrive / other approved knowledge
        +--> Agent actions and topics
```

The existing **Local uploaded files** engine remains available as a fallback and for browser-only analysis of PDF, DOCX, PPTX, XLSX/XLS, CSV, JSON, TXT, and Markdown.

## Important security rule

**Never put a Direct Line secret, client secret, API key, password, or bearer token in this public repository.**

The frontend configuration accepts only the Copilot Studio **Token Endpoint** intended for browser/web-channel integration.

## Step 1 - Publish Quest Insight Engine

1. Open Microsoft Copilot Studio.
2. Open **Quest Insight Engine**.
3. Test the agent in the Test agent pane.
4. Publish the agent.

## Step 2 - Decide the authentication model

### Prototype / non-sensitive test

If your organization permits it and the agent does not expose confidential information, use the Web / Custom Website channel configuration that provides a browser-usable **Token Endpoint**.

Be aware that a no-authentication web agent can be reachable by people who can access the site. Do not use this mode for confidential PMR, client, expert, respondent, or internal-only content.

### Production / sensitive internal content

If Quest Insight Engine uses Microsoft authentication or must be limited to Evalueserve users, use Microsoft Entra ID / Microsoft 365 Agents SDK or another authenticated hosting pattern. A public GitHub Pages site should not contain secrets and should not be treated as an access-control boundary.

## Step 3 - Get the Token Endpoint

In Copilot Studio, open the agent's channel / web integration settings and copy the **Token Endpoint** for the web/custom website channel.

The value normally resembles a Microsoft Power Platform URL and includes an `api-version` query parameter. Copy the complete URL exactly.

Do **not** copy a Direct Line secret into this repository.

## Step 4 - Configure the repository

Open `copilot-config.js` and update only these values:

```js
window.QUEST_COPILOT_CONFIG = Object.freeze({
  enabled: true,
  agentName: "Quest Insight Engine",
  tokenEndpoint: "PASTE_THE_COPILOT_STUDIO_TOKEN_ENDPOINT_HERE",
  defaultMode: "copilot",
  responseTimeoutMs: 45000
});
```

Commit the change. GitHub Pages can then load the updated configuration.

## Step 5 - Test

Open the GitHub Pages site and select **Quest Insight Engine** in the response-engine selector.

Ask a question that the agent can answer from its configured knowledge, for example:

- What are the key findings from the Customer Journey Mapping research?
- What themes recur across the expert interviews?
- What evidence supports the latest recommendation?

The status pill should progress from the selected agent mode to a connected state when the first question is sent.

## Uploaded files vs Copilot Studio knowledge

Files uploaded in the left panel are processed by the **Local uploaded files** engine and remain in the browser. They are not automatically transmitted to Quest Insight Engine.

If Quest Insight Engine should answer from project documents, the preferred enterprise approach is to add the approved documents to the agent's governed knowledge source (for example SharePoint or OneDrive) rather than uploading confidential content to a public GitHub-hosted site.

## Troubleshooting

### "Quest Insight Engine is not connected yet"

`copilot-config.js` is still disabled or the Token Endpoint is blank.

### Token request or regional channel settings failure

Re-copy the full Token Endpoint from Copilot Studio. Confirm the agent is published and the selected web channel is allowed by your tenant's data-loss-prevention policies.

### Agent works in Copilot Studio but not on the site

Check whether the agent requires Microsoft authentication. The simple Token Endpoint bridge is intended for the supported web-channel integration. Authenticated enterprise deployments may require Entra ID / Agents SDK configuration instead.

### Local uploaded files still work

This is intentional. Switch to **Local uploaded files** at any time to use the browser-only document agent without Copilot Studio.
