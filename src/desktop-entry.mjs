#!/usr/bin/env node
// Portable entry for Claude MCPB, ChatGPT/Codex and local stdio MCP clients.
// Source may be installed anywhere; all working data go under the chosen root.
import fs from 'node:fs';
import path from 'node:path';
import {projectDirectory} from './archive-paths.mjs';
const projectArg=process.argv[2];
if(!projectArg||!path.isAbsolute(projectArg))throw Error('ABSOLUTE_ARCHIVE_PROJECT_REQUIRED');
const project=fs.realpathSync(projectArg);
const runtime=projectDirectory(project,path.join(project,'.certosa-connectors','0.0.6-alpha.3'));
for(const name of ['.tmp','cache-node','logs','backups','archives'])projectDirectory(project,path.join(runtime,name));
for(const key of ['TEMP','TMP','TMPDIR'])process.env[key]=path.join(runtime,'.tmp');
process.env.NODE_COMPILE_CACHE=path.join(runtime,'cache-node');
const configuration=path.join(runtime,'archive-engine.json');
if(!fs.existsSync(configuration)){
  try{fs.writeFileSync(configuration,JSON.stringify({project,port:0})+'\n',{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
}
const existing=JSON.parse(fs.readFileSync(configuration,'utf8'));
if(existing.project!==project)throw Error('EXISTING_RUNTIME_PROJECT_MISMATCH');
process.argv[2]=configuration;
await import('./archive-mcp-server.mjs');
