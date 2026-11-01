# Certosa MCP — incremental local archive engine · 0.0.4-alpha.1

Read, search and edit local archives without opening Certosa or a browser.
This release adds **author only**: readable, searchable and editable through a
revision-bound proposal. Existing unknown metadata is preserved.

## Formats and compatibility

- `.certosa` retains its current CRTS2 format and existing reader/writer.
- `.certosa-db` is a separate encrypted working archive: individually compressed
  pages, encrypted full-text index/history and immutable deduplicated 3 MiB media
  chunks. Small edits update only the affected records.

`import_archive` creates a separate incremental copy after local file selection
and password entry. It preserves the original. `export_archive` creates a
compatible `.certosa` copy within legacy limits: 256 MiB stored, 512 MiB expanded
JSON, 10,000 pages/notebook, 100,000 page-array entries/archive. Oversized exports
fail completely without dropping content. `backup_archive` instead creates a
consistent encrypted `.certosa-db` snapshot, retaining its password; tested above
1 GiB. Existing destinations are never overwritten. The current Certosa app does
not directly open `.certosa-db`; export is needed for old-format interoperability.

## Install and connect

Node.js 22.13+, Windows PowerShell and Windows Forms. Verified on Windows x64
with Node 22.23.4. The pinned native SQLite dependency includes prebuilds for
this platform, so install scripts are unnecessary. Other platforms and physical
phones are not qualified. Set TEMP/TMP/TMPDIR and npm/Node caches inside the
approved project before installing or running.

```sh
npm ci --ignore-scripts
node src/archive-setup.mjs --project /absolute/project --out /absolute/project/certosa-archives
```

Setup preserves existing runtimes and produces Codex TOML and Claude JSON
examples containing paths only. Configure a local MCP stdio client with:

```json
{"mcpServers":{"certosa_archives":{"command":"node","args":["/absolute/repo/src/archive-mcp-server.mjs","/absolute/project/certosa-archives/archive-engine.json"],"env":{"TEMP":"/absolute/project/certosa-archives/.tmp","TMP":"/absolute/project/certosa-archives/.tmp","TMPDIR":"/absolute/project/certosa-archives/.tmp","NODE_COMPILE_CACHE":"/absolute/project/certosa-archives/cache-node"}}}}
```

Ask the chat to open or import a Certosa archive. The tool returns immediately
while a native Windows window requests the file, password and notebook consent.
No password or archive path is a tool argument. Consent lasts 15 minutes and can
be read-only. Incremental files must be inside the configured project. Legacy
files selected outside it use an encrypted working copy announced locally.
`close_archive` releases the local key and revokes access.

System notebooks, trash, `sensitivity: secret` and `localCredential` notebooks
are excluded. A title such as Passwords alone does not classify data: exclude
unclassified credential notebooks locally. No personal credential executor is
provided. Authorised requested excerpts are visible to the chat and its provider.

## Fourteen tools

- `open_archive`, `import_archive`, `get_archive_status`, `close_archive`.
- `list_notebooks`, `read_notebook`, `search_notebooks`, `count_word`.
- `prepare_edit`, `prepare_author_edit`, `read_proposal`, `apply_proposal`.
- `export_archive`, `backup_archive`.

`count_word` computes exact whole-word totals in authorised pages and notes,
excluding titles/trash. Returned locations are bounded; the total is exact.
HTML is parsed as data; model edits insert escaped plain text. Prepare/review a
proposal at the current revision before applying it. Never automatically retry
a write after an uncertain outcome: read back first.

## Encryption and recovery

The new backend uses SQLite3 Multiple Ciphers with non-legacy SQLCipher settings:
AES-256-CBC/HMAC-SHA512, PBKDF2-SHA512 with 600,000 iterations, encrypted header,
catalogue, media, FTS, history and WAL. SQL temporary storage stays in memory;
there is no plaintext SQLite fallback. Legacy CRTS2 retains PBKDF2-SHA256 and
gzip before AES-256-GCM. Passwords/keys stay in a separate local execution
process. A failed executor requires a fresh unlock/consent, without write replay.

Transactions check revisions and retain the previous record in encrypted history.
Restore is currently a local engine API, tested in an isolated copy, not an MCP
tool. Restore itself creates a recovery point. Interrupted imports are never
published as complete archives. No automatic history/media deletion is performed.
Open databases may have `-wal`/`-shm` files: do not copy the main file alone while
open. Use `backup_archive` for a consistent encrypted snapshot.

Media originals remain byte-identical. Compression is selected when beneficial,
without lossy transcoding. SQLite can occupy more space than the legacy format;
the measured benefit is granular writes rather than a universal size reduction.

## Validation and boundaries

66 domain/engine tests plus 23 legacy SDK checks, 19 incremental SDK checks and
5 boot/restart checks cover encryption, incorrect passwords/tamper, scopes,
concurrency, interrupted transactions/imports, recovery and native-format roundtrips.
The heavy benchmark is separate from `npm test`: 10 synthetic notebooks, 40,000
pages and a real 1 GiB pseudorandom media stream, fully read back with a checksum.
A page plus author edit writes 86,552 bytes of WAL without changing media chunks;
the optimised run peaked around 237 MiB RSS. These are PC/H-drive measurements,
not mobile performance guarantees. Run `node --expose-gc tests/benchmark_large_archive.mjs`;
set `CERTOSA_BENCHMARK_SNAPSHOT=1` to include a full encrypted snapshot.

```sh
npm test
```

The owner previously verified the legacy Windows file/password/consent flow and
file read/search/write. New import/backup flows use injected UI in automated
tests and are not claimed owner-accepted. No power-loss, provider-account,
remote gateway or directory submission qualification. The package contains no
archive, runtime, browser profile, password or content log. Code is MIT;
installed dependencies retain their own licences. The old synthetic browser lab
remains in [LIVE-LAB.md](LIVE-LAB.md). See the [Italian guide](README.it.md) and
[distribution/submission status](DISTRIBUTION.md).
