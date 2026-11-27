let connection;

export function pairCatalog(env) {
 if (!env.DATABASE_URL) return null;
 if (!connection) connection = openCatalog(env.DATABASE_URL).catch(error => {
  connection = undefined;
  throw error;
 });
 return connection;
}

async function openCatalog(connectionString) {
 const { Pool } = await import('pg');
 const db = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 4000, statement_timeout: 5000, allowExitOnIdle: true });
 db.on('error', () => console.error('Base discovery database connection interrupted.'));
 try { return await createPairCatalog(db); }
 catch (error) { await db.end(); throw error; }
}

export async function createPairCatalog(db) {
 await db.query(`CREATE TABLE IF NOT EXISTS dinn_base_pair_catalog (
  token text PRIMARY KEY, launch jsonb NOT NULL, last_checked timestamptz
 )`);
 return {
  async verifiedLaunch(token) {
   const {rows}=await db.query('SELECT transaction_hash, token_address, pool_id, name, symbol, pair_token, pair_symbol, launched_at FROM dinn_bankr_launches WHERE token_address=$1',[token]);
   const r=rows[0];
   return r?{chain:'base',status:'deployed',tokenAddress:r.token_address,tokenName:r.name,tokenSymbol:r.symbol,pairedStock:{address:r.pair_token,symbol:r.pair_symbol},poolId:r.pool_id,txHash:r.transaction_hash,timestamp:new Date(r.launched_at).getTime()}:null;
  },
  async remember(launches) {
   if (!launches.length) return;
   const records = launches.map(l => ({
    tokenAddress: l.tokenAddress.toLowerCase(), pairedStock: { address: l.pairedStock.address.toLowerCase() },
    poolId: l.poolId, txHash: l.txHash, tokenSymbol: String(l.tokenSymbol || '').slice(0,40)
   }));
   await db.query(`INSERT INTO dinn_base_pair_catalog (token, launch)
    SELECT value->>'tokenAddress', value FROM jsonb_array_elements($1::jsonb)
    ON CONFLICT(token) DO UPDATE SET launch = excluded.launch
    WHERE dinn_base_pair_catalog.launch IS DISTINCT FROM excluded.launch`, [JSON.stringify(records)]);
  },
  async sample(stockAddresses) {
   const {rows} = await db.query(`SELECT launch, count(*) OVER ()::int AS total FROM dinn_base_pair_catalog
    WHERE launch->'pairedStock'->>'address' = ANY($1::text[])
    ORDER BY last_checked ASC NULLS FIRST, token LIMIT 8`, [stockAddresses]);
   return { launches: rows.map(row => row.launch), total: rows[0]?.total || 0 };
  },
  async checked(tokens) {
   await db.query('UPDATE dinn_base_pair_catalog SET last_checked=now() WHERE token=ANY($1::text[])', [tokens]);
  }
 };
}
