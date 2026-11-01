/* Local domain prototype. No transport, filesystem, network or archive writes.
 * The owner supplies a fresh unlocked snapshot and grants; neither is an MCP tool.
 * Write operations are bounded proposals, not executable HTML or direct DB writes.
 */
const SCOPES = new Set(['read', 'search', 'propose_create', 'propose_edit']);
const clone = value => structuredClone(value);
const fail = code => { throw Object.assign(new Error(code), {code}); };
const integer = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
function text(value, max, empty = false) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) fail('INVALID_TEXT');
  return value;
}

export function createLocalNotebookTools({readState, plainText, searchEntries, isSystemNotebook,
  isSensitiveNotebook = nb => nb.sensitivity === 'secret',
  now = () => Date.now(), newId = () => crypto.randomUUID()}) {
  for (const fn of [readState, plainText, searchEntries, isSystemNotebook]) if (typeof fn !== 'function') fail('MISSING_OWNER_ADAPTER');

  // Called only by the trusted local owner, never from remotely supplied arguments.
  function openSession({archiveId, notebookIds = [], permissions = [], ttlMs = 900000}) {
    text(archiveId, 128);
    if (!Array.isArray(notebookIds) || !Array.isArray(permissions) || permissions.some(s => !SCOPES.has(s)) || !integer(ttlMs, 1, 3600000)) fail('INVALID_GRANT');
    const allowed = new Set(notebookIds.map(id => text(id, 128)));
    const granted = new Set(permissions), expiresAt = now() + ttlMs, proposals = new Map();
    let closed = false;
    function close() { closed = true; proposals.clear(); }
    function state(scope) {
      if (closed || now() >= expiresAt) { close(); fail('SESSION_CLOSED'); }
      if (!granted.has(scope)) fail('FORBIDDEN');
      const current = readState();
      if (!current || current.locked) { close(); fail('ARCHIVE_LOCKED'); }
      const s = {...current}; // capture revision even when the owner reuses its state object
      if (s.archiveId !== archiveId) { close(); fail('ARCHIVE_CHANGED'); }
      if (s.busy) fail('ARCHIVE_BUSY');
      if (!integer(s.revision, 0, Number.MAX_SAFE_INTEGER) || !Array.isArray(s.lib?.notebooks) || !Array.isArray(s.lib?.series)) fail('INVALID_OWNER_SNAPSHOT');
      return s;
    }
    const eligible = s => s.lib.notebooks.filter(n => allowed.has(n.id) && !isSystemNotebook(n) && !isSensitiveNotebook(n));
    function find(s, id) { const nb = eligible(s).find(n => n.id === id); if (!nb) fail('NOT_FOUND'); return nb; }
    const title = (s, nb) => s.lib.series.find(series => series.id === nb.sid)?.label || '';
    const author = (s,nb) => String(typeof nb.author==='string'?nb.author:typeof s.lib.series.find(x=>x.id===nb.sid)?.author==='string'?s.lib.series.find(x=>x.id===nb.sid).author:'').slice(0,500);
    const metadata = (s, nb) => ({archiveId, notebookId: nb.id, seriesId: nb.sid, title: title(s, nb), author:author(s,nb), volume: nb.vol, pageCapacity: nb.maxPages, revision: s.revision});
    const source = value => value == null ? undefined : {
      kind: ['chat', 'manual', 'note', 'other'].includes(value.kind) ? value.kind : 'other',
      reference: text(value.reference, 1000),
    };
    function saveProposal(s, scope, operations) {
      if (proposals.size >= 20) fail('TOO_MANY_PROPOSALS');
      const proposal = {id: newId(), archiveId, baseRevision: s.revision, scope, expiresAt,
        status: 'proposal_only', operations};
      proposals.set(proposal.id, clone(proposal));
      return clone(proposal);
    }
    function list_notebooks({offset = 0, limit = 50} = {}) {
      const s = state('read');
      if (!integer(offset, 0, 10000) || !integer(limit, 1, 100)) fail('INVALID_RANGE');
      const list = eligible(s);
      return {items: list.slice(offset, offset + limit).map(nb => metadata(s, nb)),
        nextOffset: offset + limit < list.length ? offset + limit : null};
    }
    function read_notebook({notebookId, startPage = 1, limit = 10}) {
      const s = state('read'), nb = find(s, notebookId);
      if (!integer(startPage, 1, nb.maxPages) || !integer(limit, 1, 20)) fail('INVALID_RANGE');
      const pages = []; let characters = 0, noteCount = 0;
      const boundedText = html => {
        const value = plainText(html || ''); characters += value.length;
        if (characters > 200000) fail('READ_BUDGET_EXCEEDED');
        return value;
      };
      for (let number = startPage; number <= Math.min(nb.maxPages, startPage + limit - 1); number++) {
        const p = nb.pages[number];
        pages.push({number, text: boundedText(p?.html),
          notes: (p?.notes || []).map(n => {
            if (++noteCount > 500) fail('READ_BUDGET_EXCEEDED');
            return {id: n.id, text: boundedText(n.html)};
          })});
      }
      return {...metadata(s, nb), pages};
    }
    async function search_notebooks({query, limit = 25}) {
      const s = state('search'); text(query, 240);
      if (!integer(limit, 1, 50)) fail('INVALID_RANGE');
      const entries = [];
      for (const nb of eligible(s)) {
        entries.push({nbId: nb.id, label: title(s, nb), page: 1, where: 'title', text: title(s, nb)+(author(s,nb)?'\n'+author(s,nb):'')});
        nb.pages.forEach((p, page) => {
          if (!page || !p) return;
          entries.push({nbId: nb.id, page, where: 'page', text: plainText(p.html || '')});
          for (const n of p.notes || []) entries.push({nbId: nb.id, page, where: 'note', noteId: n.id, text: plainText(n.html || '')});
        });
      }
      const result = await searchEntries(entries, query);
      const after = state('search');
      if (after.revision !== s.revision) fail('REVISION_CONFLICT');
      return {archiveId, revision: s.revision, hits: result.hits.slice(0, limit).map(hit => {
        const start = Math.max(0, (hit.ranges?.[0]?.start || 0) - 120);
        return {notebookId: find(after, hit.nbId).id, pageNumber: hit.page, kind: hit.where,
          noteId: hit.noteId, excerpt: hit.text.slice(start, start + 500), excerptStart: start};
      })};
    }
    function prepare_collection({series, provenance}) {
      const s = state('propose_create');
      if (!Array.isArray(series) || !integer(series.length, 1, 20)) fail('INVALID_COLLECTION');
      const origin = source(provenance), titles = new Set();
      let volumes = 0, pages = 0, chars = 0;
      const operations = series.map(group => {
        if (!group || typeof group !== 'object') fail('INVALID_COLLECTION');
        const label = text(group.title, 200).trim();
        const key = label.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ');
        if (titles.has(key)) fail('DUPLICATE_SERIES'); titles.add(key);
        if (!Array.isArray(group.volumes) || !group.volumes.length) fail('INVALID_COLLECTION');
        const notebooks = group.volumes.map(volume => {
          if (!volume || typeof volume !== 'object') fail('INVALID_COLLECTION');
          if (++volumes > 50 || !integer(volume.pageCapacity, 1, 10000) || (pages += volume.pageCapacity) > 100000) fail('COLLECTION_LIMIT');
          const content = volume.content || [];
          if (!Array.isArray(content) || content.length > volume.pageCapacity) fail('INVALID_CONTENT');
          const seen = new Set();
          return {pageCapacity: volume.pageCapacity, content: content.map(page => {
            if (!page || typeof page !== 'object') fail('INVALID_PAGE');
            if (!integer(page.number, 1, volume.pageCapacity) || seen.has(page.number)) fail('INVALID_PAGE');
            seen.add(page.number); const value = text(page.text, 100000, true);
            if ((chars += value.length) > 200000) fail('CONTENT_LIMIT');
            return {number: page.number, text: value, source: source(page.source)};
          })};
        });
        return {type: 'ensure_series_and_create_volumes', title: label, volumes: notebooks,
          contentFormat: 'plain-text', volumeAllocation: 'SeriesLedger-at-commit'};
      });
      const p = saveProposal(s, 'propose_create', operations);
      if (origin) { p.source = origin; proposals.set(p.id, clone(p)); }
      return p;
    }
    function prepare_edit({notebookId, pageNumber, baseRevision, mode, text: value, provenance}) {
      const s = state('propose_edit'), nb = find(s, notebookId);
      if (baseRevision !== s.revision) fail('REVISION_CONFLICT');
      if (!integer(pageNumber, 1, nb.maxPages)) fail('INVALID_PAGE');
      if (!['append', 'replace'].includes(mode)) fail('INVALID_EDIT');
      text(value, 100000, true);
      const before = plainText(nb.pages[pageNumber]?.html || '');
      return saveProposal(s, 'propose_edit', [{type: 'edit_page', notebookId, pageNumber, mode,
        beforeText: before, afterText: mode === 'append' ? before + value : value,
        contentFormat: 'plain-text', source: source(provenance),
        constraints: {preserveNotes: true, preserveAttachments: true, reviewFormattingBeforeCommit: true}}]);
    }
    function read_proposal({proposalId}) {
      const p = proposals.get(proposalId); if (!p) fail('NOT_FOUND');
      const s = state(p.scope);
      for (const operation of p.operations) if (operation.notebookId) find(s, operation.notebookId);
      return {...clone(p), stale: s.revision !== p.baseRevision, currentRevision: s.revision};
    }
    function prepare_author_edit({notebookId,baseRevision,author:value}){
      const s=state('propose_edit'),nb=find(s,notebookId);
      if(baseRevision!==s.revision)fail('REVISION_CONFLICT');
      text(value,500,true);
      return saveProposal(s,'propose_edit',[{type:'set_notebook_author',notebookId,beforeAuthor:author(s,nb),afterAuthor:value.trim()}]);
    }
    return Object.freeze({list_notebooks, read_notebook, search_notebooks, prepare_collection, prepare_edit, prepare_author_edit, read_proposal, close});
  }
  return Object.freeze({openSession});
}
