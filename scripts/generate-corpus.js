import {database,migrate} from '../src/db.js';
import {ensureBank,BANK_SIZE} from '../src/offline-corpus.js';
let pool;
try{pool=database();await migrate(pool);const r=await ensureBank(pool,{target:Number(process.env.CORPUS_TARGET??BANK_SIZE),onProgress:(done,total)=>console.log(`${done}/${total} stored sentences`)});console.log(JSON.stringify(r));}catch(e){console.error(e.message);process.exitCode=1;}finally{if(pool)await pool.end();}
