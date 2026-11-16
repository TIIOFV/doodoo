import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const sources=walk('app').filter(p=>/\.(ts|tsx)$/.test(p));
const tables={},envNames=new Set();
for(const file of sources){const source=fs.readFileSync(file,'utf8');for(const m of source.matchAll(/\.from\(['"](doodoo_[^'"]+)['"]\)/g))(tables[m[1]]??=[]).push(file.replaceAll('\\','/'));for(const m of source.matchAll(/process\.env\.([A-Z0-9_]+)/g))envNames.add(m[1]);}
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const dependencies=Object.fromEntries(Object.keys({...pkg.dependencies,...pkg.devDependencies}).map(name=>{try{return[name,JSON.parse(fs.readFileSync(path.join('node_modules',name,'package.json'),'utf8')).version]}catch{return[name,'not locally resolved']}}));
const inventory={generatedAt:new Date().toISOString(),source:'local source only; no Supabase introspection',tables:Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,[...new Set(v)]])),storage:['chat_midia'],realtime:{schema:'public',mechanism:'postgres_changes'},environmentVariableNames:[...envNames].sort(),dependencies,auth:{shared:true,adminClientInBrowser:false,sso:'token fragment exchange with Iris in shared mode only'},unknown:['actual SQL types','FKs and indexes','RLS and grants','triggers and functions','Iris consumers','Storage policies and publication membership'],sourceHashes:Object.fromEntries(sources.map(file=>[file.replaceAll('\\','/'),createHash('sha256').update(fs.readFileSync(file)).digest('hex')]))};
fs.writeFileSync('docs/homologation/inventory.json',JSON.stringify(inventory,null,2));console.log('Local inventory prepared:',Object.keys(tables).length,'tables; no remote access.');
