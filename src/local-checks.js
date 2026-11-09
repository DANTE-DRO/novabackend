import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export async function localIdentityCheck(body,env=process.env){
 // Isolated CPU-only process. Never pass names, images or document data via shell arguments.
 return new Promise((resolve,reject)=>{
  const child=spawn(env.PYTHON_BIN||'python3',[fileURLToPath(new URL('../scripts/identity_check.py',import.meta.url))],{stdio:['pipe','pipe','pipe'],env:{...process.env,OMP_NUM_THREADS:'1',OPENBLAS_NUM_THREADS:'1'}});
  let out='',err='',done=false;
  const timer=setTimeout(()=>{child.kill('SIGKILL');finish(new Error('Local document check timed out. Please retry.'));},45000);
  const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(value);};
  child.on('error',()=>finish(new Error('Local scanner is unavailable. Deploy the included Dockerfile to install its dependencies.')));
  child.stdout.on('data',b=>{out+=b;if(out.length>64000){child.kill('SIGKILL');finish(new Error('Invalid scanner output'));}});
  child.stderr.on('data',b=>{err=(err+b).slice(-1000);});
  child.on('close',code=>{if(code!==0)return finish(new Error('Local scanner could not run. Check installed OCR/model dependencies.'));try{finish(null,JSON.parse(out));}catch{finish(new Error('Local scanner returned invalid data'));}});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(body));
 });
}
