// Synthetic local-UI provider used only by this test entry, never by configuration.
import fs from 'node:fs';
import path from 'node:path';
import {fixture,packFixture} from './archive-fixtures.mjs';
import {runArchiveExecutor} from '../src/archive-executor.mjs';
const syntheticPack=packFixture();syntheticPack.lib.notebooks[0].pages[1].html=syntheticPack.lib.notebooks[0].pages[1].html.replace('<div>','<div class="p">');
const configFile=process.argv[2],runtime=path.dirname(configFile),sample=await fixture(path.join(runtime,'synthetic-source-'+process.pid),syntheticPack);
const output=path.join(runtime,'compatible-export.certosa');let controller;
const snapshot=path.join(runtime,'encrypted-snapshot.certosa-db');
const ui={cancel(){},async ask(mode,input){
  if(mode==='choose')return {path:input.importing?sample.file:fs.existsSync(snapshot)?snapshot:controller.engine.active?.filename||sample.file};
  if(mode==='unlock')return {password:sample.password};
  if(mode==='save')return {path:input.incrementalCopy?snapshot:output};
  if(mode==='grant')return {notebookIds:input.notebooks.map(n=>n.id),write:true,allowCreate:true};
}};
controller=runArchiveExecutor({filename:configFile,ui});
