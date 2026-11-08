import fs from 'node:fs';
const base=JSON.parse(fs.readFileSync(new URL('../tools.json',import.meta.url),'utf8')).tools;
const secrets=JSON.parse(fs.readFileSync(new URL('../secret-tools.json',import.meta.url),'utf8')).tools;
// Collection commits are deliberately not exposed until their renderer is ready.
export const tools=[...base.filter(t=>!['prepare_collection','prepare_author_edit'].includes(t.name)),{
  name:'apply_proposal',title:'Save a reviewed notebook edit',
  description:'Persist a prepared page edit in the unlocked test library. Requires its exact revision; preserves notes/attachments and creates an encrypted recovery checkpoint. Never retry automatically after an uncertain result.',
  inputSchema:{type:'object',properties:{proposalId:{type:'string',minLength:1,maxLength:128}},required:['proposalId'],additionalProperties:false},
  annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:false}
},...secrets];
