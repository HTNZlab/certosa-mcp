/* A capability for a local action, never a secret-reading API.
 * The trusted executor owns the vault and action implementation. This core
 * never receives a password and projects executor output onto a fixed status.
 * No real executor, browser login or vault integration is shipped here.
 */
const fail=code=>{throw Object.assign(new Error(code),{code});};
const normal=value=>String(value).normalize('NFKC').trim().toLocaleLowerCase();
const fields=(value,keys)=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))fail('INVALID_ARGUMENTS');
};
function origin(value){
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)fail('INVALID_ORIGIN');
  return u.origin;
}

export function createLocalSecretCapabilities({readState,executeLocally,now=()=>Date.now(),newId=()=>crypto.randomUUID()}){
  if(typeof readState!=='function'||typeof executeLocally!=='function')fail('MISSING_OWNER_ADAPTER');
  function openSession({contextId,bindings=[],ttlMs=300000}){
    if(typeof contextId!=='string'||!contextId||!Array.isArray(bindings)||bindings.length>50||!Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>900000)fail('INVALID_GRANT');
    const allowed=bindings.map(b=>{
      if(typeof b.credentialId!=='string'||!b.credentialId||typeof b.label!=='string'||!b.label.trim()||b.label.length>200||b.action!=='authenticate'||!Number.isSafeInteger(b.maxUses??1)||(b.maxUses??1)<1||(b.maxUses??1)>10)fail('INVALID_GRANT');
      return {credentialId:b.credentialId,label:b.label,action:b.action,targetOrigin:origin(b.targetOrigin),remaining:b.maxUses??1};
    });
    const expires=now()+ttlMs,handles=new Map(),abort=new AbortController();let closed=false;
    function close(){closed=true;handles.clear();abort.abort();}
    function state(){
      if(closed||now()>=expires){close();fail('SESSION_CLOSED');}
      const s=readState();
      if(!s||s.locked){close();fail('VAULT_LOCKED');}
      if(s.contextId!==contextId){close();fail('CONTEXT_CHANGED');}
    }
    function prepare_credential_use(args){
      state();fields(args,['label','action']);
      if(typeof args.label!=='string'||args.label.length>200||args.action!=='authenticate')fail('INVALID_ARGUMENTS');
      const matches=allowed.filter(b=>normal(b.label)===normal(args.label)&&b.action===args.action&&b.remaining>0);
      if(!matches.length)fail('NOT_AVAILABLE');if(matches.length!==1)fail('AMBIGUOUS_LABEL');
      if(handles.size>=20)fail('TOO_MANY_HANDLES');
      const handle=newId();handles.set(handle,{binding:matches[0],spent:false});
      return {handle,label:matches[0].label,action:matches[0].action,oneTime:true};
    }
    async function use_credential(args){
      state();fields(args,['handle']);
      if(typeof args.handle!=='string')fail('INVALID_ARGUMENTS');
      const h=handles.get(args.handle);if(!h)fail('NOT_AVAILABLE');
      if(h.spent||h.binding.remaining<=0)fail('HANDLE_SPENT');
      h.spent=true;h.binding.remaining--;
      const b=h.binding;
      try{
        const result=await executeLocally({credentialId:b.credentialId,action:b.action,targetOrigin:b.targetOrigin,signal:abort.signal});
        try{state();}catch{return {status:'indeterminate'};}
        // No free-form messages, screenshots, cookies, tokens or debug data.
        const status=result?.status;
        return {status:['completed','failed','needs_user'].includes(status)?status:'failed'};
      }catch{
        return {status:closed||abort.signal.aborted?'indeterminate':'failed'};
      }
    }
    return Object.freeze({prepare_credential_use,use_credential,close});
  }
  return Object.freeze({openSession});
}
