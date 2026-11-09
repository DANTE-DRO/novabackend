// HISTORICAL preview/provider harness. Use npm run test:browser (fixed-browser.mjs) for the repaired live offline flow.
// Local testing only. Never deploy this file or these mock adapters as your server.
import {database,migrate} from '../src/db.js';
import {createApp} from '../src/app.js';
import {seedCorpus} from '../src/seed.js';
import {hash,privateHash,id,encrypt} from '../src/security.js';
import bcrypt from 'bcryptjs';
if(process.env.NODE_ENV==='production'||!process.env.TEST_DATABASE_URL)throw new Error('Local TEST_DATABASE_URL is required; never run in production.');
const env={DATABASE_URL:process.env.TEST_DATABASE_URL,APP_SECRET:'browser-test-secret-with-more-than-32-characters',DATA_ENCRYPTION_KEY:'22'.repeat(32),ADMIN_PATH:'/test-operations',ADMIN_TOTP_SECRET:'JBSWY3DPEHPK3PXP',FRONTEND_ORIGINS:'http://localhost:5173,http://127.0.0.1:5173',REGISTRATION_ENABLED:'true',LEGAL_APPROVED:'true',SMTP_HOST:'test',GATEWAY_URL:'https://mock.invalid',GRADER_API_KEY:'test',PAYOUT_WEBHOOK_SECRET:'test-webhook',ENABLED_PAYOUT_METHODS:'mpesa,paypal',PIN_IP:'false'};
const p=database(env);await migrate(p);await p.query('TRUNCATE webhook_events,audits,announcements,notifications,messages,tickets,payouts,ledger,assignments,corpus,email_codes,challenges,sessions,admins,users CASCADE');
await seedCorpus(p);
await p.query('INSERT INTO admins(id,email,password_hash) VALUES($1,$2,$3)',[id(),'admin@example.com',await bcrypt.hash('BrowserAdminPassword123!',4)]);
const u=id();await p.query("INSERT INTO users(id,email,password_hash,full_name,dob,country,phone,language,device_hash,device_name,pinned_ip,status,email_verified,identity_state,identity_ref,interview_passed,quiz_attempt,quiz_correct,signed_at,balance_cents) VALUES($1,'contributor@example.com',$2,'Alex Morgan','1998-01-01','KE','+254712345678','sw',$3,'Linux · Chrome','test','active',true,'verified','test-identity',true,14,14,now(),2468)",[u,await bcrypt.hash('BrowserContributor123!',4),privateHash('10000000-0000-4000-8000-000000000001',env.APP_SECRET)]);
await p.query('INSERT INTO announcements(id,title,body) VALUES($1,$2,$3)',[id(),'A new language program is ready.','Explore daily tasks and share your perspective.']);
const services={email:async()=>{},gateway:async(path)=>path==='/identity/face-match'?{live:true,match:true}:{},grade:async()=>({verdict:'accepted',feedback:'Test adapter accepted this translation. This is not real model evaluation.'})};
const app=createApp({pool:p,env,services});app.listen(10001,'127.0.0.1',()=>console.log('LOCAL UI TEST server on 10001'));
