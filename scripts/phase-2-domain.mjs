import fs from 'node:fs';import ts from 'typescript';import assert from 'node:assert/strict';
const js=ts.transpileModule(fs.readFileSync('app/lib/domain.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {taskDeadline,isTaskOverdue,occurrenceId,searchKey}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const results=[];function test(name,action){action();results.push({name,status:'PASSOU LOCAL'});}
test('midnight preserves hour and minute zero',()=>{const d=taskDeadline('16/11/2026','00:00');assert.equal(d.getHours(),0);assert.equal(d.getMinutes(),0);});
test('00:30 preserves hour zero',()=>{const d=taskDeadline('16/11/2026','00:30');assert.equal(d.getHours(),0);assert.equal(d.getMinutes(),30);});
test('invalid calendar and time values rejected',()=>{for(const [d,t]of [['31/02/2026','12:00'],['16/11/2026','25:00'],['16/11/2026','00:60']])assert.equal(taskDeadline(d,t),null);});
test('deadline crosses midnight and completed tasks stay closed',()=>{const now=new Date(2026,10,16,0,31);assert.equal(isTaskOverdue('16/11/2026','00:30','pendente',now),true);assert.equal(isTaskOverdue('16/11/2026','00:30','concluida',now),false);});
test('accent-insensitive search',()=>assert.equal(searchKey('  Anota\u00e7\u00f5es '),'anotacoes'));
const first=await occurrenceId('source-a');assert.equal(first,await occurrenceId('source-a'));assert.notEqual(first,await occurrenceId('source-b'));results.push({name:'routine ID deterministic per source',status:'PASSOU LOCAL'});
fs.writeFileSync('docs/ui-audit/phase-2/domain-tests.json',JSON.stringify(results,null,2));console.log(results);
