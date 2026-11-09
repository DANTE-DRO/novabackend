import crypto from 'node:crypto';
// Original compositional material: 1,000 quantities × 10 objects × 10 places × 10 times.
// This is a template bank, not a million independently authored or linguist-certified sentences.
export const BANK_SIZE=1_000_000;
export const BANK_LANGUAGES=['sw','es','fr'];
const objects=[
 ['books','vitabu','libros','livres'],['chairs','viti','sillas','chaises'],
 ['tables','meza','mesas','tables'],['bags','mifuko','bolsas','sacs'],
 ['boxes','masanduku','cajas','boîtes'],['bottles','chupa','botellas','bouteilles'],
 ['cups','vikombe','tazas','tasses'],['plates','sahani','platos','assiettes'],
 ['pencils','penseli','lápices','crayons'],['baskets','vikapu','cestas','paniers']
];
const places=[
 ['the school','shuleni','la escuela',"à l’école"],['the hospital','hospitalini','el hospital',"à l’hôpital"],
 ['the library','maktabani','la biblioteca','à la bibliothèque'],['the market','sokoni','el mercado','au marché'],
 ['the office','ofisini','la oficina','au bureau'],['the shop','dukani','la tienda','au magasin'],
 ['the hotel','hotelini','el hotel',"à l’hôtel"],['the bank','benki','el banco','à la banque'],
 ['the station','kituoni','la estación','à la gare'],['the kitchen','jikoni','la cocina','à la cuisine']
];
const times=[
 ['on Monday','Jumatatu','el lunes','lundi'],['on Tuesday','Jumanne','el martes','mardi'],
 ['on Wednesday','Jumatano','el miércoles','mercredi'],['on Thursday','Alhamisi','el jueves','jeudi'],
 ['on Friday','Ijumaa','el viernes','vendredi'],['on Saturday','Jumamosi','el sábado','samedi'],
 ['on Sunday','Jumapili','el domingo','dimanche'],['tomorrow','kesho','mañana','demain'],
 ['today','leo','hoy',"aujourd’hui"],['next week','wiki ijayo','la próxima semana','la semaine prochaine']
];
export function bankEntry(index){
 if(!Number.isInteger(index)||index<0||index>=BANK_SIZE)throw new RangeError('Invalid sentence index');
 const time=times[index%10],place=places[Math.floor(index/10)%10],obj=objects[Math.floor(index/100)%10],n=Math.floor(index/1000)+2;
 const esPlace=['el hospital','el mercado','el hotel','el banco'].includes(place[2])?'al '+place[2].slice(3):'a '+place[2];
 const sw=`Tafadhali peleka ${obj[1]} ${n} ${place[1]} ${time[1]}.`;
 const es=`Por favor, entrega ${n} ${obj[2]} ${esPlace} ${time[2]}.`;
 const fr=`Veuillez livrer ${n} ${obj[3]} ${place[3]} ${time[3]}.`;
 return {id:'bank-v1-'+String(index).padStart(7,'0'),source:`Please deliver ${n} ${obj[0]} to ${place[0]} ${time[0]}.`,category:'Delivery and everyday quantities',generated_index:index,translations:{sw:[sw],es:[es,es.replace('entrega','entregue')],fr:[fr,fr.replace('Veuillez livrer','Merci de livrer')]}};
}
export async function ensureBank(pool,{target=BANK_SIZE,batchSize=2000,onProgress=()=>{}}={}){
 if(!Number.isInteger(target)||target<0||target>BANK_SIZE)throw new Error('CORPUS_TARGET must be 0..1000000');
 const c=await pool.connect();let locked=false;
 try{
  locked=(await c.query('SELECT pg_try_advisory_lock(75021931) AS locked')).rows[0].locked;
  if(!locked)return {busy:true};
  // Revisit batches with ON CONFLICT so an interrupted generation always resumes safely.
  for(let start=0;start<target;start+=batchSize){
   const end=Math.min(target,start+batchSize);
   const count=Number((await c.query('SELECT count(*) AS n FROM corpus WHERE generated_index >= $1 AND generated_index < $2',[start,end])).rows[0].n);
   if(count!==end-start){const items=Array.from({length:end-start},(_,i)=>bankEntry(start+i));await c.query(`INSERT INTO corpus(id,source,category,generated_index,translations)
    SELECT id,source,category,generated_index,translations FROM jsonb_to_recordset($1::jsonb) AS x(id text,source text,category text,generated_index integer,translations jsonb)
    ON CONFLICT DO NOTHING`,[JSON.stringify(items)]);}
   if(end%20000===0||end===target)onProgress(end,target);
  }
  return {target,complete:true};
 }finally{if(locked)await c.query('SELECT pg_advisory_unlock(75021931)');c.release();}
}
export function normalizeAnswer(value){return String(value).normalize('NFKC').toLocaleLowerCase('und').replace(/[’‘`]/g,"'").replace(/[-−](?=\s*\p{N})/gu,' MINUS ').replace(/\p{P}/gu,' ').replace(/\s+/g,' ').trim();}
export async function gradeStored(pool,source,answer,language){
 const item=(await pool.query('SELECT translations FROM corpus WHERE source=$1 AND active=true',[source])).rows[0];
 const expected=item?.translations?.[language];
 if(!Array.isArray(expected)||!expected.length)return {verdict:'review',feedback:'No stored answer is available in this language. A fluent reviewer must check this submission; no penalty or credit yet.'};
 if(expected.some(x=>normalizeAnswer(x)===normalizeAnswer(answer)))return {verdict:'accepted',feedback:'Your translation matches a stored accepted answer.'};
 const nums=s=>(String(s).match(/\d+/g)||[]).join('|');
 if(nums(expected[0])!==nums(answer))return {verdict:'rejected',feedback:'The quantities or numbers do not match the sentence. Check every number carefully.'};
 return {verdict:'review',feedback:'This wording is not in the stored answer variants. It needs a fluent human reviewer; no quality penalty or credit yet.'};
}
export async function sampleCorpus(c,userId,language,limit,{excludeHistory=true}={}){
 const max=(await c.query('SELECT max(generated_index) AS n FROM corpus')).rows[0].n;
 const selected=new Map();
 const history=excludeHistory?'AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.user_id=$3 AND a.task_id=c.id)':'';
 if(max!==null){for(let round=0;round<8&&selected.size<limit;round++){
  const picks=[...new Set(Array.from({length:Math.max(100,limit*3)},()=>crypto.randomInt(Number(max)+1)))];
  const r=await c.query(`SELECT c.id,c.source FROM corpus c WHERE c.generated_index=ANY($1::integer[]) AND c.active=true AND c.translations ? $2 ${history}`,[picks,language,...(excludeHistory?[userId]:[])]);
  for(const x of r.rows)if(selected.size<limit)selected.set(x.id,x);
 }}
 if(selected.size<limit){const pivot=crypto.randomUUID();for(const op of ['>=','<']){
  const r=await c.query(`SELECT c.id,c.source FROM corpus c WHERE c.active=true AND c.translations ? $1 AND c.id ${op} $2 ${excludeHistory?'AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.user_id=$3 AND a.task_id=c.id)':''} ORDER BY c.id LIMIT $${excludeHistory?4:3}`,[language,pivot,...(excludeHistory?[userId]:[]),limit-selected.size]);
  for(const x of r.rows)if(selected.size<limit)selected.set(x.id,x);
 }}
 // Fisher-Yates shuffle, with cryptographic randomness, after indexed sampling.
 const rows=[...selected.values()];for(let i=rows.length-1;i>0;i--){const j=crypto.randomInt(i+1);[rows[i],rows[j]]=[rows[j],rows[i]];}return rows;
}
