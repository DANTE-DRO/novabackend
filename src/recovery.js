// Neon/PostgreSQL is the primary store. This is a same-database recovery mirror,
// not an independent off-site backup or a replacement for Neon's history window.
import {createHash} from 'node:crypto';
import {transaction} from './db.js';
export const EXPORT_INTERVAL_MS=120000;
export const RESTORE_INTERVAL_MS=240000;
// Dependency order: restore parents before their foreign-key children.
export const TABLES=[
 ['users',['id']],['admins',['id']],['corpus',['id']],
 ['sessions',['token_hash']],['challenges',['id']],['email_codes',['id']],
 ['assignments',['id']],['ledger',['id']],['payouts',['id']],
 ['tickets',['id']],['messages',['id']],['notifications',['id']],
 ['announcements',['id']],['audits',['id']],['webhook_events',['id']],
 ['quiz_questions',['user_id','position']],['verification_submissions',['id']],['quiz_answers',['id']]
];
const quote=s=>'"'+s.replaceAll('"','""')+'"';
const keyExpr=(alias,keys)=>`jsonb_build_array(${keys.map(k=>`${alias}.${quote(k)}`).join(',')})`;
const hash=s=>createHash('sha256').update(s).digest('hex');
const lock=async c=>{await c.query('SELECT pg_advisory_xact_lock(75021931)');await c.query("SET LOCAL lock_timeout='10s'");};
const lockTables=c=>c.query('LOCK TABLE '+TABLES.map(([t])=>'public.'+quote(t)).join(',')+' IN SHARE ROW EXCLUSIVE MODE');
async function setup(pool,env){
 await transaction(pool,async c=>{
  await lock(c);
  await c.query(`CREATE SCHEMA IF NOT EXISTS nova_recovery;
   REVOKE ALL ON SCHEMA nova_recovery FROM PUBLIC;
   CREATE TABLE IF NOT EXISTS nova_recovery.rows (
    table_name text NOT NULL,row_key jsonb NOT NULL,data jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(table_name,row_key));
   CREATE TABLE IF NOT EXISTS nova_recovery.state (
    id boolean PRIMARY KEY DEFAULT true CHECK(id),initialized_at timestamptz NOT NULL DEFAULT now(),
    app_secret_hash text NOT NULL,encryption_key_hash text NOT NULL,
    last_checkpoint_at timestamptz,last_restore_at timestamptz,last_restored_count bigint NOT NULL DEFAULT 0);
   REVOKE ALL ON ALL TABLES IN SCHEMA nova_recovery FROM PUBLIC;`);
  const old=(await c.query('SELECT * FROM nova_recovery.state WHERE id=true')).rows[0];
  if(old&&(old.app_secret_hash!==hash(env.APP_SECRET)||old.encryption_key_hash!==hash(env.DATA_ENCRYPTION_KEY)))throw new Error('Persistent database key mismatch. Restore the original APP_SECRET and DATA_ENCRYPTION_KEY in Render; do not regenerate secrets on redeploy.');
  if(!old)await c.query('INSERT INTO nova_recovery.state(id,app_secret_hash,encryption_key_hash) VALUES(true,$1,$2)',[hash(env.APP_SECRET),hash(env.DATA_ENCRYPTION_KEY)]);
  // Capture INSERT/UPDATE/DELETE in the SAME transaction as the business write.
  // Ephemeral DELETE removes its mirror: logout and quiz resets must stay deleted.
  // Durable row DELETE is treated as loss; intentional account deletion remains
  // the existing anonymizing UPDATE, so personal information stays erased.
  // TRUNCATE does not fire this row trigger, allowing accidental table-wipe recovery.
  await c.query(`CREATE OR REPLACE FUNCTION nova_recovery.capture_row() RETURNS trigger
   LANGUAGE plpgsql SET search_path=pg_catalog,public,nova_recovery AS $$
   DECLARE record_data jsonb; previous_key jsonb; current_key jsonb;
   BEGIN
    IF TG_OP <> 'INSERT' THEN
     SELECT jsonb_agg(to_jsonb(OLD)->k ORDER BY n) INTO previous_key
      FROM unnest(TG_ARGV) WITH ORDINALITY AS args(k,n);
    END IF;
    IF TG_OP='DELETE' THEN
     IF TG_TABLE_NAME IN ('sessions','challenges','email_codes','quiz_questions','quiz_answers') THEN
      DELETE FROM nova_recovery.rows WHERE table_name=TG_TABLE_NAME AND row_key=previous_key;
     END IF;
     RETURN OLD;
    END IF;
    record_data=to_jsonb(NEW);
    SELECT jsonb_agg(record_data->k ORDER BY n) INTO current_key
     FROM unnest(TG_ARGV) WITH ORDINALITY AS args(k,n);
    IF TG_OP='UPDATE' AND previous_key IS DISTINCT FROM current_key THEN
     DELETE FROM nova_recovery.rows WHERE table_name=TG_TABLE_NAME AND row_key=previous_key;
    END IF;
    INSERT INTO nova_recovery.rows(table_name,row_key,data) VALUES(TG_TABLE_NAME,current_key,record_data)
     ON CONFLICT(table_name,row_key) DO UPDATE SET data=EXCLUDED.data,updated_at=now();
    RETURN NEW;
   END $$;`);
  await lockTables(c);
  for(const [table,keys] of TABLES){
   await c.query(`CREATE OR REPLACE TRIGGER nova_recovery_capture AFTER INSERT OR UPDATE OR DELETE ON public.${quote(table)} FOR EACH ROW EXECUTE FUNCTION nova_recovery.capture_row(${keys.map(k=>"'"+k+"'").join(',')})`);
  }
 });
}
async function sanitize(c){
 // Expired/used credentials must never become valid again after recovery.
 await c.query(`DELETE FROM nova_recovery.rows WHERE table_name IN ('sessions','challenges','email_codes')
  AND ((data->>'expires_at')::timestamptz<=now() OR COALESCE((data->>'used')::boolean,false));`);
 // Do not retain biometric evidence beyond its existing seven-day expiry policy.
 await c.query(`UPDATE nova_recovery.rows SET data=jsonb_set(data,'{evidence_encrypted}','null'::jsonb),updated_at=now()
  WHERE table_name='verification_submissions' AND data->>'evidence_encrypted' IS NOT NULL AND (data->>'expires_at')::timestamptz<=now()`);
}
export async function restoreMissing(pool){
 return transaction(pool,async c=>{
  await lock(c);await sanitize(c);let restored=0,missing=false;
  // Healthy checks use read-only scans: do not block application writes every
  // four minutes. Coordinate table writes only if recovery is actually needed.
  for(const [table,keys] of TABLES){
   const found=await c.query(`SELECT 1 FROM nova_recovery.rows b
    CROSS JOIN LATERAL jsonb_populate_record(NULL::public.${quote(table)},b.data) recovered
    WHERE b.table_name=$1 AND NOT EXISTS (SELECT 1 FROM public.${quote(table)} live
     WHERE ${keys.map(k=>`live.${quote(k)}=recovered.${quote(k)}`).join(' AND ')}) LIMIT 1`,[table]);
   if(found.rowCount){missing=true;break;}
  }
  if(missing)await lockTables(c);
  if(missing)for(const [table,keys] of TABLES){
   // No UPDATE, no overwrite, no re-credit, and no payout/provider calls.
   const r=await c.query(`INSERT INTO public.${quote(table)} SELECT recovered.*
    FROM nova_recovery.rows b CROSS JOIN LATERAL jsonb_populate_record(NULL::public.${quote(table)},b.data) recovered
    WHERE b.table_name=$1 AND NOT EXISTS
     (SELECT 1 FROM public.${quote(table)} live WHERE ${keys.map(k=>`live.${quote(k)}=recovered.${quote(k)}`).join(' AND ')})
    ON CONFLICT DO NOTHING`,[table]);
   restored+=r.rowCount;
  }
  await c.query('UPDATE nova_recovery.state SET last_restore_at=now(),last_restored_count=$1 WHERE id=true',[restored]);
  return restored;
 });
}
async function backfill(pool){
 // First deployment/upgrade only: copy legacy records that predate capture triggers.
 await transaction(pool,async c=>{
  await lock(c);await lockTables(c);
  for(const [table,keys] of TABLES)await c.query(`INSERT INTO nova_recovery.rows(table_name,row_key,data)
   SELECT $1,${keyExpr('source',keys)},to_jsonb(source) FROM public.${quote(table)} source ON CONFLICT DO NOTHING`,[table]);
  await sanitize(c);
 });
}
export async function checkpoint(pool){
 // The export is continuously committed by capture_row. Every two minutes seal a
 // checkpoint timestamp after SQL has verified that the durable mirror is readable.
 await transaction(pool,async c=>{
  await lock(c);await sanitize(c);
  await c.query('SELECT 1 FROM nova_recovery.rows LIMIT 1');
  await c.query('UPDATE nova_recovery.state SET last_checkpoint_at=now() WHERE id=true');
 });
}
export async function recoveryStatus(pool){
 const state=(await pool.query('SELECT initialized_at,last_checkpoint_at,last_restore_at,last_restored_count FROM nova_recovery.state WHERE id=true')).rows[0];
 return {enabled:true,storage:'postgresql-primary-with-transactional-recovery-mirror',exportIntervalSeconds:120,restoreIntervalSeconds:240,...state};
}
export async function initializeRecovery(pool,env=process.env,{schedule=true,log=console.log}={}){
 await setup(pool,env);
 const recovered=await restoreMissing(pool);await backfill(pool);await checkpoint(pool);
 log('Persistent recovery ready; startup restored '+recovered+' missing rows. Checkpoint: 120s; recovery check: 240s.');
 let stopped=false,chain=Promise.resolve();const timers=[];
 const enqueue=fn=>{chain=chain.then(()=>stopped?undefined:fn()).catch(e=>{console.error('Persistent recovery check failed ('+(e.code||e.name)+'); retrying on next interval.');});};
 if(schedule){
  timers.push(setInterval(()=>enqueue(()=>checkpoint(pool)),EXPORT_INTERVAL_MS));
  timers.push(setInterval(()=>enqueue(async()=>{const n=await restoreMissing(pool);if(n)log('Persistent recovery restored '+n+' missing rows.');}),RESTORE_INTERVAL_MS));
  timers.forEach(t=>t.unref());
 }
 return {status:()=>recoveryStatus(pool),async stop(){stopped=true;timers.forEach(clearInterval);await chain;}};
}
