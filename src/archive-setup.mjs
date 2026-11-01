#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {projectDirectory} from './archive-paths.mjs';
const args=new Map();
for(let i=2;i<process.argv.length;i+=2){if(!process.argv[i].startsWith('--')||!process.argv[i+1])throw Error('EXPECTED_NAMED_ARGUMENTS');args.set(process.argv[i],process.argv[i+1]);}
if(!args.has('--project'))throw Error('Usage: node archive-setup.mjs --project <approved folder> [--out <runtime folder>]');
const project=fs.realpathSync(args.get('--project')),out=path.resolve(args.get('--out')||path.join(project,'certosa-archives'));
const inside=p=>p===project||p.startsWith(project+path.sep);
let parent=out,tail=[];while(!fs.existsSync(parent)){tail.unshift(path.basename(parent));parent=path.dirname(parent);}
if(!inside(path.join(fs.realpathSync(parent),...tail)))throw Error('PROJECT_PATH_REQUIRED');
projectDirectory(project,out);
for(const name of ['.tmp','logs','backups','cache-node'])projectDirectory(project,path.join(out,name));
const config=path.join(out,'archive-engine.json');if(fs.existsSync(config))throw Error('EXISTING_RUNTIME_PRESERVED');
fs.writeFileSync(config,JSON.stringify({project,port:0},null,2)+'\n');
const server=fileURLToPath(new URL('./archive-mcp-server.mjs',import.meta.url));
const env={TEMP:path.join(out,'.tmp'),TMP:path.join(out,'.tmp'),TMPDIR:path.join(out,'.tmp'),NODE_COMPILE_CACHE:path.join(out,'cache-node')};
fs.writeFileSync(path.join(out,'claude-config.example.json'),JSON.stringify({mcpServers:{certosa_archives:{command:process.execPath,args:[server,config],env}}},null,2)+'\n');
let toml='[mcp_servers.certosa_archives]\ncommand = '+JSON.stringify(process.execPath)+'\nargs = '+JSON.stringify([server,config])+'\n[mcp_servers.certosa_archives.env]\n';
toml+=Object.entries(env).map(([key,value])=>key+' = '+JSON.stringify(value)+'\n').join('');fs.writeFileSync(path.join(out,'codex-config.example.toml'),toml);
if(process.platform==='win32'){
  const client=fileURLToPath(new URL('./archive-client.mjs',import.meta.url));
  const cmd='@echo off\r\nsetlocal\r\n'+Object.entries(env).map(([key,value])=>'set "'+key+'='+value+'"\r\n').join('')+'"'+process.execPath+'" "'+client+'" "'+config+'" open_archive "{}"\r\n';
  fs.writeFileSync(path.join(out,'Apri-archivio-per-chat.cmd'),cmd);
}
process.stdout.write('Archive engine configured locally. No archive opened and no password requested.\n');
