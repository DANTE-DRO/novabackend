import pg from 'pg';
import { readFile } from 'node:fs/promises';
export function database(env=process.env){
  if(!env.DATABASE_URL) throw new Error('DATABASE_URL is required. Use a managed PostgreSQL database; no local SQLite or /var/data writes.');
  return new pg.Pool({connectionString:env.DATABASE_URL,ssl:env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined,max:10,idleTimeoutMillis:30000,connectionTimeoutMillis:10000});
}
export async function migrate(pool){const c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(75021930)');await c.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
export async function transaction(pool,fn){const c=await pool.connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
