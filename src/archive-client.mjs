import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {fileURLToPath} from 'node:url';
const [configuration,operation,args='{}']=process.argv.slice(2);
const client=new Client({name:'certosa-archive-chat-client',version:'0.0.3-alpha.1'});
const env=Object.fromEntries(['TEMP','TMP','TMPDIR','NODE_COMPILE_CACHE'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./archive-mcp-server.mjs',import.meta.url)),configuration],env,stderr:'pipe'});
transport.stderr?.resume();
try{
  await client.connect(transport,{timeout:10000});
  const result=operation==='list-tools'?await client.listTools():await client.callTool({name:operation,arguments:JSON.parse(args)},undefined,{timeout:45000});
  process.stdout.write(JSON.stringify(result)+'\n');
}finally{await client.close();}
