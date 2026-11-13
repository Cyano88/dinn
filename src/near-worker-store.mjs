import {randomUUID} from 'node:crypto';
export async function createNearWorkerStore({env=process.env,db,initialize=true}={}){
 let owned=false;if(!db){if(!env.DATABASE_URL)throw Error('NEAR worker requires PostgreSQL DATABASE_URL.');const {Pool}=await import('pg');db=new Pool({connectionString:env.DATABASE_URL,max:3,connectionTimeoutMillis:10000});owned=true;}
 try{
  if(initialize){
   await db.query(`CREATE TABLE IF NOT EXISTS dinn_near_work(worker_id TEXT NOT NULL,assignment_id TEXT NOT NULL,data JSONB NOT NULL DEFAULT '{}',lease_token TEXT,lease_until TIMESTAMPTZ,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(worker_id,assignment_id))`);
   await db.query(`CREATE TABLE IF NOT EXISTS dinn_near_work_events(id BIGSERIAL PRIMARY KEY,worker_id TEXT NOT NULL,assignment_id TEXT NOT NULL,event TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  }else{
   await db.query('SELECT 1 FROM dinn_near_work LIMIT 0');
   await db.query('SELECT 1 FROM dinn_near_work_events LIMIT 0');
  }
 }catch(error){if(owned)await db.end().catch(()=>{});throw error;}
 return {
  async acquire(worker,id){const token=randomUUID();const r=await db.query(`INSERT INTO dinn_near_work(worker_id,assignment_id,lease_token,lease_until) VALUES($1,$2,$3,NOW()+INTERVAL '180 seconds') ON CONFLICT(worker_id,assignment_id) DO UPDATE SET lease_token=$3,lease_until=NOW()+INTERVAL '180 seconds' WHERE dinn_near_work.lease_until IS NULL OR dinn_near_work.lease_until<NOW() RETURNING data`,[worker,id,token]);return r.rows[0]?{worker,id,token,data:r.rows[0].data}:null;},
  async renew(lock){const r=await db.query(`UPDATE dinn_near_work SET lease_until=NOW()+INTERVAL '180 seconds' WHERE worker_id=$1 AND assignment_id=$2 AND lease_token=$3 AND lease_until>NOW() RETURNING assignment_id`,[lock.worker,lock.id,lock.token]);if(!r.rows.length)throw Error('Worker lease lost.');},
  async save(lock,data){const r=await db.query(`UPDATE dinn_near_work SET data=$4,updated_at=NOW() WHERE worker_id=$1 AND assignment_id=$2 AND lease_token=$3 AND lease_until>NOW() RETURNING data`,[lock.worker,lock.id,lock.token,JSON.stringify(data)]);if(!r.rows.length)throw Error('Worker lease lost.');lock.data=r.rows[0].data;return lock.data;},
  async event(lock,event){await db.query('INSERT INTO dinn_near_work_events(worker_id,assignment_id,event) VALUES($1,$2,$3)',[lock.worker,lock.id,event]);},
  async release(lock){await db.query('UPDATE dinn_near_work SET lease_token=NULL,lease_until=NULL WHERE worker_id=$1 AND assignment_id=$2 AND lease_token=$3',[lock.worker,lock.id,lock.token]);},
  async get(worker,id){return (await db.query('SELECT data FROM dinn_near_work WHERE worker_id=$1 AND assignment_id=$2',[worker,id])).rows[0]?.data||null;},
  async close(){if(owned)await db.end();}
 };
}
