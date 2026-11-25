import {randomUUID,createHash} from 'node:crypto';

export const defaultChatLimit=50;
export function chatLimit(env){
 const n=Number(env.DINN_CHAT_FREE_DAILY_LIMIT??defaultChatLimit);
 if(!Number.isSafeInteger(n)||n<1)throw Error('Invalid chat allowance settings.');
 return n;
}

export async function createChatAllowanceStore({env=process.env,db}={}){
 let owned=false;
 if(!db){
  if(!env.DATABASE_URL)throw Error('Chat allowance database unavailable.');
  const {Pool}=await import('pg');
  db=new Pool({connectionString:env.DATABASE_URL,max:3,connectionTimeoutMillis:5000});owned=true;
 }
 async function transaction(fn){
  if(db.transaction)return db.transaction(fn);
  const c=await db.connect();
  try{await c.query('BEGIN');const value=await fn(c);await c.query('COMMIT');return value;}
  catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 let nextSweep=0;
 try{await db.query(`CREATE TABLE IF NOT EXISTS dinn_chat_turns (
  owner text NOT NULL, day date NOT NULL, id text NOT NULL, fingerprint text NOT NULL,
  lease uuid NOT NULL, started timestamptz NOT NULL DEFAULT now(), reply text,
  PRIMARY KEY (owner,day,id))`);}catch(e){if(owned)await db.end();throw e;}
 return {
  async reserve(owner,id,input,limit){
   const fingerprint=createHash('sha256').update(JSON.stringify(input)).digest('hex');
   if(Date.now()>=nextSweep){
    await db.query("DELETE FROM dinn_chat_turns WHERE day<(now() AT TIME ZONE 'UTC')::date AND (reply IS NOT NULL OR started<now()-interval '10 minutes')");
    nextSweep=Date.now()+3600000;
   }
   return transaction(async c=>{
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[owner]);
    const day=(await c.query("SELECT (clock_timestamp() AT TIME ZONE 'UTC')::date::text AS day")).rows[0].day;
    await c.query("DELETE FROM dinn_chat_turns WHERE owner=$1 AND ((day<$2 AND reply IS NOT NULL) OR (reply IS NULL AND started<now()-interval '10 minutes'))",[owner,day]);
    const old=(await c.query('SELECT fingerprint,reply FROM dinn_chat_turns WHERE owner=$1 AND day=$2 AND id=$3',[owner,day,id])).rows[0];
    if(old){
     if(old.fingerprint!==fingerprint)return {status:409,error:'This request ID was already used for a different message.'};
     if(old.reply===null)return {status:409,error:'Dinn is still working on this message. Try again shortly.'};
     return {replay:{message:old.reply,actions:[]}};
    }
    const {rows}=await c.query('SELECT count(*)::integer AS used FROM dinn_chat_turns WHERE owner=$1 AND day=$2',[owner,day]);
    if(rows[0].used>=limit)return {status:429,code:'daily_chat_limit',error:'You have reached your daily limit of '+limit+' chat replies. It resets at midnight UTC. You can still finish a pending wallet action.'};
    const lease=randomUUID();
    await c.query('INSERT INTO dinn_chat_turns(owner,day,id,fingerprint,lease) VALUES($1,$2,$3,$4,$5)',[owner,day,id,fingerprint,lease]);
    return {ticket:[owner,day,id,lease]};
   });
  },
  async finish(ticket,result){
   // On replay, return text only. Wallet reviews and draft changes require fresh terms.
   const interactive=result.actions?.length||result.launchDraft||result.tradeQuoteOffer;
   const reply=interactive?'This request already completed. Ask for fresh terms to continue.':result.message;
   const saved=await db.query('UPDATE dinn_chat_turns SET reply=$5 WHERE owner=$1 AND day=$2 AND id=$3 AND lease=$4 AND reply IS NULL RETURNING id',[...ticket,reply]);
   if(!saved.rows.length)throw Error('This chat request has expired. Please try again.');
  },
  async release(ticket){await db.query('DELETE FROM dinn_chat_turns WHERE owner=$1 AND day=$2 AND id=$3 AND lease=$4 AND reply IS NULL',ticket);},
  async close(){if(owned)await db.end();}
 };
}
