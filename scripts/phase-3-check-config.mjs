import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
export function parseEnvironment(source){return Object.fromEntries(source.split(/\r?\n/).filter(l=>l.trim()&&!l.trim().startsWith('#')).map(line=>{const i=line.indexOf('=');if(i<1)throw Error('Invalid environment format');return[line.slice(0,i).trim(),line.slice(i+1).trim().replace(/^(['"])(.*)\1$/,'$2')]}));}
export function validateTarget(env,sharedUrl){
 const failures=[];let host='',sharedHost='';try{host=new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname;sharedHost=new URL(sharedUrl).hostname}catch{failures.push('URL inválida');}
 const ref=env.NEXT_PUBLIC_DOO_HOMOLOGATION_PROJECT_REF,deny=env.NEXT_PUBLIC_DOO_SHARED_PROJECT_REF;
 if(env.NEXT_PUBLIC_DOO_ENVIRONMENT!=='homologation')failures.push('Modo deve ser homologation');
 if(!ref||!/^[a-z0-9]{20}$/.test(ref)||host!==ref+'.supabase.co')failures.push('Projeto independente não identificado');
 if(!deny||sharedHost!==deny+'.supabase.co'||host===sharedHost||ref===deny)failures.push('Projeto compartilhado não foi excluído corretamente');
 if(env.NEXT_PUBLIC_IRIS_URL)failures.push('SSO deve permanecer desativado');
 if(!env.NEXT_PUBLIC_SUPABASE_ANON_KEY||env.NEXT_PUBLIC_SUPABASE_ANON_KEY.includes('REPLACE'))failures.push('Chave pública independente pendente');
 if(env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.startsWith('sb_secret_'))failures.push('Chave secreta proibida no cliente');
 if(Object.keys(env).some(k=>/SERVICE_ROLE|SECRET_KEY|DATABASE_URL|PASSWORD/i.test(k)))failures.push('Credencial administrativa proibida neste arquivo');
 try{const key=env.NEXT_PUBLIC_SUPABASE_ANON_KEY;if(key?.split('.').length===3&&JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role!=='anon')failures.push('JWT informado não é chave anon');}catch{failures.push('Chave inválida');}
 return{consistent:failures.length===0,failures,remoteVerified:false,authorized:false,operationsPerformed:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 if(!process.argv[2])throw Error('Usage: node scripts/phase-3-check-config.mjs path-to-independent-config (read only)');
 const env=parseEnvironment(fs.readFileSync(process.argv[2],'utf8')),shared=parseEnvironment(fs.readFileSync('.env.local','utf8'));
 const result=validateTarget(env,shared.NEXT_PUBLIC_SUPABASE_URL);console.log(JSON.stringify(result,null,2));if(!result.consistent)process.exitCode=1;
}
