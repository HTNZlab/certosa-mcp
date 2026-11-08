// Structured text patches preserve the original HTML bytes outside touched text
// nodes and the one typed paragraph-style attribute. Caller HTML is never accepted.
import {parseFragment} from 'parse5';
import {createHash} from 'node:crypto';
const fail=code=>{throw Object.assign(Error(code),{code});};
export const paragraphStyles=['normal','title','heading','bullet','quote'];
export const htmlHash=value=>createHash('sha256').update(value).digest('hex');
const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const inline=new Set(['span','b','strong','i','em','u','s','strike','font','a','br','img','sup','sub']);
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
function parse(html){
  if(typeof html!=='string'||html.length>1000000)fail('READ_BUDGET_EXCEEDED');
  const errors=[];
  const root=parseFragment(html,{sourceCodeLocationInfo:true,onParseError:e=>errors.push(e)});
  return {root,errors};
}
function blocks(html){
  const {root,errors}=parse(html);let index=0;
  return root.childNodes.filter(node=>node.tagName||node.nodeName==='#text'&&node.value.trim()).map(node=>{
    const loc=node.sourceCodeLocation;
    let text='',runs=[],supported=!!loc&&!!loc.startTag&&!!loc.endTag&&['div','p'].includes(node.tagName)&&errors.length===0;
    const walk=(n,marks=[])=>{
      if(n.nodeName==='#text'){
        const start=text.length;text+=n.value;
        runs.push({start,end:text.length,text:n.value,marks,node:n,kind:'text'});return;
      }
      if(n!==node&&!inline.has(n.tagName))supported=false;
      if(['script','style','iframe','object','template','svg','math'].includes(n.tagName)){supported=false;return;}
      if(n.tagName==='br'){const start=text.length;text+='\n';runs.push({start,end:text.length,text:'\n',marks,node:n,kind:'break'});return;}
      // Media is immutable, zero text width; its tag and position remain intact.
      const next=n===node?marks:[...marks,...(['b','strong','i','em','u','s','strike','sup','sub'].includes(n.tagName)?[n.tagName]:[])];
      for(const child of n.childNodes||[])walk(child,next);
    };
    walk(node);
    const style=node.attrs?.find(a=>a.name==='data-certosa-style')?.value||'normal';
    if(!paragraphStyles.includes(style))supported=false;
    const styleEditable=supported&&node.tagName==='div'&&(node.attrs?.find(a=>a.name==='class')?.value||'').split(/\s+/).includes('p');
    return {blockIndex:index++,blockHash:htmlHash(loc?html.slice(loc.startOffset,loc.endOffset):''),style,text,runs,supported,styleEditable,node,loc};
  });
}
export function readPageBlocks(html,{offset=0,limit=20}={}){
  if(!integer(offset,0,10000)||!integer(limit,1,50))fail('INVALID_RANGE');
  const all=blocks(html),selected=all.slice(offset,offset+limit);
  if(selected.reduce((n,b)=>n+b.text.length,0)>200000)fail('READ_BUDGET_EXCEEDED');
  return {pageHash:htmlHash(html),offset,totalBlocks:all.length,hasMore:offset+limit<all.length,offsetUnit:'UTF-16',blocks:selected.map(({blockIndex,blockHash,style,text,runs,supported,styleEditable})=>({blockIndex,blockHash,style,text,editable:supported,styleEditable,runs:runs.map(({start,end,marks,kind})=>({start,end,marks,kind}))}))};
}
const splitSurrogate=(text,offset)=>offset>0&&offset<text.length&&/[\uD800-\uDBFF]/.test(text[offset-1])&&/[\uDC00-\uDFFF]/.test(text[offset]);
function patchBlock(html,block,input){
  if(!block.supported)fail('UNSUPPORTED_PARAGRAPH');
  if(input.blockHash!==block.blockHash)fail('REVISION_CONFLICT');
  if(input.style!==undefined&&!paragraphStyles.includes(input.style))fail('INVALID_PARAGRAPH_EDIT');
  if(input.style!==undefined&&!block.styleEditable)fail('UNSUPPORTED_PARAGRAPH_STYLE');
  const edits=input.textEdits||[];
  if(!Array.isArray(edits)||edits.length>100||!edits.length&&input.style===undefined)fail('INVALID_PARAGRAPH_EDIT');
  const sorted=[...edits].sort((a,b)=>a.start-b.start||a.end-b.end);let previous=-1,characters=0;
  for(const e of sorted){
    if(!integer(e.start,0,block.text.length)||!integer(e.end,e.start,block.text.length)||e.start<=previous||typeof e.text!=='string'||e.text.length>100000||/[\r\n\u0000]/.test(e.text)||typeof e.expectedText!=='string')fail('INVALID_PARAGRAPH_EDIT');
    if(splitSurrogate(block.text,e.start)||splitSurrogate(block.text,e.end))fail('INVALID_PARAGRAPH_EDIT');
    if(block.text.slice(e.start,e.end)!==e.expectedText)fail('REVISION_CONFLICT');
    previous=e.end===e.start?e.end:e.end-1;characters+=e.text.length;
    if(characters>200000)fail('CONTENT_LIMIT');
    if(block.runs.some(r=>r.kind==='break'&&e.start<r.end&&e.end>r.start))fail('UNSUPPORTED_TEXT_RANGE');
  }
  const patches=[],values=new Map();
  for(const e of [...sorted].reverse()){
    let touched=block.runs.filter(r=>r.kind==='text'&&e.start<r.end&&e.end>r.start);
    if(e.start===e.end){
      const run=block.runs.find(r=>r.kind==='text'&&e.start>=r.start&&e.start<r.end)||[...block.runs].reverse().find(r=>r.kind==='text'&&r.end===e.start);
      if(run)touched=[run];
    }
    if(!touched.length){
      if(e.start!==e.end)fail('UNSUPPORTED_TEXT_RANGE');
      const beforeBreak=block.runs.find(r=>r.kind==='break'&&r.start===e.start),afterBreak=[...block.runs].reverse().find(r=>r.kind==='break'&&r.end===e.start);
      const anchor=beforeBreak?.node.sourceCodeLocation?.startOffset??afterBreak?.node.sourceCodeLocation?.endOffset??(!block.text.length?block.loc.startTag.endOffset:undefined);
      if(anchor===undefined)fail('UNSUPPORTED_TEXT_RANGE');
      patches.push({start:anchor,end:anchor,value:escape(e.text)});continue;
    }
    for(let i=0;i<touched.length;i++){
      const r=touched[i],value=values.get(r)||r.text,start=Math.max(0,e.start-r.start),end=Math.min(r.text.length,e.end-r.start);
      values.set(r,value.slice(0,start)+(i===0?e.text:'')+value.slice(end));
    }
  }
  for(const [r,value] of values){const loc=r.node.sourceCodeLocation;if(!loc)fail('UNSUPPORTED_PARAGRAPH');patches.push({start:loc.startOffset,end:loc.endOffset,value:escape(value)});}
  if(input.style!==undefined){
    const attr=block.loc.attrs?.['data-certosa-style'];
    if(attr)patches.push({start:attr.startOffset,end:attr.endOffset,value:'data-certosa-style="'+input.style+'"'});
    else patches.push({start:block.loc.startTag.endOffset-1,end:block.loc.startTag.endOffset-1,value:' data-certosa-style="'+input.style+'"'});
  }
  return patches;
}
export function editPageBlocks(html,operations){
  if(!Array.isArray(operations)||!operations.length||operations.length>100)fail('INVALID_PARAGRAPH_EDIT');
  const all=blocks(html),seen=new Set(),patches=[];let chars=0,previewCharacters=0;
  for(const op of operations){
    if(!op||!integer(op.blockIndex,0,all.length-1)||seen.has(op.blockIndex))fail('INVALID_PARAGRAPH_EDIT');seen.add(op.blockIndex);
    if(op.textEdits!==undefined&&!Array.isArray(op.textEdits))fail('INVALID_PARAGRAPH_EDIT');
    previewCharacters+=all[op.blockIndex].text.length;if(previewCharacters>200000)fail('READ_BUDGET_EXCEEDED');
    chars+=(op.textEdits||[]).reduce((n,e)=>n+(typeof e.text==='string'?e.text.length:0),0);if(chars>200000)fail('CONTENT_LIMIT');
    patches.push(...patchBlock(html,all[op.blockIndex],op));
  }
  let result=html;
  for(const p of patches.sort((a,b)=>b.start-a.start||b.end-a.end))result=result.slice(0,p.start)+p.value+result.slice(p.end);
  const afterBlocks=blocks(result);
  // Escaping markup alone does not make isolated surrogates, HTML controls or
  // noncharacters valid. Never publish a patch that makes its page uneditable.
  if(operations.some(op=>!afterBlocks[op.blockIndex]?.supported))fail('INVALID_PARAGRAPH_EDIT');
  return {html:result,beforePageHash:htmlHash(html),afterPageHash:htmlHash(result),changes:operations.map(op=>({blockIndex:op.blockIndex,beforeText:all[op.blockIndex].text,afterText:afterBlocks[op.blockIndex].text,beforeStyle:all[op.blockIndex].style,afterStyle:op.style||all[op.blockIndex].style})),preservesFormatting:true,preservesMedia:true};
}
