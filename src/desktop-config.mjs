#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {projectDirectory} from './archive-paths.mjs';
const args=new Map();for(let i=2;i<process.argv.length;i+=2)args.set(process.argv[i],process.argv[i+1]);
if(!args.get('--project')||!path.isAbsolute(args.get('--project')))throw Error('ABSOLUTE_ARCHIVE_PROJECT_REQUIRED');
const project=fs.realpathSync(args.get('--project')),out=projectDirectory(project,args.get('--out')||path.join(project,'certosa-client-configs'));
const entry=fileURLToPath(new URL('./desktop-entry.mjs',import.meta.url));
const runtime=projectDirectory(project,path.join(project,'.certosa-connectors','0.0.6-alpha.3'));
for(const name of ['.tmp','cache-node'])projectDirectory(project,path.join(runtime,name));
const env={TEMP:path.join(runtime,'.tmp'),TMP:path.join(runtime,'.tmp'),TMPDIR:path.join(runtime,'.tmp'),NODE_DISABLE_COMPILE_CACHE:'1'};
const server={command:process.execPath,args:[entry,project],env};
const toml='[mcp_servers.certosa_archives]\ncommand = '+JSON.stringify(server.command)+'\nargs = '+JSON.stringify(server.args)+'\n[mcp_servers.certosa_archives.env]\n'+Object.entries(env).map(([k,v])=>k+' = '+JSON.stringify(v)+'\n').join('');
const outputs={'chatgpt-codex.toml':toml,'claude-desktop.json':JSON.stringify({mcpServers:{certosa_archives:server}},null,2)+'\n','mcp-local.json':JSON.stringify({mcpServers:{certosa_archives:server}},null,2)+'\n'};
for(const [name,value] of Object.entries(outputs)){const file=path.join(out,name);if(fs.existsSync(file))throw Error('EXISTING_CLIENT_CONFIG_PRESERVED');fs.writeFileSync(file,value,{flag:'wx'});}
console.log('Client configuration examples created. No installed client settings changed. No archive opened.');
