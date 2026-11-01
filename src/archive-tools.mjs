import fs from 'node:fs';
const base=JSON.parse(fs.readFileSync(new URL('../tools.json',import.meta.url),'utf8')).tools;
const empty={type:'object',properties:{},additionalProperties:false};
const annotations=readOnly=>({readOnlyHint:readOnly,destructiveHint:false,idempotentHint:readOnly,openWorldHint:false});
export const archiveTools=[
  {name:'open_archive',title:'Open a local Certosa archive',description:'Open the local file picker and password/consent window. Returns immediately while the owner chooses and unlocks a .certosa file. Never accepts or returns a password or file path; never opens the Certosa application.',inputSchema:empty,annotations:annotations(false)},
  {name:'get_archive_status',title:'Check the local archive',description:'Report whether file selection, local password or notebook consent is pending, or the archive is ready. No passwords, keys, paths or notebook contents.',inputSchema:empty,annotations:annotations(true)},
  {name:'close_archive',title:'Lock the archive',description:'Revoke access, close the local archive session and release the in-memory key. Saved edits remain in the .certosa file.',inputSchema:empty,annotations:annotations(false)},
  ...base.filter(t=>t.name!=='prepare_collection'),
  {name:'count_word',title:'Count an exact word in the authorised archive',description:'Count whole-word occurrences in every authorised notebook page and note, excluding titles, trash, system and secret notebooks. Computed locally, not estimated by the model. Returns exact total and bounded source locations.',
    inputSchema:{type:'object',properties:{word:{type:'string',minLength:1,maxLength:100},notebookId:{type:'string',minLength:1,maxLength:128},caseSensitive:{type:'boolean'}},required:['word'],additionalProperties:false},annotations:annotations(true)},
  {name:'apply_proposal',title:'Save a reviewed edit to the .certosa archive',description:'Commit the exact prepared edit after checking its revision and source file. Creates an encrypted recovery copy and replaces the original encrypted file. Never retry automatically after an uncertain outcome.',
    inputSchema:{type:'object',properties:{proposalId:{type:'string',minLength:1,maxLength:128}},required:['proposalId'],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:false}}
];
