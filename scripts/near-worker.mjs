import {createNearMarketClient} from '../src/near-market-client.mjs';
import {createNearWorkerStore} from '../src/near-worker-store.mjs';
import {createNearWorker,submittedReportStatusMessage} from '../src/near-worker.mjs';
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

let stopping=false,activePoll=null,pollAgain=false;
let activePollStartedAt=0,lastSlowPollWarningAt=0;
async function poll(){
 if(stopping)return;
 if(activePoll){pollAgain=true;if(Date.now()-activePollStartedAt>=120000&&Date.now()-lastSlowPollWarningAt>=120000){lastSlowPollWarningAt=Date.now();console.error('NEAR worker poll is still running after two minutes.');}return activePoll;}
 activePollStartedAt=Date.now();
 activePoll=(async()=>{
  do{
   pollAgain=false;
   try{
    const result=await worker.runOnce();
    console.log(`NEAR worker poll complete: checked ${result.checked} assignments; ${result.results.length} actionable results.`);
    for(const item of result.results){
     if(item.state==='submitted')console.log(submittedReportStatusMessage(item));
     else if(item.state==='start-window-expired'&&item.recorded)console.log('NEAR worker skipped an assignment whose marketplace start window had closed.');
     else if(item.state==='not-eligible'&&item.recorded)console.log('NEAR worker skipped an assignment outside its supported research scope.');
     else if(item.state==='error')console.error('NEAR worker assignment failed:',item.errorCode,item.status?`HTTP ${item.status}`:'');
    }
   }catch(error){console.error('NEAR worker poll failed:',error.code||error.name||'error');}
  }while(pollAgain&&!stopping);
 })();
 try{await activePoll;}finally{activePoll=null;if(pollAgain&&!stopping)void poll();}
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
