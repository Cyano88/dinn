export async function createNearMarketNotifier({databaseUrl=process.env.DATABASE_URL}={}){
 if(typeof databaseUrl!=='string'||!databaseUrl)throw Error('Dinn PostgreSQL is not configured for marketplace webhooks.');
 const {Pool}=await import('pg');
 const pool=new Pool({connectionString:databaseUrl,max:1,connectionTimeoutMillis:5000});
 return {
  async notify(event){
   if(typeof event!=='string'||event.length>80)throw Error('Invalid marketplace event.');
   await pool.query('SELECT pg_notify($1,$2)',['dinn_near_market',JSON.stringify({event})]);
  },
  close(){return pool.end();}
 };
}
