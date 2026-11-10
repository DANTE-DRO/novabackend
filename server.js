import {database,migrate} from './src/db.js';
import {createApp} from './src/app.js';
import {seedCorpus} from './src/seed.js';
import {ensureBank,BANK_SIZE} from './src/offline-corpus.js';
import {requireConfig} from './src/security.js';
import {initializeRecovery} from './src/recovery.js';
let pool,server,cleanup,recovery;let closing=false;
async function shutdown(code=0){if(closing)return;closing=true;clearInterval(cleanup);if(server)await new Promise(resolve=>server.close(resolve));if(recovery)await recovery.stop();if(pool)await pool.end();process.exit(code);}
try {
 requireConfig(process.env);pool=database();await migrate(pool);recovery=await initializeRecovery(pool);await seedCorpus(pool);
 if(process.env.CORPUS_AUTOGENERATE!=='false')await ensureBank(pool,{target:Math.min(2000,Number(process.env.CORPUS_TARGET??BANK_SIZE))});
 // Start HTTP before generating the large bank, so Render's health check does not time out.
 const app=createApp({pool,recovery});server=app.listen(Number(process.env.PORT||10000),'0.0.0.0',()=>console.log('NovaWatches API listening on PORT '+(process.env.PORT||10000)));
 server.on('error',e=>{console.error('HTTP startup failed: '+e.message);shutdown(1);});
 if(process.env.CORPUS_AUTOGENERATE!=='false')ensureBank(pool,{target:Number(process.env.CORPUS_TARGET??BANK_SIZE),onProgress:(done,target)=>console.log(`Stored sentence bank: ${done}/${target}`)}).catch(e=>console.error('Corpus generation paused: '+e.message+'; rerun npm run generate-corpus.'));
 const expire=()=>pool.query("WITH expired AS (UPDATE verification_submissions SET evidence_encrypted=NULL,status='expired',reason='Evidence expired; capture again.' WHERE status='pending' AND expires_at<now() RETURNING user_id,kind) UPDATE users SET identity_state='pending' WHERE id IN (SELECT user_id FROM expired WHERE kind='identity') AND identity_state='pending_review'").catch(()=>console.error('Evidence cleanup failed; check database connectivity.'));
 await expire();cleanup=setInterval(expire,60000);cleanup.unref();
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{setTimeout(()=>process.exit(1),10000).unref();shutdown();});
} catch(e){console.error('Startup failed: '+(e.message||e.code||e.name||'Unknown failure'));if(Array.isArray(e.errors))console.error('Connection details: '+e.errors.map(x=>x.code||x.message||x.name).join(', '));console.error('Check DATABASE_URL, APP_SECRET, DATA_ENCRYPTION_KEY and FRONTEND_ORIGINS. See docs/DEPLOYMENT-FIXED.md.');if(recovery)await recovery.stop();if(pool)await pool.end();process.exit(1);}
