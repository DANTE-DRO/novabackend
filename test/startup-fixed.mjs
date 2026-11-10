import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
const dir=new URL('../',import.meta.url).pathname,out=new URL('../../artifacts/neon-fix/',import.meta.url).pathname;await mkdir(out,{recursive:true});
const base={...process.env,NODE_ENV:'production',DATABASE_URL:process.env.STARTUP_DATABASE_URL,APP_SECRET:'startup-test-secret-at-least-32-characters',DATA_ENCRYPTION_KEY:'55'.repeat(32),FRONTEND_ORIGINS:'https://novabackend-i4iy.onrender.com',PORT:'10003',VERIFICATION_MODE:'local_review',CORPUS_AUTOGENERATE:'true',CORPUS_TARGET:'1000000'};
if(!base.DATABASE_URL||!base.DATABASE_URL.includes('nova_corpus'))throw new Error('Use the disposable nova_corpus database.');
function launch(env){const child=spawn(process.execPath,['server.js'],{cwd:dir,env,stdio:['ignore','pipe','pipe']});let text='';child.stdout.on('data',b=>text+=b);child.stderr.on('data',b=>text+=b);return {child,log:()=>text};}
async function exit(child){return new Promise(resolve=>child.once('exit',resolve));}
const results=[];
let r=launch({...base,APP_SECRET:''});assert.equal(await exit(r.child),1);assert.match(r.log(),/APP_SECRET must be configured/);assert.ok(!r.log().includes('node:internal'));results.push({name:'Missing secret produces actionable startup diagnostic',status:'passed'});
r=launch({...base,DATABASE_URL:''});assert.equal(await exit(r.child),1);assert.match(r.log(),/DATABASE_URL is required/);results.push({name:'Missing database URL is caught and explained',status:'passed'});
r=launch(base);try{
 for(let i=0;i<200;i++){if(r.log().includes('listening on PORT'))break;await new Promise(resolve=>setTimeout(resolve,100));}
 assert.match(r.log(),/listening on PORT 10003/);
 const health=await fetch('http://127.0.0.1:10003/health');assert.equal(health.status,200);assert.equal((await health.json()).ok,true);results.push({name:'Real production server binds PORT and database-backed /health passes',status:'passed'});
 const front=await fetch('http://127.0.0.1:10003/');assert.equal(front.status,200);assert.match(await front.text(),/config.js/);results.push({name:'Whole-repository deployment serves original frontend',status:'passed'});
 const allowed=await fetch('http://127.0.0.1:10003/api/config',{headers:{Origin:'https://novabackend-i4iy.onrender.com'}});assert.equal(allowed.status,200);assert.equal(allowed.headers.get('access-control-allow-origin'),'https://novabackend-i4iy.onrender.com');results.push({name:'Specified public API origin is allowed',status:'passed'});
 const denied=await fetch('http://127.0.0.1:10003/api/config',{headers:{Origin:'https://untrusted.invalid'}});assert.equal(denied.status,403);results.push({name:'Untrusted origins remain blocked',status:'passed'});
}finally{const stopped=exit(r.child);r.child.kill('SIGTERM');const timer=setTimeout(()=>r.child.kill('SIGKILL'),15000);await stopped;clearTimeout(timer);await writeFile(out+'startup-results.json',JSON.stringify({results,serverLog:r.log()},null,2));}
console.log(JSON.stringify(results,null,2));
