import {database} from '../src/db.js';
import {recoveryStatus} from '../src/recovery.js';
const pool=database();
try{console.log(JSON.stringify(await recoveryStatus(pool),null,2));}finally{await pool.end();}
