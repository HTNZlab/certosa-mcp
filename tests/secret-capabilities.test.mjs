import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalSecretCapabilities} from '../src/secret-capabilities.mjs';
const fixtureSecret='synthetic-only-not-a-real-password';
function fixture(execute){
 let id=0,clock=0,calls=[];const state={contextId:'synthetic-vault',locked:false};
 const owner=createLocalSecretCapabilities({readState:()=>state,now:()=>clock,newId:()=>`opaque-${++id}`,
  executeLocally:async request=>{calls.push(request);return execute?execute(request):{status:'completed',password:fixtureSecret,cookie:'private-cookie',token:'private-token'};}});
 const session=owner.openSession({contextId:state.contextId,bindings:[{credentialId:'router-entry',label:'Router di prova',action:'authenticate',targetOrigin:'https://router.example.invalid',maxUses:1}]});
 return {owner,session,state,calls,tick:()=>{clock+=300001;}};
}
const code=(fn,value)=>assert.throws(fn,e=>e.code===value);
test('model sees an opaque handle and only a fixed completion status',async()=>{
 const f=fixture(),prepared=f.session.prepare_credential_use({label:'Router di prova',action:'authenticate'});
 const result=await f.session.use_credential({handle:prepared.handle});
 assert.deepEqual(result,{status:'completed'});
 assert.doesNotMatch(JSON.stringify([prepared,result]),/synthetic-only|private-cookie|private-token|router-entry|router\.example/);
 assert.equal(f.calls[0].credentialId,'router-entry');assert.equal(f.calls[0].targetOrigin,'https://router.example.invalid');
});
test('there is no reveal, password read, arbitrary fetch or shell operation',()=>{
 const f=fixture();for(const key of ['reveal','read_secret','get_password','fetch','exec'])assert.equal(f.session[key],undefined);
});
test('the model cannot replace the origin or add arbitrary request parameters',async()=>{
 const f=fixture();code(()=>f.session.prepare_credential_use({label:'Router di prova',action:'authenticate',url:'https://attacker.example.invalid'}),'INVALID_ARGUMENTS');
 const p=f.session.prepare_credential_use({label:'Router di prova',action:'authenticate'});
 await assert.rejects(f.session.use_credential({handle:p.handle,targetOrigin:'https://attacker.example.invalid'}),e=>e.code==='INVALID_ARGUMENTS');assert.equal(f.calls.length,0);
});
test('handles and bindings prevent replay and concurrent duplicate execution',async()=>{
 const f=fixture(),p=f.session.prepare_credential_use({label:'Router di prova',action:'authenticate'});
 const first=f.session.use_credential({handle:p.handle});await assert.rejects(f.session.use_credential({handle:p.handle}),e=>e.code==='HANDLE_SPENT');await first;
 assert.equal(f.calls.length,1);code(()=>f.session.prepare_credential_use({label:'Router di prova',action:'authenticate'}),'NOT_AVAILABLE');
});
test('raw executor errors are never echoed and the attempted handle remains spent',async()=>{
 const f=fixture(()=>{throw Error(fixtureSecret);}),p=f.session.prepare_credential_use({label:'Router di prova',action:'authenticate'});
 assert.deepEqual(await f.session.use_credential({handle:p.handle}),{status:'failed'});
 await assert.rejects(f.session.use_credential({handle:p.handle}),e=>e.code==='HANDLE_SPENT');
});
test('lock and expiry stop new actions',()=>{
 const f=fixture();f.state.locked=true;code(()=>f.session.prepare_credential_use({label:'Router di prova',action:'authenticate'}),'VAULT_LOCKED');
 const g=fixture();g.tick();code(()=>g.session.prepare_credential_use({label:'Router di prova',action:'authenticate'}),'SESSION_CLOSED');
});
test('closing aborts pending work and reports an indeterminate external outcome',async()=>{
 let finish,signal;const f=fixture(request=>{signal=request.signal;return new Promise(resolve=>{finish=resolve;});});
 const p=f.session.prepare_credential_use({label:'Router di prova',action:'authenticate'}),job=f.session.use_credential({handle:p.handle});
 f.session.close();assert.equal(signal.aborted,true);finish({status:'completed',debug:fixtureSecret});assert.deepEqual(await job,{status:'indeterminate'});
});
test('invalid origins and actions cannot be registered even by a malformed adapter',()=>{
 const f=fixture();code(()=>f.owner.openSession({contextId:'synthetic-vault',bindings:[{credentialId:'a',label:'a',action:'authenticate',targetOrigin:'https://user:pass@example.invalid'}]}),'INVALID_ORIGIN');
});
