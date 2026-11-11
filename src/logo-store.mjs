import {readFile,mkdir} from 'node:fs/promises';
export async function createLogoStore(env=process.env){
 let db,transaction,close;
 if(env.DATABASE_URL){
  const {Pool}=await import('pg');db=new Pool({connectionString:env.DATABASE_URL,max:5,connectionTimeoutMillis:10000});
  transaction=async fn=>{const c=await db.connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}};close=()=>db.end();
 }else if(env.NODE_ENV!=='production'&&!env.RENDER&&env.DINN_LOGO_LOCAL_DB){
  const location=env.DINN_LOGO_LOCAL_DB;
  if(location!=='memory://')await mkdir(location,{recursive:true});
  const {PGlite}=await import('@electric-sql/pglite');db=new PGlite(location);await db.waitReady;transaction=fn=>db.transaction(fn);close=()=>db.close();
 }else throw Error('Logo database is not configured.');
 const schema=await readFile(new URL('../scripts/logo-schema.sql',import.meta.url),'utf8');
 if(db.exec)await db.exec(schema);else await db.query(schema);
 const one=async(sql,args)=>(await db.query(sql,args)).rows[0];
 return {close,
  async reserve({id,owner,fingerprint,model,prompt,limit}){return transaction(async c=>{
   await c.query('INSERT INTO dinn_logo_usage(owner,day,attempts) VALUES($1,CURRENT_DATE,0) ON CONFLICT DO NOTHING',[owner]);
   await c.query('SELECT attempts FROM dinn_logo_usage WHERE owner=$1 AND day=CURRENT_DATE FOR UPDATE',[owner]);
   const old=(await c.query('SELECT * FROM dinn_logos WHERE id=$1',[id])).rows[0];
   if(old){if(old.owner!==owner||old.fingerprint!==fingerprint)throw Error('This request ID belongs to a different request.');return {created:false,job:old};}
   await c.query("UPDATE dinn_logos SET state='uncertain',error='Generation was interrupted. Check saved previews before trying again.' WHERE owner=$1 AND state='generating' AND created_at < NOW()-INTERVAL '5 minutes'",[owner]);
   if((await c.query("SELECT id FROM dinn_logos WHERE owner=$1 AND state='generating' LIMIT 1",[owner])).rows.length)throw Error('A logo is already being generated.');
   const quota=await c.query('UPDATE dinn_logo_usage SET attempts=attempts+1 WHERE owner=$1 AND day=CURRENT_DATE AND attempts<$2 RETURNING attempts',[owner,limit]);
   if(!quota.rows.length)throw Error('Daily logo generation allowance reached.');
   const job=(await c.query("INSERT INTO dinn_logos(id,owner,fingerprint,model,prompt,state) VALUES($1,$2,$3,$4,$5,'generating') RETURNING *",[id,owner,fingerprint,model,prompt])).rows[0];return {created:true,job};
  });},
  async providerJob(id,job){await db.query('UPDATE dinn_logos SET provider_job=$2 WHERE id=$1',[id,JSON.stringify(job)]);},
  get:(id,owner)=>one('SELECT * FROM dinn_logos WHERE id=$1 AND owner=$2',[id,owner]),
  async list(owner){return (await db.query('SELECT id,state,error,model,created_at,accepted_at FROM dinn_logos WHERE owner=$1 ORDER BY created_at DESC LIMIT 20',[owner])).rows;},
  async ready(id,bytes){await db.query("UPDATE dinn_logos SET state='ready',image=$2,error=NULL WHERE id=$1 AND state IN ('generating','uncertain')",[id,bytes]);},
  async fail(id,message){await db.query("UPDATE dinn_logos SET state='uncertain',error=$2 WHERE id=$1 AND state='generating'",[id,message]);},
  accept:(id,owner)=>one("UPDATE dinn_logos SET accepted_at=COALESCE(accepted_at,NOW()) WHERE id=$1 AND owner=$2 AND state='ready' RETURNING *",[id,owner]),
  publicImage:async id=>(await one("SELECT image FROM dinn_logos WHERE id=$1 AND state='ready' AND accepted_at IS NOT NULL",[id]))?.image
 };
}
