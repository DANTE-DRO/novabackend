import crypto from 'node:crypto';
const bytes=crypto.randomBytes(20);let bits=[...bytes].map(x=>x.toString(2).padStart(8,'0')).join('');const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';const base32=(bits.match(/.{1,5}/g)||[]).map(s=>alphabet[parseInt(s.padEnd(5,'0'),2)]).join('');
console.log('PRIVATE: copy into backend environment. Never put these in frontend/config.js.');
console.log('APP_SECRET='+crypto.randomBytes(32).toString('hex'));
console.log('DATA_ENCRYPTION_KEY='+crypto.randomBytes(32).toString('hex'));
console.log('ADMIN_TOTP_SECRET='+base32);
console.log('PAYOUT_WEBHOOK_SECRET='+crypto.randomBytes(32).toString('hex'));
