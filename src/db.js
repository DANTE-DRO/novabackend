import pg from 'pg';
import { readFile } from 'node:fs/promises';
export function database(env=process.env){
  if(!env.DATABASE_URL) throw new Error('DATABASE_URL is required. Use a managed PostgreSQL database; no local SQLite or /var/data writes.');
  let url;try{url=new URL(env.DATABASE_URL);}catch{throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');}
  if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('DATABASE_URL must use postgresql://');
  const neon=url.hostname.endsWith('.neon.tech');
  if(neon&&['disable','allow','prefer','no-verify'].includes(url.searchParams.get('sslmode')))throw new Error('Neon requires secure TLS. Copy the sslmode=require connection string from Neon Connect.');
  if(neon&&!url.searchParams.has('sslmode'))url.searchParams.set('sslmode','verify-full');
  const pool=new pg.Pool({connectionString:url.toString(),ssl:env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined,max:10,idleTimeoutMillis:30000,connectionTimeoutMillis:15000});
  // A managed database may suspend/restart; idle disconnects must not crash Node.
  pool.on('error',e=>console.error('Database idle connection closed ('+(e.code||e.name)+'); the pool will reconnect on the next query.'));
  return pool;
}
export async function migrate(pool){const c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(75021930)');await c.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
export async function transaction(pool,fn){const c=await pool.connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
