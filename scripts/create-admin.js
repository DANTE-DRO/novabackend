import {database,migrate} from '../src/db.js';
import {id,verifyTotp} from '../src/security.js';
import bcrypt from 'bcryptjs';
const {ADMIN_EMAIL,ADMIN_PASSWORD,ADMIN_TOTP_SECRET}=process.env;
if(!ADMIN_EMAIL||!ADMIN_PASSWORD||ADMIN_PASSWORD.length<16||!ADMIN_TOTP_SECRET||ADMIN_TOTP_SECRET.includes('REPLACE'))throw new Error('Set ADMIN_EMAIL, ADMIN_PASSWORD (16+ characters), and ADMIN_TOTP_SECRET in backend .env.');
const p=database();try{await migrate(p);await p.query('INSERT INTO admins(id,email,password_hash) VALUES($1,$2,$3) ON CONFLICT(email) DO UPDATE SET password_hash=$3',[id(),ADMIN_EMAIL.toLowerCase(),await bcrypt.hash(ADMIN_PASSWORD,12)]);console.log('Administrator created. Import your TOTP secret into an authenticator app. Never publish it.');}finally{await p.end();}
