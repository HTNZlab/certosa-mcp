# Install Certosa Archives · 0.0.6-alpha.3

[Italian instructions](INSTALL.it.md)

Certosa Archives connects encrypted notebooks to a chat through MCP. It gives
the host/model instructions to recognise `.certosa` files, request local unlock,
search/edit notebooks and save a validated app-compatible copy. A model needs
an MCP-capable host; this package does not change model weights.

## Download and verify

Official release downloads:

- [Windows MCPB](https://certosa.htnzlab.it/downloads/mcp/0.0.6-alpha.3/certosa-archives-0.0.6-alpha.3-windows.mcpb)
- [Portable ZIP](https://certosa.htnzlab.it/downloads/mcp/0.0.6-alpha.3/certosa-archives-0.0.6-alpha.3-windows-portable.zip)
- [Source ZIP](https://certosa.htnzlab.it/downloads/mcp/0.0.6-alpha.3/certosa-mcp-0.0.6-alpha.3-source.zip)
- [SHA256SUMS](https://certosa.htnzlab.it/downloads/mcp/0.0.6-alpha.3/SHA256SUMS)

Compare each downloaded file's SHA-256 with `SHA256SUMS`. Publishing these files
does not install the connector in any client. GitHub release availability is
not required for these official downloads:

```powershell
Get-FileHash ./certosa-archives-0.0.6-alpha.3-windows.mcpb -Algorithm SHA256
```

Opening an older `.certosa-db` may rebuild its local search index to preserve
paragraph boundaries. This updates derived search data only; pages, media,
metadata, history and the content revision remain unchanged. It does not
convert the archive format.

Use the updated Certosa 0.3.8 build to restore PDF and WAV attachments. Export
checks the MIME types supported by the app. Preserving attachments does not
provide PDF text search, OCR or audio transcription.

Windows x64 / Node 22.23.4 is tested. Node 22.13+ and Windows PowerShell / Windows
Forms are required for local file selection, password and consent. Archives,
runtime, backups and temporary files stay in your chosen working folder.
This project keeps all working data and caches on H.

## Claude Desktop on Windows

Use `certosa-archives-0.0.6-alpha.3-windows.mcpb`. In Claude Desktop open
Settings → Extensions → Advanced settings → Install Extension, select the file
and follow the prompts. Choose an existing local archive working folder.
Do not enter an archive password in extension settings.

Dependencies and the encrypted SQLite native module are bundled. The client
needs a compatible Node runtime; the manifest declares Node 22.13+. Organisation
policy may block custom extensions. Official MCPB 2.1.2 builds and validates this
bundle; extracted bundles are tested through the real MCP SDK. Installation in
a particular Claude account remains a separate check.

## ChatGPT desktop, Codex and local-model MCP hosts

Extract `certosa-archives-0.0.6-alpha.3-windows-portable.zip` into a stable project
directory. Node 22.13+ is required. Dependencies are included; no global npm
installation is needed. Create a working folder, then generate examples:

```powershell
node <extracted-folder>/src/desktop-config.mjs --project H:/ArchiveWorkspace
```

The folder must already exist. The command preserves existing files and creates
`H:/ArchiveWorkspace/certosa-client-configs`:

| File | Use |
| --- | --- |
| `chatgpt-codex.toml` | MCP section for supported local ChatGPT/Codex clients. Merge while preserving other settings; project configuration requires a trusted project. |
| `claude-desktop.json` | Manual stdio alternative to the Claude extension. |
| `mcp-local.json` | Command, arguments and environment for a local-model host with stdio MCP support. |

ChatGPT desktop also provides Settings → MCP servers → Add server. Choose STDIO,
enter the generated command/arguments/environment, save and restart the connection.
Available features depend on client surface and account policy. Local configuration
does not automatically connect ChatGPT web or cloud tasks.

The generator does not change client settings or open archives. For manual setup:

```text
node <extracted-folder>/src/desktop-entry.mjs H:/ArchiveWorkspace
```

Use the generated environment settings too. Runtime data go under
`<working-folder>/.certosa-connectors/0.0.6-alpha.3`; there is no silent fallback
to another disk. No Windows file association is registered. Recognition uses
MCP instructions, descriptions, prompts and the included skill. Hosts that do
not read instructions can use the skill or `certosa://archive-workflow` resource.

## First use

Ask: “Open a copy of my Certosa archive.” Choose it in the native Windows window.
Enter the password **only there**, then authorise the notebooks you need. For
new notebooks, enable “Consenti anche la creazione di nuovi quaderni”. Creation-only
consent can be given without granting existing notebooks. Consent expires after
30 minutes of inactivity. Successful authorised operations restart that interval;
status/capabilities polling and handshakes do not. An already running operation
counts as activity and may finish, but explicit revocation still prevents commit.
Failed operations do not renew consent. Expiry or revocation requires new local
unlock and consent; never send the password to the chat. Exported-file
passwords may differ from browser-library passwords.

Example request:

> Create a 300-page notebook called My stack manual, in Arial, with an author
> and table of contents. Update two pages of the authorised notebook too.
> Show the proposal, apply it, read it back and save a compatible Certosa copy.

The 19 tools include atomic batches of up to 100 operations / 200,000 new text
characters, revision checks and encrypted recovery. New notebooks use distinct
series titles; extra volumes of existing series are not yet exposed here.
No delete or automatic history/media cleanup is provided. Text edits preserve
existing notes, attachments and other fields.

Formatted pages use `read_page_blocks` and `prepare_paragraph_edit`: hash-bound UTF-16 text ranges, exact expected text and typed normal/title/heading/bullet/quote styles. Untouched markup, inline styles, notes and media remain unchanged; inserted text inherits the first affected run. Legacy `replace` refuses rich HTML. Nested blocks and ranges removing line breaks are explicitly unsupported.

Local processing does not make the chat offline. Authorised extracts go to the MCP host and may reach its provider. The connector cannot control host networking or retention; verified local/offline client and model are required for private offline use. Revocation cannot withdraw already delivered extracts.

## Validate and save an app-compatible archive

Paragraph styling requires `styleEditable: true` on `div.p` and the Certosa 0.3.8
frontend. The prior public 0.3.7 frontend cannot display the new styles and may
strip their attributes on import. Legacy `div`/`p` text remains editable. Native
archive roundtrip verification is separate from rendering/import behavior in
older frontends.

1. Read back committed changes.
2. Call `validate_archive`: schema, media checksums/references, legacy size
   budget and the original Certosa import planner are checked locally.
3. Call `export_archive`. Choose a new destination and export password in the
   native window. Existing destinations are never overwritten.
4. Wait for `get_archive_status.lastExport` to report:

```json
{"status":"saved","format":"certosa/2","nativeReaderVerified":true,"nativeImportPlanVerified":true,"allValuesPreserved":true}
```

The engine writes an encrypted temporary file, reopens it with original Certosa
Zip/Copia functions and compares every serialised value before publication.
The output is genuine CRTS2 `.certosa`, not a renamed database. The source is
retained. This verifies the included current reader/import functions; future
versions, rendering performance and devices have their own tests.

Existing `.certosa` archives remain readable. `.certosa-db` is a separate working
format that the current app does not open directly. `backup_archive` preserves
that format and password. Do not copy the main database alone while it is open:
WAL sidecars may contain commits.

Compatible export limits: 256 MiB stored / 512 MiB expanded JSON, 10,000 pages
per notebook and 100,000 page-array entries. Oversized archives are rejected
completely; content is never truncated. Keep an encrypted native backup for
larger archives. A format roundtrip does not qualify the app renderer for
thousands of pages on a physical phone.

## Privacy, recovery and removal

Passwords stay in the native local execution process, never in chat, tool
arguments, URLs or configuration. Requested authorised excerpts are visible to
the chat/provider. The connector requires no LLM API key.

Do not automatically replay a write after an uncertain outcome: inspect status
and contents first. Close the archive when finished. To remove the connector,
disable its extension or MCP configuration entry; keep the working folder and
backups. No uninstall step deletes notebooks.

The Certosa artwork supplied by the project owner is used unchanged for branding.
The MIT licence covers the code; dependency and artwork notices remain separate.

## Verification and official references

81 repository tests pass. Both extracted bundles are checked for real SDK
startup, the bundled native encrypted database, atomic creation/editing, native
export/readback and preservation of the source. The owner previously verified
native unlock/import/backup. No provider-account acceptance or directory
submission is claimed.

Official references checked on 1 November 2026:

- [ChatGPT desktop and Codex MCP](https://learn.chatgpt.com/docs/extend/mcp).
- [Claude Desktop local extensions](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop).
- [MCPB specification](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md).
- [OpenAI desktop-only submission](https://developers.openai.com/plugins/deploy/desktop-only): local-server submissions require approved-partner access. GitHub distribution is independent of directory publication.
