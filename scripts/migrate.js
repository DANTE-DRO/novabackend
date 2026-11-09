import {database,migrate} from '../src/db.js';const p=database();try{await migrate(p);console.log('Schema ready.');}finally{await p.end();}
