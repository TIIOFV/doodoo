import {spawn} from 'node:child_process';
const command=process.argv[2];
const legacy=process.argv.includes('--legacy');
if(!['build','start'].includes(command))throw new Error('Usage: node scripts/phase-3-local.mjs build|start (mock only)');
// Explicit process values take precedence over Next's .env.local loader.
// No credentials are read, no remote targets are accepted by this launcher.
const env={...process.env,DOO_BUILD_DIR:legacy?'.next-phase3-legacy':'.next-phase3',NEXT_PUBLIC_DOO_ENVIRONMENT:'mock',NEXT_PUBLIC_DOO_ATOMIC_WRITES:legacy?'false':'true',NEXT_PUBLIC_SUPABASE_URL:'https://doodoo-test.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'mock-only-public-key',NEXT_PUBLIC_DOO_HOMOLOGATION_PROJECT_REF:'',NEXT_PUBLIC_DOO_SHARED_PROJECT_REF:'',NEXT_PUBLIC_IRIS_URL:''};
const args=['node_modules/next/dist/bin/next',command,...(command==='start'?['-H','127.0.0.1','-p',legacy?'3301':'3300']:[])];
const child=spawn(process.execPath,args,{env,stdio:'inherit'});
child.on('exit',code=>{process.exitCode=code??1});
