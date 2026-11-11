const MAX_BYTES=4500000;
export async function downloadDexLogo({url,name='token'},{fetcher=fetch}={}){
 let parsed;try{parsed=new URL(url);}catch{throw Error('No downloadable logo is available.');}
 if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||!['assets.geckoterminal.com','cdn.dexscreener.com'].includes(parsed.hostname))throw Error('This logo host is not supported for download yet. Choose a GeckoTerminal or DEX Screener image.');
 const response=await fetcher(parsed.href,{redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok||!response.body)throw Error('The logo could not be downloaded. Try again.');
 if(Number(response.headers.get('content-length'))>MAX_BYTES)throw Error('Logo exceeds the 4.5 MB upload limit.');
 const chunks=[];let size=0;const reader=response.body.getReader();try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BYTES)throw Error('Logo exceeds the 4.5 MB upload limit.');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 const bytes=Buffer.concat(chunks),head=bytes.subarray(0,12);let extension;
 if(head.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))extension='png';
 else if(head[0]===255&&head[1]===216&&head[2]===255)extension='jpg';
 else if(['GIF87a','GIF89a'].includes(head.subarray(0,6).toString()))extension='gif';
 else if(head.subarray(0,4).toString()==='RIFF'&&head.subarray(8,12).toString()==='WEBP')extension='webp';
 else throw Error('Logo must be a PNG, JPG, GIF or WebP image.');
 const filename=String(name).replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,60)||'token';
 return {bytes,type:'image/'+(extension==='jpg'?'jpeg':extension),filename:filename+'-logo.'+extension};
}
