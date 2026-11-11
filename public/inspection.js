export const tokenAddressPattern=/^0x[0-9a-fA-F]{40}$/;
export function inspectionRequest(message,selectedAddress,{setupField,explicit=false}={}){
 if(explicit)return null;
 const text=String(message).trim();
 const addresses=[...new Set((text.match(/\b0x[0-9a-fA-F]{40}\b/g)||[]).map(a=>a.toLowerCase()))];
 if(tokenAddressPattern.test(text)&&['account','recipient'].includes(setupField))return null;
 const generic=/^(?:what (?:is|are|does)|explain|define|how does)\b/i.test(text)&&!/(?:this|that|its|it.s|my token|0x[0-9a-f]{40})/i.test(text);
 const subject=/\b(?:lp|liquidity|sc|contract|ts|total supply|owner|ownership|mint|pause|blacklist|verified|verification|holders?|deployer|dev|sellable|honeypot)\b/i.test(text);
 const query=/(?:\?|\b(?:is|are|can|check|scan|inspect|review|tell|show|what|whats|how|who|does|locked|verified|safe|risk)\b)/i.test(text);
 const short=/^(?:lp|sc|ts)(?:\s+(?:lp|sc|ts|locked|verified|supply))*[?!. ]*$/i.test(text);
 const addressed=addresses.length&&(/\b(?:check|scan|inspect|review|token|contract|lp|sc|ts|supply|safe)\b/i.test(text)||tokenAddressPattern.test(text));
 const scan=/^(?:check|scan|inspect|review) (?:a |this |my |the )?token[?. ]*$/i.test(text);
 const trade=/\b(?:can i sell|safe to (?:buy|trade)|is it safe)\b/i.test(text);
 if(!addressed&&!(subject&&query&&!generic)&&!short&&!trade&&!scan)return null;
 if(addresses.length>1)return {needsAddress:true,multiple:true};
 return {address:addresses[0]||selectedAddress||null,needsAddress:!addresses.length&&!selectedAddress};
}
