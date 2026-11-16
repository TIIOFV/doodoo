import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import playwrightPath from './playwright-path.mjs';
import {createSandbox} from './phase-3-sandbox.mjs';const mock=async(context,authenticated=true)=>{const s=createSandbox();await s.attach(context,authenticated?s.a:null)};
const { chromium } = await import(pathToFileURL(path.join(playwrightPath, 'index.mjs')).href);
const stage='phase-3';
const directory=`docs/ui-audit/phase-3/visual`;
fs.mkdirSync(directory,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
for(const width of [320,390,1440])for(const route of ['/','/dashboard','/dashboard/tarefas','/dashboard/conversas','/dashboard/agenda','/dashboard/notas','/dashboard/configuracoes']){
 const context=await browser.newContext({viewport:{width,height:width===1440?900:width===390?844:568}});
 await mock(context,route!=='/');
 const requests=[];
 await context.route('**/rest/v1/**',async request=>{requests.push({method:request.request().method(),table:new URL(request.request().url()).pathname.split('/').at(-1)});return request.fallback();});
 const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:3300${route}`);
 await page.waitForFunction(()=>document.body.innerText.length>120&&!document.body.innerText.includes('Preparando Ambiente'),{timeout:20000});
 const ready={'/':'Iniciar Sessão','/dashboard':'Olá, Ana','/dashboard/tarefas':'Nova Tarefa','/dashboard/conversas':'Chat Corporativo','/dashboard/agenda':'A sua Agenda','/dashboard/notas':'Bloco Pessoal','/dashboard/configuracoes':'Meu Perfil'};
 await page.getByText(ready[route],{exact:true}).filter({visible:true}).first().waitFor();
 await page.waitForTimeout(120);
 await page.screenshot({path:`${directory}/${route==='/'?'login':route.split('/').at(-1)}-${width}.png`,animations:'disabled'});
 results.push({route,width,errors,requests,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
 console.log(stage,width,route);await context.close();
}
fs.writeFileSync(`${directory}/results.json`,JSON.stringify(results,null,2));await browser.close();
