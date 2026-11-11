import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const audit=JSON.parse((await readFile('docs/dependency-audit-current.json','utf8')).replace(/^\uFEFF/,''));
if(!audit.metadata||!audit.vulnerabilities)throw Error('Audit snapshot is missing or invalid.');
const meta=JSON.parse(await readFile('output/build/auth-meta.json','utf8'));
const roots=Object.entries(audit.vulnerabilities).filter(([,v])=>v.via.some(x=>typeof x==='object'));
const findings=roots.map(([name,v])=>{
 const bundled=[];
 for(const [output,details]of Object.entries(meta.outputs)){
  for(const [input,entry]of Object.entries(details.inputs)){
   if(input.includes('node_modules/'+name+'/')&&entry.bytesInOutput>0)bundled.push({input,output,bytes:entry.bytesInOutput});
  }
 }
 return {name,severity:v.severity,advisories:v.via.filter(x=>typeof x==='object').map(x=>({title:x.title,url:x.url,range:x.range})),installedNodes:v.nodes,bundled};
});
const report={generatedAt:new Date().toISOString(),lockfileSha256:createHash('sha256').update(await readFile('package-lock.json')).digest('hex'),counts:audit.metadata.vulnerabilities,findings,limitation:'Bundle presence is not runtime exploitability. Absence from this browser bundle does not establish safety of other consumers. This report does not approve a release.'};
await writeFile('docs/dependency-exposure.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({counts:report.counts,findings:findings.map(x=>({name:x.name,bundledModules:new Set(x.bundled.map(b=>b.input)).size,bundledBytes:x.bundled.reduce((sum,b)=>sum+b.bytes,0)}))},null,2));
