# Certosa MCP — standalone local archive engine

Version **0.0.3-alpha.2** opens and edits `.certosa` files directly, without the
Certosa application, browser, PWA or IndexedDB. Archives stay on the device.
The existing CRTS2 format is retained: PBKDF2-SHA256, gzip before AES-256-GCM,
and an authenticated header. No new storage format or archive migration.

## Install and configure

Requires Node.js22+. The local file/password/consent window currently requires
Windows PowerShell and Windows Forms. Other operating systems fail closed for
local unlock; they are not claimed supported by the desktop interaction flow.
Set TEMP/TMP/TMPDIR and npm/Node caches inside your approved project first.

```sh
npm ci --ignore-scripts
node src/archive-setup.mjs --project /absolute/project --out /absolute/project/certosa-archives
```

The setup preserves existing runtimes. It prepares local Codex TOML/Claude JSON
examples containing paths only. Configure an MCP stdio client with:

```json
{"mcpServers":{"certosa_archives":{"command":"node","args":["/absolute/repo/src/archive-mcp-server.mjs","/absolute/project/certosa-archives/archive-engine.json"],"env":{"TEMP":"/absolute/project/certosa-archives/.tmp","TMP":"/absolute/project/certosa-archives/.tmp","TMPDIR":"/absolute/project/certosa-archives/.tmp","NODE_COMPILE_CACHE":"/absolute/project/certosa-archives/cache-node"}}}}
```

Ask the chat to **open a Certosa archive**. `open_archive` responds immediately
while a native local window asks you to select a `.certosa` file, unlock it and
select the notebooks to authorise for15minutes. No notebooks are selected by
default. Files inside the configured project are updated directly. For a selected file
outside it, the local unlock window announces an encrypted working copy under
<runtime>/archives. Edits affect that copy and leave the original untouched;
even a historical clear export is encrypted before writing the working copy. The file
password can differ from the browser library password. Historical clear exports
are accepted with a locally chosen password protecting subsequent saves.

Passwords never enter tool arguments, results, URLs, logs or configuration.
The native helper sends its result through an anonymous local pipe to the key
derivator. Keys remain in the local service and are released on close/expiry.
No Certosa app, browser profile or provider API key is needed for the engine.
The service survives reconnecting a chat client. `close_archive` revokes access.

## Tools

- `open_archive`, `get_archive_status`, `close_archive`.
- `list_notebooks`, `read_notebook`, `search_notebooks`, `count_word`.
- `prepare_edit`, `read_proposal`, `apply_proposal`.

The model cannot pass a filesystem path or password to `open_archive`.
Read/search/write scope is granted by the owner locally. A read-only option is
available. System notebooks, trash and notebooks with `sensitivity: secret` or
`localCredential` are excluded from generic tools. A title such as Passwords
alone does not classify data: exclude unclassified credential notebooks from
the local consent selection. No personal secret retrieval/use executor is
provided by this archive engine. The old browser fixture demo remains separate.

`count_word` computes exact whole-word totals across authorised pages and notes,
excluding titles and trash. Case-insensitive by default; locations are bounded
but totals are exact. Search reuses Certosa's text search. HTML is parsed as data,
never executed. Model edits supply escaped plain text rather than executable HTML.

## Writes and recovery

Read the revision, prepare/review a proposal, then apply it once. Before commit,
the engine checks source bytes, revision and permissions. A cooperative lock
coordinates engine writers. It creates an encrypted recovery copy, writes and
flushes an encrypted temporary file on the same filesystem, and replaces the
original. Notes, attachments, unknown fields and excluded notebooks are preserved.
The updated file can be read/imported by Certosa's existing format functions.
An already-open browser database is not implicitly updated from this file.

Never automatically repeat a write after timeout or an uncertain outcome: read
back first. Backups are retained; this release does not automatically delete them.
The lock/hash checks do not provide collaborative editing with external programs
that ignore the lock. A stale lock after a hard crash requires local verification;
it is not silently removed. File operations remain inside the configured project.

## Capacity and roadmap

Experimental limits:256MiB file,512MiB expanded JSON,10,000pages/notebook and
100,000page-array entries/archive. This is a compatibility release, not a GB-scale
qualification. The current format authenticates/decrypts the whole payload and
recompresses/re-encrypts the archive for each write; full recovery copies also
consume space. Increasing a page-count constant does not solve those costs.

Large illustrated books need work/edition metadata (authors, translators,
illustrators, provenance/rights), semantic chapter anchors and image placements
independent of reflowed page numbers. These catalogue features are not implemented.
An incremental encrypted catalogue plus immutable encrypted media blocks is a
candidate backend to benchmark. Original media should remain unchanged; derived
previews are separate. No storage migration is performed in this release.

## Validation and boundaries

50 domain/engine tests,23 SDK stdio-to-file checks and5 service boot/restart checks
cover original-format interoperation, password/tamper rejection, local consent,
scopes, exact counting, encrypted writes/recovery, field/media preservation,
conflicts, failed replacement, lock/expiry, junction confinement and reconnects.
All archives/credentials are synthetic. An owner run also completed native Windows file/password/consent and chat
read/search/count/write with full readback on the authored sample. This remains
separate from injected UI providers in automated tests. No physical-phone, GB-scale,
provider-account, remote-web gateway or directory submission is claimed.

```sh
npm test
```

The package contains source/contracts/docs only: no app, archive, browser profile,
private history, pairing, runtime, password or content logs. Code is MIT; see LICENSE
and dependency notices. Native crypto/search test support comes from Certosa.

The earlier browser-based synthetic lab remains documented in [LIVE-LAB.md](LIVE-LAB.md).
See [Italian guide](README.it.md) and [distribution/submission status](DISTRIBUTION.md).
