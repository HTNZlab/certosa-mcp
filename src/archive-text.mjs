import {parseFragment} from 'parse5';
// Version of the derived search text, independent from archive content/schema.
export const SEARCH_TEXT_VERSION=2;
const blockSeparators=new Set(['p','div','li','h1','h2','h3','blockquote','tr']);
// Parse untrusted HTML as data. Never execute scripts or return raw HTML.
export function plainText(html){
  const root=parseFragment(String(html||'')),parts=[];
  const walk=node=>{
    if(node.nodeName==='#text'){parts.push(node.value);return;}
    if(['script','style','template','noscript','iframe','object','svg','math'].includes(node.tagName))return;
    if(node.tagName==='br'){parts.push('\n');return;}
    for(const child of node.childNodes||[])walk(child);
    if(blockSeparators.has(node.tagName))parts.push('\n');
  };
  for(const node of root.childNodes)walk(node);
  return parts.join('').replace(/\n$/,'');
}
export function textHtml(text){
  const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  return text.split('\n').map(line=>'<div class="p">'+(escape(line)||'<br>')+'</div>').join('');
}
