import {createNearMarketClient} from '../src/near-market-client.mjs';
import {createNearWorkerStore} from '../src/near-worker-store.mjs';
import {createNearWorker} from '../src/near-worker.mjs';
import {agentAccessRequest} from '../src/agent-access.mjs';

if(process.env.NEAR_WORKER_ENABLED!=='true')throw Error('Set NEAR_WORKER_ENABLED=true to start the Dinn marketplace worker.');
for(const name of ['DATABASE_URL','NEAR_AGENT_ID','NEAR_AGENT_TOKEN','NEAR_WORKER_ESCROW_TOKEN','NEAR_WORKER_MIN_ESCROW']){
 if(!process.env[name])throw Error(`Missing required worker configuration: ${name}.`);
}

const store=await createNearWorkerStore({initialize:false});
let worker;
try{
 worker=createNearWorker({
  client:createNearMarketClient({token:process.env.NEAR_AGENT_TOKEN}),
  agentId:process.env.NEAR_AGENT_ID,
  minimumEscrow:process.env.NEAR_WORKER_MIN_ESCROW,
  escrowToken:process.env.NEAR_WORKER_ESCROW_TOKEN,
  store,
  report:agentAccessRequest
 });
}catch(error){await store.close();throw error;}

let stopping=false,activePoll=null;
async function poll(){
 if(stopping||activePoll)return;
 activePoll=(async()=>{
  try{
   const result=await worker.runOnce();
   if(result.results.some(item=>item.state==='submitted'))console.log('NEAR worker submitted a report; payout awaits buyer acceptance.');
  }catch(error){console.error('NEAR worker poll failed:',error.code||error.name||'error');}
 })();
 try{await activePoll;}finally{activePoll=null;}
}

void poll();
const timer=setInterval(()=>{void poll();},45000);
console.log('Dinn NEAR Agent Market worker started; polling every 45 seconds.');

let shutdownPromise;
function shutdown(signal){
 if(shutdownPromise)return shutdownPromise;
 stopping=true;
 clearInterval(timer);
 console.log(`Dinn NEAR Agent Market worker stopping (${signal}).`);
 shutdownPromise=(async()=>{
  if(activePoll)await activePoll;
  await store.close();
 })();
 return shutdownPromise;
}
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{
 void shutdown(signal).catch(error=>{
  console.error('Dinn NEAR worker shutdown failed:',error.code||error.name||'error');
  process.exitCode=1;
 });
});
