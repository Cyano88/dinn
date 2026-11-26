import {BANKR_V4_LAUNCH_ADDRESSES,createLaunchClient} from '@bankr/launch-sdk';
import {createClient,custom,encodeFunctionData,erc20Abi} from 'viem';
import {readContract} from 'viem/actions';

const factory=BANKR_V4_LAUNCH_ADDRESSES.base.factory;
const launchSelector='0x3dea0225'; // factory.launch from the installed Bankr V4 ABI.

// Stock contracts have distinct storage layouts. Run their real approve method in
// the same read-only RPC simulation as launch, without guessing allowance slots.
export async function firstBuySimulation(client,launcher,quote,amount){
 const rpc=client.publicClient;
 const allowance=await readContract(rpc,{address:quote,abi:erc20Abi,functionName:'allowance',args:[launcher,factory]});
 if(allowance>=amount)return client;
 const data=encodeFunctionData({abi:erc20Abi,functionName:'approve',args:[factory,amount]});
 const publicClient=createClient({chain:rpc.chain,transport:custom({request:async(request)=>{
  const [call,block]=request.params||[];
  if(!['eth_call','eth_estimateGas'].includes(request.method)||call?.from?.toLowerCase()!==launcher.toLowerCase()||call.to?.toLowerCase()!==factory.toLowerCase()||!call.data?.startsWith(launchSelector)||BigInt(call.value||0)!==0n)return rpc.request(request);
  const [result]=await rpc.request({method:'eth_simulateV1',params:[{validation:false,blockStateCalls:[{calls:[{from:launcher,to:quote,data},call]}]},block||'latest']});
  const [permission,launch]=result.calls;
  if(permission?.status!=='0x1'||BigInt(permission.returnData||0)!==1n||launch?.status!=='0x1')throw Error('Bankr first buy could not be simulated with the selected stock.');
  return request.method==='eth_call'?launch.returnData:launch.gasUsed;
 }},{retryCount:0})});
 return createLaunchClient({chain:'base',publicClient});
}
