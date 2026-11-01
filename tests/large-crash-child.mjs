import {LargeArchiveStore} from '../src/large-archive-store.mjs';
import {packFixture} from './archive-fixtures.mjs';
let input='';for await(const part of process.stdin)input+=part;const request=JSON.parse(input);
if(request.create){LargeArchiveStore.prototype.putAttachment=()=>process.kill(process.pid,'SIGKILL');LargeArchiveStore.create(request.file,request.password,packFixture());process.exit(2);}
const store=LargeArchiveStore.open(request.file,request.password);request.password='';
store.indexPage=()=>process.kill(process.pid,'SIGKILL');
store.commit({baseRevision:0,notebookId:'first',pageNumber:2,pageValue:{html:'UNCOMMITTED_SYNTHETIC_MARKER',notes:[],st:[]}});
