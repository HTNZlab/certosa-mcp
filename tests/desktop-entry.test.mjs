import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import {Client} from '../node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';import {StdioClientTransport} from '../node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
const root=fileURLToPath(new URL('../',import.meta.url)),project=path.join(root,'verifiche/installable-connector-20261101','desktop-'+Date.now());fs.mkdirSync(project,{recursive:true});
const env=Object.fromEntries(['TEMP','TMP','TMPDIR','NODE_COMPILE_CACHE'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
execFileSync(process.execPath,[fileURLToPath(new URL('../src/desktop-config.mjs',import.meta.url)),'--project',project],{env:{...process.env,...env},stdio:'pipe'});
const config=JSON.parse(fs.readFileSync(path.join(project,'certosa-client-configs/mcp-local.json'),'utf8')).mcpServers.certosa_archives;
const client=new Client({name:'clean-desktop-entry',version:'1'}),transport=new StdioClientTransport({...config,stderr:'pipe'});transport.stderr?.resume();
let pid;
try{await client.connect(transport);assert.equal((await client.listTools()).tools.length,19);assert.ok(client.getInstructions().startsWith('Certosa archives:'));const call=async name=>JSON.parse((await client.callTool({name,arguments:{}})).content[0].text);
 assert.equal((await call('get_archive_capabilities')).atomicBatch,true);assert.equal((await call('get_archive_status')).state,'closed');
 const runtime=path.join(project,'.certosa-connectors/0.0.6-alpha.3');pid=JSON.parse(fs.readFileSync(path.join(runtime,'archive-service.json'),'utf8')).pid;
 assert.equal((await client.getPrompt({name:'certosa-save-compatible'})).messages.length,1);assert.ok((await client.readResource({uri:'certosa://archive-workflow'})).contents[0].text.includes('nativeReaderVerified'));
 assert.throws(()=>execFileSync(process.execPath,[fileURLToPath(new URL('../src/desktop-config.mjs',import.meta.url)),'--project',project],{env:{...process.env,...env},stdio:'pipe'}));
 console.log('PASS portable desktop configuration launches real stdio SDK, recognition, prompts/resources and locked local runtime without client modification');
}finally{await client.close();if(pid)try{process.kill(pid,'SIGTERM');}catch{}}
