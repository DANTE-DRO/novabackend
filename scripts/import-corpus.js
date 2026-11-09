import {readFile} from 'node:fs/promises';
import {database,migrate} from '../src/db.js';import {id} from '../src/security.js';
const path=process.argv[2];if(!path)throw new Error('Usage: npm run import-corpus -- /absolute/path/to/licensed-corpus.jsonl');
const p=database();let n=0;try{await migrate(p);for(const line of (await readFile(path,'utf8')).split('\n').filter(Boolean)){const t=JSON.parse(line);if(typeof t.source!=='string'||t.source.length<10||t.source.length>500)throw new Error('Invalid source at row '+(n+1));const r=await p.query('INSERT INTO corpus(id,source,category) VALUES($1,$2,$3) ON CONFLICT(source) DO NOTHING',[id(),t.source,t.category||'General']);n+=r.rowCount;}console.log('Imported '+n+' new sentences.');}finally{await p.end();}
