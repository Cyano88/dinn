import sharp from 'sharp';
import {lookup} from 'node:dns/promises';
import {request as httpsRequest} from 'node:https';
const MAX=16000000;
export async function boundedBody(response,max=MAX){
 if(!response.ok||!response.body)throw Error('Image provider did not complete the request.');
 const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>max)throw Error('Image response is too large.');chunks.push(chunk);}return Buffer.concat(chunks);
}
// Resolve once and pin the public IPv4 address, so provider URLs cannot reach local services.
export async function fetchProviderImage(value){
 const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port)throw Error('Invalid image download URL.');
 const ips=await lookup(u.hostname,{family:4,all:true});
 const publicIP=ip=>{const [a,b]=ip.split('.').map(Number);return a>0&&a<224&&a!==10&&a!==127&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&!(a===192&&(b===168||b===0))&&!(a===100&&b>=64&&b<=127)&&a!==198;};
 if(!ips.length||ips.some(v=>!publicIP(v.address)))throw Error('Image host is not public.');
 return new Promise((resolve,reject)=>{const req=httpsRequest(u,{lookup:(_h,options,cb)=>options.all?cb(null,[ips[0]]):cb(null,ips[0].address,4),timeout:30000},res=>{if(res.statusCode!==200){res.resume();reject(Error('Image download failed.'));return;}const chunks=[];let size=0;res.on('data',b=>{size+=b.length;if(size>MAX){req.destroy(Error('Image is too large.'));return;}chunks.push(b);});res.on('end',()=>resolve(Buffer.concat(chunks)));res.on('error',reject);});req.on('timeout',()=>req.destroy(Error('Image download timed out.')));req.on('error',reject);req.end();});
}
export async function normaliseLogo(bytes){
 const image=sharp(bytes,{limitInputPixels:20000000,animated:false});const meta=await image.metadata();
 if(!['png','jpeg','webp'].includes(meta.format)||meta.pages>1||!meta.width||!meta.height)throw Error('Provider returned an unsupported image.');
 const png=await image.rotate().resize(1024,1024,{fit:'contain',background:'#ffffff',withoutEnlargement:true}).png({compressionLevel:9}).toBuffer();
 if(png.length>2000000)throw Error('Generated logo exceeds the image size limit.');return png;
}
export async function generateLogoImage({model,prompt,reference},{env=process.env,fetcher=fetch,download=fetchProviderImage,resume,onJob=async()=>{},sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const endpoint=new URL((env.OG_BASE_URL||'https://router-api.0g.ai/v1').replace(/\/$/,'')+'/images/generations');
 if(endpoint.protocol!=='https:'||!(env.OG_IMAGE_API_KEY||env.OG_API_KEY))throw Error('0G image generation is not configured.');
 const size=model.includes('seedream-4.5')||model.includes('seedream-5.0-lite')?'2048x2048':'1024x1024';
 const headers={authorization:'Bearer '+(env.OG_IMAGE_API_KEY||env.OG_API_KEY),'content-type':'application/json'};
 if(model==='z-image-turbo'){
  if(reference)throw Error('This model supports new images from text, not reference-image editing.');
  const base=endpoint.href.replace('/images/generations','');let job=resume;
  if(!job){const r=await fetcher(base+'/async/images/generations',{method:'POST',headers,body:JSON.stringify({model,prompt,n:1,size,response_format:'b64_json'}),signal:AbortSignal.timeout(30000)});if(r.status===403){const e=Error('The 0G API key does not allow Z-Image-Turbo. Enable it to continue.');e.publicMessage=e.message;throw e;}job=JSON.parse((await boundedBody(r,100000)).toString());if(typeof job.jobId!=='string'||!/^[a-zA-Z0-9_-]{1,150}$/.test(job.jobId)||!/^0x[0-9a-f]{40}$/i.test(job.provider_address))throw Error('Invalid provider job response.');await onJob({jobId:job.jobId,provider_address:job.provider_address});}
  for(let attempt=0;attempt<60;attempt++){
   const r=await fetcher(base+'/async/jobs/'+encodeURIComponent(job.jobId)+'?provider_address='+encodeURIComponent(job.provider_address),{headers,signal:AbortSignal.timeout(30000)});
   const result=JSON.parse((await boundedBody(r,24000000)).toString());
   if(result.status==='completed'){const image=result.data?.data?.[0]?.b64_json;if(!image)throw Error('No image in the completed job.');return normaliseLogo(Buffer.from(image,'base64'));}
   if(!['pending','running'].includes(result.status))throw Error('Image generation failed.');
   await sleep(Math.min(10000,Math.max(1000,Number(r.headers.get('retry-after')||3)*1000)));
  }
  throw Error('Image is still processing. Check the saved request again.');
 }
 const response=await fetcher(endpoint,{method:'POST',headers,body:JSON.stringify({model,prompt,n:1,size,response_format:'b64_json',...(reference?{image:'data:image/png;base64,'+Buffer.from(reference).toString('base64')}:{})}),signal:AbortSignal.timeout(180000)});
 if(response.status===403){const error=Error('The 0G API key does not allow this image model. Enable image access to continue.');error.publicMessage=error.message;throw error;}
 const parsed=JSON.parse((await boundedBody(response,24000000)).toString('utf8'));const item=parsed.data?.[0];if(!item)throw Error('No image returned by 0G.');
 const bytes=item.b64_json?Buffer.from(item.b64_json,'base64'):item.url?await download(item.url):null;
 if(!bytes?.length)throw Error('No usable image returned by 0G.');return normaliseLogo(bytes);
}
