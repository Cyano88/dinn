import {createHash,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {discoverLaunchStories} from './launch-story-discovery.mjs';
import {chooseFormats,composeLore,loreKey} from './creator-lore.mjs';

export const ideaService='stock.launch-idea';
let pool;
function database(env){
 if(!env.DATABASE_URL)throw Error('Launch brief storage unavailable.');
 pool??=new Pool({connectionString:env.DATABASE_URL,max:2,connectionTimeoutMillis:8000});
 return pool;
}
export async function saveBrief(brief,env,db){
 const id=randomUUID(),reference=createHash('sha256').update(id).digest('hex').slice(0,24);
 await (db??database(env)).query('INSERT INTO dinn_agent_ideas(id,reference,name_key,activity_key,brief) VALUES($1,$2,$3,$4,$5)',[id,reference,loreKey(brief.concept.name),loreKey(brief.concept.activity),brief]);
 return {id,reference};
}
export async function openBrief(id,env,db){
 if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id||''))return null;
 return (await (db??database(env)).query('SELECT reference,brief FROM dinn_agent_ideas WHERE id=$1',[id])).rows[0]||null;
}
export async function linkVerifiedBrief(reference,item,env,connection){
 const db=connection??database(env);
 await db.query("INSERT INTO dinn_idea_launches(token,transaction_hash,reference) SELECT $1,$2,reference FROM dinn_agent_ideas WHERE reference=$3 AND lower(brief->'asset'->>'address')=$4 ON CONFLICT DO NOTHING",[item.token.toLowerCase(),item.hash,reference,item.pairToken.toLowerCase()]);
}
export async function originalFinding(token,env,connection){
 if(!connection&&!env.DATABASE_URL)return null;
 const db=connection??database(env);
 const row=(await db.query('SELECT brief,transaction_hash FROM dinn_idea_launches JOIN dinn_agent_ideas USING(reference) WHERE token=$1',[token.toLowerCase()])).rows[0];
 if(!row)return null;
 const {article,checkedAt,concept}=row.brief;
 return {article,checkedAt,concept,transactionHash:row.transaction_hash};
}
export async function communityBrief({env,discover=discoverLaunchStories,generate=composeLore,save=saveBrief,fetchImpl=fetch}){
 const {data}=await discover();
 const {ideas,checkedAt,coverage,missing,unchecked}=data;
 const scope={checkedAt,chainId:4663,coverage,missing,unchecked};
 const coverageText=coverage.screened+' of '+coverage.eligible+' approved stock pairs checked for news in the last 48 hours.';
 const idea=ideas[0];
 if(!idea){
  if(!coverage.screened||!coverage.quiet||unchecked.length)throw Error('Launch story evidence unavailable.');
  return {result:{...scope,outcome:'wait'},markdown:'Wait for a dated company announcement or a reported milestone. No qualifying story was found among the pairs checked. '+coverageText};
 }
 const {asset,article,blockNumber}=idea;
 let brief,id;
 const used=[];
 for(let attempt=0;attempt<3;attempt++){
  const {concept,format}=await generate(asset.symbol,article,chooseFormats(used.map(x=>x.format)),{env,fetchImpl,used});
  brief={...scope,outcome:'idea',asset,article,blockNumber,concept};
  try{({id}=await save(brief,env));break;}
  catch(error){if(error.code!=='23505'||attempt===2)throw error;used.push({concept,format});}
 }
 const {concept}=brief;
 const openUrl='https://dinnlabs.com/#idea='+id;
 const markdown=['Powered by Dinn Research',article.title,article.source+' Â· '+article.publishedAt+' Â· '+article.url,'Community idea: '+concept.name+' ($'+concept.symbol+')',concept.activity,'What to watch: '+concept.question,'Pair checked: '+asset.symbol+' on Pons, Robinhood Chain. '+coverageText,'Open this brief in Dinn: '+openUrl].join('\n\n');
 return {result:{...brief,openUrl},markdown};
}

