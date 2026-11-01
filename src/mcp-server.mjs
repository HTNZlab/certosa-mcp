#!/usr/bin/env node
import fs from 'node:fs';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {CallToolRequestSchema,ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import Ajv from 'ajv';
import {tools} from './runtime-tools.mjs';

// Only this local process reads the pairing file. Never put its bearer in tool arguments.
const filename=process.argv[2];
if(!filename){process.stderr.write('Usage: node mcp-server.mjs <local pairing file>\n');process.exit(2);}
const config=JSON.parse(fs.readFileSync(filename,'utf8'));
const origin=new URL(config.origin);
if(origin.protocol!=='http:'||origin.hostname!=='127.0.0.1'||origin.pathname!=='/'||origin.search||origin.hash)throw Error('INVALID_LOCAL_BRIDGE');
const ajv=new Ajv(),validators=new Map(tools.map(t=>[t.name,ajv.compile(t.inputSchema)]));
const server=new Server({name:'certosa-local',version:'0.0.2-alpha.1'},{capabilities:{tools:{}}});
const failure=code=>({isError:true,content:[{type:'text',text:JSON.stringify({error:code})}]});
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools}));
server.setRequestHandler(CallToolRequestSchema,async request=>{
  const {name,arguments:args={}}=request.params;
  if(!validators.get(name)?.(args))return failure('INVALID_TOOL_OR_ARGUMENTS');
  try{
    const response=await fetch(new URL('/bridge/call',origin),{method:'POST',headers:{Authorization:'Bearer '+config.clientToken,'Content-Type':'application/json'},
      body:JSON.stringify({name,arguments:args}),signal:AbortSignal.timeout(20000),redirect:'error'});
    if(!response.ok)return failure(response.status===503?'DEVICE_UNAVAILABLE':'BRIDGE_REJECTED');
    const result=await response.json();
    return {isError:!!result.error,content:[{type:'text',text:JSON.stringify(result)}]};
  }catch{return failure('OUTCOME_UNKNOWN_DO_NOT_RETRY');}
});
await server.connect(new StdioServerTransport());
