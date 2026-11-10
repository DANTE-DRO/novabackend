import {readFile,writeFile,rename,rm,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const models=new URL('../models/',import.meta.url);
const digest=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await readFile(new URL('sface.parts/manifest.json',models),'utf8'));
const target=new URL('sface.onnx',models);
let ready=false;
try{const b=await readFile(target);ready=b.length===manifest.bytes&&digest(b)===manifest.sha256;}catch(e){if(e.code!=='ENOENT')throw e;}
if(!ready){
 const buffers=[];
 for(const part of manifest.parts){
  if(!/^sface\.onnx\.part\d{2}$/.test(part.name))throw new Error('Invalid model part name');
  const b=await readFile(new URL('sface.parts/'+part.name,models));
  if(b.length!==part.bytes||digest(b)!==part.sha256)throw new Error('Model part damaged: '+part.name+'. Re-upload the original binary part; do not edit it as text.');
  buffers.push(b);
 }
 const complete=Buffer.concat(buffers);
 if(complete.length!==manifest.bytes||digest(complete)!==manifest.sha256)throw new Error('Reconstructed SFace checksum mismatch');
 const temp=fileURLToPath(target)+'.'+process.pid+'.tmp';
 try{await writeFile(temp,complete);await rename(temp,target);}finally{await rm(temp,{force:true});}
 console.log('SFace reconstructed from four GitHub-safe parts; original SHA-256 verified.');
}
const yunet=await readFile(new URL('yunet.onnx',models));
if(digest(yunet)!=='8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4')throw new Error('YuNet checksum mismatch');
console.log('Both identity model checksums verified.');
