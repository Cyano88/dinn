const registryUrl='https://api.robinhood.com/rhj/assets';
export async function robinhoodStock(query,fetchImpl=fetch){
 const response=await fetchImpl(registryUrl,{signal:AbortSignal.timeout(8000),redirect:'error'});
 if(!response.ok)throw Error('Robinhood stock registry is temporarily unavailable.');
 const {assets}=await response.json();
 if(!Array.isArray(assets))throw Error('Robinhood stock registry could not be read.');
 const matches=[];
 for(const asset of assets){
  if(asset.status!=='ASSET_STATUS_ACTIVE')continue;
  for(const deployment of asset.deployments||[]){
   if(deployment.chainId!==4663||!/^0x[a-f0-9]{40}$/i.test(deployment.contractAddress))continue;
   if(![asset.tokenSymbol,deployment.contractAddress].some(value=>value?.toLowerCase()===query.trim().toLowerCase()))continue;
   matches.push({address:deployment.contractAddress,symbol:asset.tokenSymbol,name:asset.tokenName,decimals:asset.tokenDecimals,source:registryUrl});
  }
 }
 if(matches.length!==1)throw Error('No unique active Robinhood stock token matches that ticker or contract on Robinhood Chain.');
 return matches[0];
}
