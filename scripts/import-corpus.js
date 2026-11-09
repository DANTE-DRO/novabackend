import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {z} from 'zod';
import {database,migrate} from '../src/db.js';import {id} from '../src/security.js';
const path=process.argv[2];if(!path)throw new Error('Usage: npm run import-corpus -- /absolute/path/to/reviewed-corpus.jsonl');
const schema=z.object({source:z.string().trim().min(10).max(500),category:z.string().min(2).max(80).default('General'),translations:z.record(z.string().regex(/^[a-z]{2,3}$/),z.array(z.string().trim().min(2).max(2000)).min(1).max(20))});
let p,count=0,lineNumber=0;try{p=database();await migrate(p);const lines=createInterface({input:createReadStream(path),crlfDelay:Infinity});for await(const line of lines){lineNumber++;if(!line.trim())continue;const t=schema.parse(JSON.parse(line));await p.query('INSERT INTO corpus(id,source,category,translations) VALUES($1,$2,$3,$4) ON CONFLICT(source) DO UPDATE SET translations=corpus.translations || EXCLUDED.translations',[id(),t.source,t.category,JSON.stringify(t.translations)]);count++;}console.log('Imported or updated '+count+' reviewed sentence rows.');}catch(e){console.error('Import stopped at line '+lineNumber+': '+e.message);process.exitCode=1;}finally{if(p)await p.end();}
