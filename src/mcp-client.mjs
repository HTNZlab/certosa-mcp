import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {fileURLToPath} from 'node:url';
const [pairing,operation,args='{}']=process.argv.slice(2);
const client=new Client({name:'certosa-local-chat-client',version:'0.0.2-alpha.1'});
const childEnv=Object.fromEntries(['TEMP','TMP','TMPDIR','NODE_COMPILE_CACHE'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./mcp-server.mjs',import.meta.url)),pairing],env:childEnv,stderr:'pipe'});
transport.stderr?.resume();
const debug=stage=>{if(process.env.CERTOSA_CLIENT_DEBUG)process.stderr.write(stage+'\n');};
try{
  debug('connect');await client.connect(transport,{timeout:10000});debug('connected');
  const result=operation==='list-tools'?await client.listTools():await client.callTool({name:operation,arguments:JSON.parse(args)});
  process.stdout.write(JSON.stringify(result)+'\n');debug('result');
}finally{debug('closing');await client.close();debug('closed');}
