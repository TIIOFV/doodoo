import fs from 'node:fs';import path from 'node:path';import playwrightPath from './playwright-path.mjs';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(path.join(playwrightPath, 'index.mjs')).href);import { mock } from './ui-audit.mjs';
const screenshotMode=process.argv.includes('--screenshots-only');
const viewports=screenshotMode?[[320,568],[1024,768],[1440,900]]:[[320,568],[390,844],[768,1024],[1024,768],[1280,800],[1440,900],[1920,1080],[375,568]];
const themes=screenshotMode?['light','dark']:['light','dark','ocean','nature','sunset','amethyst','aurora','solar','coral','graphite'];
const routes=['/','/dashboard','/dashboard/tarefas','/dashboard/conversas','/dashboard/agenda','/dashboard/notas','/dashboard/configuracoes'];
const out='docs/ui-audit/after';fs.mkdirSync(out,{recursive:true});
async function ready(page,route){await page.goto(`http://localhost:3100${route}`);await page.waitForFunction(()=>document.body.innerText.length>150&&!document.body.innerText.includes('Preparando Ambiente'),{timeout:15000});await page.waitForTimeout(120);}
async function palette(page,theme){await page.evaluate(theme=>{localStorage.setItem('doodoo_theme',theme);window.dispatchEvent(new Event('doodoo:theme'));},theme);await page.waitForTimeout(60);}
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});const results=[],errors=[];
for(const [width,height]of viewports){const context=await browser.newContext({viewport:{width,height}});await mock(context);const page=await context.newPage();page.on('pageerror',e=>errors.push({width,message:e.message}));
 for(const route of routes){if(route==='/'){await context.clearCookies();await page.goto('http://localhost:3100');await page.evaluate(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('sb-'))localStorage.removeItem(key)});await context.addInitScript(()=>{if(location.pathname==='/')for(const key of Object.keys(localStorage))if(key.startsWith('sb-'))localStorage.removeItem(key)});}
 await ready(page,route);
 for(const theme of themes){await palette(page,theme);const result=await page.evaluate(()=>{const root=document.documentElement;const color=getComputedStyle(root);const probe=document.createElement('div');probe.className='bg-black/5 dark:bg-white/5 text-brand-panel border-brand-panel accent-brand-panel';document.body.append(probe);const computed=getComputedStyle(probe);const utility={darkBackground:computed.backgroundColor,brandText:computed.color,brandBorder:computed.borderColor,brandAccent:computed.accentColor};probe.className='bg-brand-panel/10';utility.brandTint=getComputedStyle(probe).backgroundColor;probe.remove();return{overflow:root.scrollWidth>innerWidth,theme:root.dataset.theme,bg:color.getPropertyValue('--bg-page').trim(),utility,text:document.body.innerText.length}});results.push({route,width,height,theme,...result});if(['light','dark'].includes(theme)&&[320,1440].includes(width))await page.screenshot({animations:'disabled',path:path.join(out,`${route==='/'?'login':route.split('/').at(-1)}-${width}-${theme}.png`)});}
 await palette(page,'light');
 const recordState=async state=>{const info=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth}));results.push({route,width,height,state,...info});if([320,1024].includes(width))await page.screenshot({animations:'disabled',path:path.join(out,`state-${route.split('/').at(-1)}-${state}-${width}.png`)});};
 if(route==='/dashboard/tarefas'){await page.getByText('Revisar documento de teste',{exact:true}).click();await recordState('selected');}
 if(route==='/dashboard/conversas'){await page.getByText('Equipe UI',{exact:true}).first().click();await recordState('thread');await page.locator('[role=button]').filter({has:page.locator('h3').filter({hasText:'Equipe UI'})}).first().click();await recordState('members');}
 if(route==='/dashboard/notas'){await page.getByText('Nota de teste',{exact:true}).click();await recordState('editor');}
 if(route==='/dashboard/agenda'){await page.getByRole('button',{name:'Dia',exact:true}).click();await recordState('day');}
 if(route==='/dashboard/configuracoes'){for(const tab of ['Privacidade',width<1024?'Colaboradores':'Equipe & Colaboradores',width<1024?'Permiss\u00f5es':'Permiss\u00f5es de Abas',width<1024?'Categorias':'Categorias de Tarefas',width<1024?'Auditoria':'Auditoria & Dados']){await page.getByRole('button',{name:tab,exact:true}).click();await recordState(tab);}}
 console.log('MATRIX',width,route);
 }
 await context.close();
}
// Reflow equivalent to 200% at 1280?800; native browser zoom still needs manual validation.
const zoomContext=await browser.newContext({viewport:{width:640,height:400},deviceScaleFactor:2});await mock(zoomContext);const zoomPage=await zoomContext.newPage();for(const route of routes.slice(1)){await ready(zoomPage,route);results.push({route,width:640,height:400,zoom:'200% equivalent CSS viewport',overflow:await zoomPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});}await zoomContext.close();
fs.writeFileSync(path.join(out,screenshotMode?'visual-samples.json':'matrix.json'),JSON.stringify({results,errors},null,2));await browser.close();console.log('DONE',results.length,'overflow',results.filter(x=>x.overflow).length,'errors',errors.length);if(errors.length||results.some(r=>r.overflow))process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1)});
