export async function createPonsLaunchStore({env=process.env,db}={}){
 let owned=false;
 if(!db){if(!env.DATABASE_URL)throw Error('Pons launch history database is not configured.');const {Pool}=await import('pg');db=new Pool({connectionString:env.DATABASE_URL,max:3,connectionTimeoutMillis:10000});owned=true;}
 await db.query(`CREATE TABLE IF NOT EXISTS dinn_pons_launches(owner TEXT NOT NULL,transaction_hash TEXT NOT NULL,token_address TEXT NOT NULL,curve_address TEXT NOT NULL,deployer TEXT NOT NULL,name TEXT NOT NULL,symbol TEXT NOT NULL,logo TEXT NOT NULL,pair_token TEXT NOT NULL,pair_symbol TEXT NOT NULL,launch_block BIGINT NOT NULL,launched_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(owner,transaction_hash),UNIQUE(owner,token_address))`);
 await db.query("ALTER TABLE dinn_pons_launches ADD COLUMN IF NOT EXISTS website text NOT NULL DEFAULT ''");
 await db.query(`CREATE TABLE IF NOT EXISTS dinn_bankr_launches(transaction_hash TEXT PRIMARY KEY,token_address TEXT NOT NULL UNIQUE,pool_id TEXT NOT NULL,name TEXT NOT NULL,symbol TEXT NOT NULL,logo TEXT NOT NULL,pair_token TEXT NOT NULL,pair_symbol TEXT NOT NULL,launch_block BIGINT NOT NULL,launched_at TIMESTAMPTZ NOT NULL)`);
 const catalog=`WITH launches AS (
   SELECT DISTINCT ON (token_address) 4663 AS chain_id,transaction_hash,token_address,curve_address,name,symbol,logo,pair_token,pair_symbol,launch_block,launched_at FROM dinn_pons_launches ORDER BY token_address,launched_at DESC,created_at DESC
 ), catalog AS (
   SELECT * FROM launches UNION ALL SELECT 8453,transaction_hash,token_address,pool_id,name,symbol,logo,pair_token,pair_symbol,launch_block,launched_at FROM dinn_bankr_launches
 )`;
 const from=row=>({...(row.chain_id===8453?{chainId:8453,origin:'dinn-bankr'}:{}),hash:row.transaction_hash,token:row.token_address,curve:row.curve_address,name:row.name,symbol:row.symbol,logo:row.logo,pairToken:row.pair_token,pairSymbol:row.pair_symbol,blockNumber:String(row.launch_block),launchedAt:new Date(row.launched_at).toISOString()});
 return {
  async put(owner,item){const rows=(await db.query(`INSERT INTO dinn_pons_launches(owner,transaction_hash,token_address,curve_address,deployer,name,symbol,logo,pair_token,pair_symbol,launch_block,launched_at,website) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TO_TIMESTAMP($12),$13) ON CONFLICT(owner,transaction_hash) DO UPDATE SET website=EXCLUDED.website,token_address=EXCLUDED.token_address,curve_address=EXCLUDED.curve_address,deployer=EXCLUDED.deployer,name=EXCLUDED.name,symbol=EXCLUDED.symbol,logo=EXCLUDED.logo,pair_token=EXCLUDED.pair_token,pair_symbol=EXCLUDED.pair_symbol,launch_block=EXCLUDED.launch_block,launched_at=EXCLUDED.launched_at RETURNING *`,[owner,item.hash,item.token,item.curve,item.account,item.name,item.symbol,item.logo,item.pairToken,item.pairSymbol,item.blockNumber,item.launchedAtSeconds,item.website||''])).rows;return from(rows[0]);},
  async putBankr(item){
   await db.query(`INSERT INTO dinn_bankr_launches(transaction_hash,token_address,pool_id,name,symbol,logo,pair_token,pair_symbol,launch_block,launched_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,TO_TIMESTAMP($10))
    ON CONFLICT(transaction_hash) DO UPDATE SET logo=COALESCE(NULLIF(EXCLUDED.logo,''),dinn_bankr_launches.logo)`,[item.hash.toLowerCase(),item.token.toLowerCase(),item.poolId,item.name,item.symbol,item.logo,item.pairToken,item.pairSymbol,item.blockNumber,item.launchedAtSeconds]);
  },
  async list({query='',limit=10,offset=0}={}){
   const term=query.replace(/^\$/,''),q=term?'%'+term+'%':null;
   const filtered=' FROM catalog WHERE ($1::text IS NULL OR name ILIKE $1 OR symbol ILIKE $1 OR token_address ILIKE $1)';
   const [items,count]=await Promise.all([db.query(catalog+' SELECT *'+filtered+' ORDER BY launched_at DESC,transaction_hash DESC LIMIT $2 OFFSET $3',[q,limit,offset]),db.query(catalog+' SELECT COUNT(*)::integer AS total'+filtered,[q])]);
   return {items:items.rows.map(from),total:count.rows[0]?.total||0};
  },
  close:async()=>{if(owned)await db.end();}
 };
}
