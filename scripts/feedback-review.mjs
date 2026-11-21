import {feedbackDb} from '../src/research-feedback.mjs';
const db=await feedbackDb();
try{
 const [option,assignment]=process.argv.slice(2);
 if(option){
  if(option!=='--mark-market-test'||!/^[0-9a-f-]{36}$/i.test(assignment||''))throw Error('Expected --mark-market-test ASSIGNMENT_UUID.');
  const result=await db.query("UPDATE dinn_research_feedback SET audience='test' WHERE id=$1",['marketplace:'+assignment]);console.log('Test rows marked:',result.rowCount);
 }
 const {rows}=await db.query("SELECT source,audience,target,reply,replied_at FROM dinn_research_feedback WHERE replied_at >= now()-interval '7 days' ORDER BY replied_at DESC LIMIT 200");
 for(const row of rows)console.log(JSON.stringify(row));
 console.table((await db.query("SELECT source,audience,count(*) registered_prompts_or_page_visits,count(reply) replies,count(DISTINCT actor) FILTER(WHERE reply IS NOT NULL) distinct_chat_respondents FROM dinn_research_feedback WHERE offered_at >= now()-interval '7 days' GROUP BY source,audience")).rows);
}finally{await db.end();}
