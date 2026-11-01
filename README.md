# Certosa MCP — pre-alpha

Open-source work toward an MCP adapter for Certosa, the local personal notebook
library. It aims to help people find their notes, resume a task, save a chosen
thought from a chat, and use a local credential without disclosing it to an AI.

**Current release: a tested local capability core, not a runnable MCP server.**
There is no stdio/HTTP transport, remote gateway, OAuth flow, Certosa consent UI,
or persistent write implementation yet. It cannot currently be installed as a
working connector in ChatGPT, Claude or Grok. No directory approval is claimed.

## What is included

- List/read/search only the personal notebooks selected by the local owner.
- Bounded plain-text results with notebook/page/revision references.
- Expiring grants, revocation on archive lock or replacement, revision checks.
- Preview new collections and edits. Proposals stay in memory and do not write.
- Typed tool descriptors and 27 unit checks, including Certosa's search engine.
- A separate one-use credential capability, tested with a mock executor only.

The owner injects an unlocked snapshot, plain-text conversion and local search.
This module has no network, filesystem or database access. It excludes the
system manual and notebooks explicitly marked `sensitivity: "secret"`.
The title "Passwords" alone is not a classification; the app classification UI
is not implemented yet. This is not an isolation boundary against malicious code already
running in the same origin; the future bridge must enforce authentication.

## Try the capability core

Use Node.js 22 or newer. There are no runtime dependencies.

```sh
git clone https://github.com/HTNZlab/certosa-mcp.git
cd certosa-mcp
npm test
```

The prerelease package can be installed as a JavaScript library. Its export is
`createLocalNotebookTools`; supplying an owner adapter is required. There is no
server executable or automatic connection to a browser profile.

## Use a credential without disclosing it

`createLocalSecretCapabilities` is exported by `certosa-mcp/secrets`. The trusted
owner binds a credential ID, HTTPS origin, authentication action, duration and
use limit. The AI receives a short-lived opaque handle. It cannot substitute a
URL, request a raw secret, or receive cookies, tokens or free-form debug output.
The local executor should retrieve and use the credential; the public result
contains only a fixed status. Revocation during an action may leave its external
outcome indeterminate; it does not guarantee rollback.

**No real credential vault, local action executor or browser login is included.**
The tests use fictional credentials and mocked actions. A real executor must
validate the actual destination and redirects, honor revocation, and prevent
secrets from entering logs, screenshots and model-facing messages. A value
merely hidden in the chat UI would not meet this design.

Notebook reading and secret use are separate capabilities. Sensitive notebooks
must be classified and excluded from generic read/search tools before any real
vault integration is enabled. The core is not a security boundary against
malicious code running in its trusted local process.

## Roadmap

1. Test a few human workflows with an independent sample notebook.
2. Add owner consent, durable writes, conflict handling, backup and undo.
3. Implement MCP transport with an official maintained SDK and a device bridge.
4. Test clean installs in each supported client and package the integrations.
5. Submit through the OpenAI and Claude publishing processes when eligible.

See [distribution and submission](DISTRIBUTION.md). GitHub availability and
provider directory acceptance are separate milestones. Local MCP submission
through OpenAI currently requires partner approval; Claude documents a plugin
route for local servers. Do not use older desktop-extension listings as the
current directory submission procedure.

## Privacy

The core has no telemetry and does not persist or transmit notebook contents.
Callers receive the text returned by their granted tools. A remote LLM or
future gateway will see any excerpts sent to it; keeping the archive on the
device does not keep remote processing on the device. Never give the archive
password to a model. Do not post notebooks, passwords or keys in GitHub issues.

Sample libraries, personal profiles, private repository history and working logs
are excluded from this repository and its package. This project is not an
official OpenAI, Anthropic or xAI product.

Code: MIT, copyright 2026 Daniele Nencini per HTNZLab. The search test-support
file comes from the same MIT-licensed Certosa project.
