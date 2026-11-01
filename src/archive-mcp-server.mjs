#!/usr/bin/env node
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {CallToolRequestSchema,ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import Ajv from 'ajv';
import {archiveTools} from './archive-tools.mjs';
import {archiveRuntime} from './archive-runtime.mjs';
import {fixedErrors} from './archive-service.mjs';

const filename=process.argv[2];if(!filename)throw Error('LOCAL_ARCHIVE_CONFIG_REQUIRED');
const validators=new Map(archiveTools.map(t=>[t.name,new Ajv().compile(t.inputSchema)]));
const server=new Server({name:'certosa-archives',version:'0.0.4-alpha.1'},{capabilities:{tools:{}}});
const result=value=>({isError:!!value.error,content:[{type:'text',text:JSON.stringify(value)}]});
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:archiveTools}));
server.setRequestHandler(CallToolRequestSchema,async request=>{
  const {name,arguments:args={}}=request.params;
  if(!validators.get(name)?.(args))return result({error:'INVALID_TOOL_OR_ARGUMENTS'});
  try{
    const runtime=await archiveRuntime(filename);
    return result(await runtime.call(name,args));
  }catch(e){return result({error:fixedErrors.has(e.code)?e.code:e.code==='LOCAL_SERVICE_REJECTED'?'LOCAL_SERVICE_REJECTED':'OUTCOME_UNKNOWN_DO_NOT_RETRY'});}
});
await server.connect(new StdioServerTransport());
