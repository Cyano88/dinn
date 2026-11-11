let nextRequestAt=0;
export async function blockscoutRead(path,{env=process.env,fetchImpl=fetch,signal,query={},chainId=4663}={}){
 if(![4663,8453,42161].includes(chainId))throw Error('Unsupported explorer network.');
 if(!env.BLOCKSCOUT_API_KEY)throw Error('Holder research needs a configured Blockscout API key.');
 if(!/^(tokens|addresses|smart-contracts)\/0x[0-9a-f]{40}(?:\/(?:holders|token-balances|tokens))?$/i.test(path)&&!/^transactions\/0x[0-9a-f]{64}\/internal-transactions$/i.test(path))throw Error('Unsupported explorer lookup.');
 const slot=Math.max(Date.now(),nextRequestAt);nextRequestAt=slot+260;const delay=slot-Date.now();if(delay)await new Promise(r=>setTimeout(r,delay));if(signal?.aborted)throw Error('Research cancelled.');
 const url=new URL('https://api.blockscout.com/'+chainId+'/api/v2/'+path);for(const [key,value]of Object.entries(query)){if(!['type','items_count','fiat_value','id','value'].includes(key)||String(value).length>120||!(/^[0-9.eE+\-]*$/.test(String(value))||value===null||key==='type'&&value==='ERC-20'))throw Error('Invalid explorer pagination.');url.searchParams.set(key,String(value));}url.searchParams.set('apikey',env.BLOCKSCOUT_API_KEY);
 let response;try{response=await fetchImpl(url.href,{redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000)});}catch{throw Error('Blockscout could not be reached.');}
 if(!response.ok)throw Error([401,402,403].includes(response.status)?'Blockscout access requires an active API key.':response.status===429?'Blockscout rate limit reached. Retry later.':'Blockscout lookup failed.');
 const raw=await response.text();if(raw.length>2000000)throw Error('Explorer response exceeds the research limit.');try{return JSON.parse(raw);}catch{throw Error('Explorer returned an unreadable response.');}
}
