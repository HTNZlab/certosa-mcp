import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {Client} from '../node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport} from '../node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import {project} from './archive-fixtures.mjs';
const root=path.join(project,'verifiche/archive-engine-20261101','boot-'+Date.now());fs.mkdirSync(root,{recursive:true});
const config=path.join(root,'archive-engine.json');fs.writeFileSync(config,JSON.stringify({project:root}));
const client=new Client({name:'archive-boot-test',version:'1'}),env=Object.fromEntries(['TEMP','TMP','TMPDIR','NODE_COMPILE_CACHE'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/archive-mcp-server.mjs',import.meta.url)),config],env,stderr:'pipe'});transport.stderr?.resume();
const checks=[];let daemon;
const check=(label,condition)=>{assert.ok(condition,label);checks.push(label);console.log('PASS '+label);};
async function status(){const value=await client.callTool({name:'get_archive_status',arguments:{}});return JSON.parse(value.content[0].text);}
try{
  await client.connect(transport);check('missing service starts locally without opening an archive',(await status()).state==='closed');
  const first=JSON.parse(fs.readFileSync(path.join(root,'archive-service.json'),'utf8'));daemon=first.pid;
  check('same service reused by subsequent calls',(await status()).state==='closed'&&JSON.parse(fs.readFileSync(path.join(root,'archive-service.json'),'utf8')).pid===daemon);
  const cli=JSON.parse(execFileSync(process.execPath,[fileURLToPath(new URL('../src/archive-client.mjs',import.meta.url)),config,'get_archive_status','{}'],{env:{...process.env,...env},encoding:'utf8'}));
  check('distributable SDK client executes a tool request',JSON.parse(cli.content[0].text).state==='closed');
  process.kill(daemon,'SIGTERM');await new Promise(resolve=>setTimeout(resolve,400));daemon=null;
  check('persistent MCP client recovers a stopped service before dispatch',(await status()).state==='closed');
  const second=JSON.parse(fs.readFileSync(path.join(root,'archive-service.json'),'utf8'));daemon=second.pid;
  check('restarted service rotates local pairing',second.pid!==first.pid&&second.token!==first.token);
}finally{
  await client.close();if(daemon)try{process.kill(daemon,'SIGTERM');}catch{}
  fs.writeFileSync(path.join(root,'RESULT.json'),JSON.stringify({checks},null,2)+'\n');
}
