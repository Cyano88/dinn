import {emptyDraft} from '../public/draft-data.js';
export async function createDraftStore({env=process.env,db}={}){
 let owned=false;
 if(!db){if(!env.DATABASE_URL)throw Error('Draft database is not configured.');const {Pool}=await import('pg');db=new Pool({connectionString:env.DATABASE_URL,max:3,connectionTimeoutMillis:10000});owned=true;}
 await db.query(`CREATE TABLE IF NOT EXISTS dinn_drafts(owner TEXT PRIMARY KEY, revision INTEGER NOT NULL, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 const result=row=>row?{revision:row.revision,data:row.data,updatedAt:row.updated_at}:{revision:0,data:emptyDraft(),updatedAt:null};
 return {
  get:async owner=>result((await db.query('SELECT revision,data,updated_at FROM dinn_drafts WHERE owner=$1',[owner])).rows[0]),
  async put(owner,revision,data){
   const args=[owner,JSON.stringify(data),revision];
   const query=revision===0?`INSERT INTO dinn_drafts(owner,revision,data) VALUES($1,1,$2) ON CONFLICT(owner) DO NOTHING RETURNING revision,data,updated_at`:`UPDATE dinn_drafts SET revision=revision+1,data=$2,updated_at=NOW() WHERE owner=$1 AND revision=$3 RETURNING revision,data,updated_at`;
   const row=(await db.query(query,revision===0?args.slice(0,2):args)).rows[0];return row?result(row):null;
  },
  close:async()=>{if(owned)await db.end();}
 };
}
