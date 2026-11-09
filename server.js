import {database,migrate} from './src/db.js';
import {createApp} from './src/app.js';
import {seedCorpus} from './src/seed.js';
const pool=database();
try {await migrate(pool);await seedCorpus(pool);const app=createApp({pool});const server=app.listen(Number(process.env.PORT||10000),'0.0.0.0',()=>console.log('NovaWatches API listening on PORT '+(process.env.PORT||10000)));
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{server.close(async()=>{await pool.end();process.exit(0);});setTimeout(()=>process.exit(1),10000).unref();});
} catch(e){console.error('Startup failed: '+e.message);await pool.end();process.exit(1);}
