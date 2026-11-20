import {encodeAbiParameters,keccak256,parseAbi,parseAbiParameters} from 'viem';

export const BASE_V4_POOL_MANAGER='0x498581ff718922c3f8e6a244956af099b2652b2b';
export const BASE_V4_QUOTER='0xE1A6C5803e3c44368b171BD680c7D32dfc92CA47';
export const BASE_POOL_KEY='(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)';
export const baseV4QuoterAbi=parseAbi([`function quoteExactInputSingle((${BASE_POOL_KEY} poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)`]);

export function baseV4PoolId(poolKey){return keccak256(encodeAbiParameters(parseAbiParameters(BASE_POOL_KEY),[poolKey])).toLowerCase();}
