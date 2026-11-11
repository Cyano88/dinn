import {readFile} from 'node:fs/promises';
const [command,...args]=process.argv.slice(2);
const base=new URL(process.env.CLI_BASE_URL||'http://127.0.0.1:4317');
if(!['http:','https:'].includes(base.protocol)||base.username||base.password)throw new Error('Use a trusted HTTP(S) origin without embedded credentials.');
try{
 let path,body;
 if(command==='discover'){path='/.well-known/launchflow.json';if(args.length)throw new Error('discover takes no arguments');}
 else if(command==='plan'){if(!args.length)throw new Error('Provide a request.');path='/api/agent/request';body={service:'plan',input:{message:args.join(' ')}};}
 else if(command==='brief'){
  if(args.length!==2||args[0]!=='--file')throw new Error(`${command} requires --file <configuration.json>`);
  const input=JSON.parse((await readFile(args[1],'utf8')).replace(/^\uFEFF/,''));
  path='/api/agent/request';body={service:'pons.brief',input};
 }else throw new Error('Usage: node cli.mjs discover | plan "request" | brief --file pons-brief.json');
 const response=await fetch(new URL(path,base),{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000),redirect:'error'});
 const result=await response.json();console.log(JSON.stringify(result,null,2));if(!response.ok)process.exitCode=1;
}catch(error){console.error(JSON.stringify({error:error.message}));process.exitCode=1;}
