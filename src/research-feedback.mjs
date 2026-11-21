import {createHash} from 'node:crypto';
import {PrivyClient} from '@privy-io/node';
import {Pool} from 'pg';

const digest=value=>createHash('sha256').update(value).digest('hex');
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
let pool,ready,privy;
export async function feedbackDb(){
 if(!process.env.DATABASE_URL)throw Error('Feedback storage unavailable.');
 pool??=new Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:5000});
 ready??=pool.query(`CREATE TABLE IF NOT EXISTS dinn_research_feedback (
   id TEXT PRIMARY KEY, source TEXT NOT NULL, actor TEXT, target TEXT NOT NULL,
   audience TEXT NOT NULL DEFAULT 'unclassified', offered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
   reply TEXT, replied_at TIMESTAMPTZ)`).catch(e=>{ready=null;throw e;});
 await ready;return pool;
}
export async function feedbackRequest(req,path,data,{database=feedbackDb,verifyChatUser}={}){
 const error=(status,message)=>({status,body:{error:message}});
 if(!data || typeof data!=='object'||Array.isArray(data))return error(400,'Invalid feedback request.');
 const isMarket=path==='/api/feedback/market';
 if(!isMarket && path!=='/api/feedback/chat')return error(404,'Unknown feedback route.');
 if(!uuid(data.id))return error(400,'Invalid feedback reference.');
 const hasReply=Object.hasOwn(data,'reply');
 if(hasReply && (typeof data.reply!=='string'||!data.reply.trim()||data.reply.length>600))return error(400,'Enter up to 600 characters.');
 let actor=null,target,source,audience='unclassified';
 if(isMarket){
  if(typeof data.code!=='string'||!/^[a-f0-9]{64}$/.test(data.code))return error(403,'Invalid feedback link.');
  const db=await database();
  const {rows}=await db.query("SELECT data->>'phase' phase,data->>'feedbackTarget' target,data->>'testRun' test FROM dinn_near_work WHERE assignment_id=$1 AND data->>'feedbackDigest'=$2 LIMIT 1",[data.id,digest(data.code)]);
  if(!rows.length)return error(403,'Invalid feedback link.');
  if(!['accepted-payout-pending','accepted-test-run'].includes(rows[0].phase))return error(409,'Feedback opens after acceptance. If you just accepted, try again in a minute.');
  target=rows[0].target;source='marketplace';if(rows[0].test==='true')audience='test';
 }else{
  const token=req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];if(!token)return error(401,'Sign in to leave feedback.');
  try{let uid;if(verifyChatUser)uid=await verifyChatUser(token);else{privy??=new PrivyClient({appId:process.env.PRIVY_APP_ID,appSecret:process.env.PRIVY_APP_SECRET});uid=(await privy.utils().auth().verifyAccessToken(token)).user_id;}if(!uid)throw Error();actor=digest('chat:'+uid);if((process.env.DINN_INTERNAL_FEEDBACK_USERS||'').split(',').map(v=>v.trim()).includes(uid))audience='test';}catch{return error(401,'Sign in to leave feedback.');}
  if(!/^0x[a-f0-9]{40}$/i.test(data.target)||![4663,8453].includes(data.chainId))return error(400,'Invalid research target.');
  source='chat';target=data.chainId+':'+data.target.toLowerCase();
 }
 const db=await database(),id=source+':'+(actor?actor+':':'')+data.id;
 await db.query('INSERT INTO dinn_research_feedback(id,source,actor,target,audience) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[id,source,actor,target,audience]);
 if(hasReply){
  const reply=data.reply.trim();
  const result=await db.query('UPDATE dinn_research_feedback SET reply=$2,replied_at=COALESCE(replied_at,now()) WHERE id=$1 AND target=$3 AND (reply IS NULL OR reply=$2) RETURNING id',[id,reply,target]);
  if(!result.rowCount)return error(409,'Feedback already received for this research.');
 }
 return {status:200,body:{saved:hasReply}};
}
