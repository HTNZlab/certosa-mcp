import fs from 'node:fs';
import path from 'node:path';
import {archiveError} from './archive-format.mjs';
export function projectDirectory(project,target){
  const root=fs.realpathSync(project),absolute=path.resolve(target);
  const inside=value=>value===root||value.startsWith(root+path.sep);
  let parent=absolute,tail=[];
  while(!fs.existsSync(parent)){tail.unshift(path.basename(parent));parent=path.dirname(parent);}
  if(!inside(path.join(fs.realpathSync(parent),...tail)))throw archiveError('PROJECT_PATH_REQUIRED');
  fs.mkdirSync(absolute,{recursive:true});
  const real=fs.realpathSync(absolute);if(!inside(real))throw archiveError('PROJECT_PATH_REQUIRED');
  return real;
}
