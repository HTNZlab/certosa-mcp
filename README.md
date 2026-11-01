# Certosa MCP — local test-library connector

Version 0.0.2-alpha.1 implements a working **local stdio MCP server** backed by
Certosa's real encrypted browser archive in an isolated test profile. It can
search/read the authorised notebook, preview and persist page edits, and use a
fictional credential against a loopback authentication fixture without returning
its value to the model. It is not connected to any provider account or directory.

## Run the local lab

Requires Node.js 22+, a trusted local Certosa PWA folder with `app.html` and its
assets, and an isolated browser profile. Certosa itself is not bundled. Keep all
runtime files, browser profiles, temporary files and caches in your own project.

```sh
git clone https://github.com/HTNZlab/certosa-mcp.git
cd certosa-mcp
npm ci --ignore-scripts
npm test
node src/lab-setup.mjs --project /absolute/project --site /absolute/project/certosa-pwa --out /absolute/project/test-lab --browser /absolute/path/chrome
```

The lab generates a minimal synthetic `Usi Interessanti` notebook. The optional
`--library` argument accepts the matching native single-notebook test archive.
An existing output/profile is preserved. See [full lab instructions](LIVE-LAB.md)
for restarting it and for local MCP client configurations.

In Certosa choose your own local archive password, then Menu → Collega alla chat
· prova → Collega per 15 minuti. Configure a local stdio-capable client to launch
`node src/mcp-server.mjs /absolute/project/test-lab/pairing.json`. Do not copy the
pairing token or archive password into tool arguments or a chat. An already-open
chat may need to reload its MCP configuration; verify its tool inventory.

## What works

- Eight schema-validated MCP tools using the official SDK and stdio transport.
- Scoped list/read/search, with native search and notebook/page/revision references.
- Prepare/review/apply page edits through native encryption and atomic revision checks.
- Append preserves existing formatting; replace writes plain-text paragraphs.
- Notes/attachment metadata are preserved; a pre-write encrypted checkpoint is kept.
- Local undo of the last edit, provided no later write changed the revision.
- Owner consent, expiry, revocation on archive lock/replacement, stale-edit rejection.
- One-use fictional authentication, returning only an opaque handle and fixed status.

27 domain unit tests pass. A separate full-app integration run checks real SDK
client/server communication, browser persistence after reload, undo, conflicts,
failed saves, consent/revocation and a generated credential excluded from the
MCP transcript. These are synthetic headless tests, not physical-phone or
ChatGPT/Claude/Grok account qualification.

Collection proposals remain available in the core library but are not exposed
by this server until their persistence/rendering path is completed. There are
no delete, raw secret read, arbitrary URL, shell or filesystem tools.

## Credential boundary

The browser generates a fictional random value and saves it in a notebook marked
`sensitivity: "secret"` within the encrypted archive. This notebook is excluded
from generic tools. A fixed lab-only executor maps the logical HTTPS fixture
origin to the loopback HTTP test service; this does not qualify external TLS,
redirects or a real website login. No real credential integration is shipped.
The service keeps only a digest in RAM and never logs request bodies. Raw
passwords, cookies, tokens and debug messages are not returned to the model.

Local code with the same user/origin privileges is trusted. The capability core
is not an isolation boundary against malicious code already running there.
Revoking an action after dispatch does not guarantee rollback: its outcome may
be indeterminate. Never automatically retry an uncertain write or authentication.

## Privacy and scope

Only the synthetic library is supported in this alpha. The public Certosa PWA
is unchanged. No personal profile, archive, private Git history or working log
is included in the source or package. There is no content database in the bridge,
telemetry or cloud relay. The browser stores the archive on the device; local
pairing files are created in the operator-selected project. A remote model will
see the notebook excerpts that its authorised tools return. There is no provider
OAuth flow or ChatGPT/Claude/Grok web connector yet. Mobile background suspension
can make the device temporarily unavailable.

See [distribution and provider submission](DISTRIBUTION.md). No submission or
approval is claimed. This is not an official OpenAI, Anthropic or xAI product.
Do not post personal notebooks or credentials in issues.

Code: MIT, copyright 2026 Daniele Nencini per HTNZLab. Search test support is from
the same MIT-licensed Certosa project. [Italiano](README.it.md).
