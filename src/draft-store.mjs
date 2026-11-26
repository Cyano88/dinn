import {emptyDraft} from '../public/draft-data.js';
export async function createDraftStore({env=process.env,db}={}){
 let owned=false;
 if(!db){if(!env.DATABASE_URL)throw Error('Draft database is not configured.');const {Pool}=await import('pg');db=new Pool({connectionString:env.DATABASE_URL,max:3,connectionTimeoutMillis:10000});owned=true;}
 await db.query(`CREATE TABLE IF NOT EXISTS dinn_drafts(owner TEXT PRIMARY KEY, revision INTEGER NOT NULL, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 await db.query('CREATE TABLE IF NOT EXISTS dinn_account_records(owner TEXT NOT NULL, key TEXT NOT NULL, revision INTEGER NOT NULL, value TEXT, PRIMARY KEY(owner,key))');
 await db.query('CREATE TABLE IF NOT EXISTS dinn_shared_findings(id UUID PRIMARY KEY, owner TEXT NOT NULL, ticker TEXT NOT NULL, url_hash TEXT NOT NULL, entry JSONB NOT NULL, shared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(owner,ticker,url_hash))');
 await db.query('CREATE TABLE IF NOT EXISTS dinn_creator_lore(owner TEXT NOT NULL, story TEXT NOT NULL, format TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE, activity_key TEXT NOT NULL UNIQUE, concept JSONB NOT NULL, PRIMARY KEY(owner,story), UNIQUE(story,format))');
 await db.query('CREATE TABLE IF NOT EXISTS dinn_token_metadata (id TEXT PRIMARY KEY, doc JSONB NOT NULL)');
 const result=row=>row?{revision:row.revision,data:row.data,updatedAt:row.updated_at}:{revision:0,data:emptyDraft(),updatedAt:null};
 return {
  putMetadata:(id,doc)=>db.query('INSERT INTO dinn_token_metadata(id,doc) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,doc]),
  metadata:async id=>(await db.query('SELECT doc FROM dinn_token_metadata WHERE id=$1',[id])).rows[0]?.doc,
  get:async owner=>result((await db.query('SELECT revision,data,updated_at FROM dinn_drafts WHERE owner=$1',[owner])).rows[0]),
  async put(owner,revision,data){
   const args=[owner,JSON.stringify(data),revision];
   const query=revision===0?`INSERT INTO dinn_drafts(owner,revision,data) VALUES($1,1,$2) ON CONFLICT(owner) DO NOTHING RETURNING revision,data,updated_at`:`UPDATE dinn_drafts SET revision=revision+1,data=$2,updated_at=NOW() WHERE owner=$1 AND revision=$3 RETURNING revision,data,updated_at`;
   const row=(await db.query(query,revision===0?args.slice(0,2):args)).rows[0];return row?result(row):null;
  },
  async records(owner){return (await db.query('SELECT key,revision,value FROM dinn_account_records WHERE owner=$1',[owner])).rows;},
  async writeRecord(owner,key,revision,value){
   const result=revision===0?
    await db.query('INSERT INTO dinn_account_records(owner,key,revision,value) VALUES($1,$2,1,$3) ON CONFLICT DO NOTHING RETURNING revision',[owner,key,value]):
    await db.query('UPDATE dinn_account_records SET revision=revision+1,value=$4 WHERE owner=$1 AND key=$2 AND revision=$3 RETURNING revision',[owner,key,revision,value]);
   return result.rows[0]||null;
  },
  async creatorLore(owner,story){return (await db.query('SELECT concept FROM dinn_creator_lore WHERE owner=$1 AND story=$2',[owner,story])).rows[0]?.concept;},
  async nameExisting(owner,story,concept,nameKey){
   const updated=await db.query("UPDATE dinn_creator_lore SET concept=$3,name_key=$4 WHERE owner=$1 AND story=$2 AND NOT (concept ? 'symbol') RETURNING concept",[owner,story,JSON.stringify(concept),nameKey]);
   return updated.rows[0]?.concept||this.creatorLore(owner,story);
  },
  async usedIdeas(story){return (await db.query('SELECT format,concept FROM dinn_creator_lore WHERE story=$1',[story])).rows;},
  async reserveLore(owner,story,format,name,activity,concept){
   return (await db.query('INSERT INTO dinn_creator_lore(owner,story,format,name_key,activity_key,concept) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING concept',[owner,story,format,name,activity,JSON.stringify(concept)])).rows[0]?.concept;
  },
  async publishFinding(owner,id,hash,entry){
   const r=await db.query('INSERT INTO dinn_shared_findings(id,owner,ticker,url_hash,entry) VALUES($1,$2,$3,$4,$5) ON CONFLICT(owner,ticker,url_hash) DO UPDATE SET entry=EXCLUDED.entry RETURNING id',[id,owner,entry.ticker,hash,JSON.stringify(entry)]);
   return r.rows[0];
  },
  async findings(id){
   return (await db.query('SELECT id,entry,shared_at FROM dinn_shared_findings '+(id?'WHERE id=$1 ':'')+'ORDER BY shared_at DESC,id LIMIT 30',id?[id]:[])).rows;
  },
  close:async()=>{if(owned)await db.end();}
 };
}
