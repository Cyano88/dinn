import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('output/build',{recursive:true});
const auth=await build({entryPoints:['ui/auth.jsx'],bundle:true,format:'esm',splitting:true,outdir:'public/auth',entryNames:'entry',chunkNames:'chunk-[hash]',platform:'browser',target:['es2022'],jsx:'automatic',minify:true,metafile:true,define:{'process.env.NODE_ENV':'"production"'},logLevel:'info'});
await writeFile('output/build/auth-meta.json',JSON.stringify(auth.metafile,null,2));
await build({entryPoints:['ui/execution.js'],bundle:true,format:'esm',outfile:'public/execution/entry.js',platform:'browser',target:['es2022'],minify:true,logLevel:'info'});

await build({entryPoints:['ui/pons-execution.js'],bundle:true,format:'esm',outfile:'public/pons/entry.js',platform:'browser',target:['es2022'],minify:true,logLevel:'info'});
