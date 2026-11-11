import {ascendLaunchEnabled,ascendFeesEnabled} from '../src/execution-policy.mjs';
﻿import {embeddedAuthConfig} from '../src/auth-config.mjs';
const auth=embeddedAuthConfig();
const checks={
 privyAppConfigured:!!auth.appId,
 publicElysiumRpcConfigured:!!auth.rpcUrl,
 serverElysiumRpcConfigured:!!process.env.ELYSIUM_RPC_URL,
 inferenceConfigured:!!(process.env.OG_API_KEY&&process.env.OG_MODEL),
 liveLoginVerified:false,
 transactionSendingImplemented:true,
 liveLaunchEnabled:ascendLaunchEnabled(),
 creatorFeesEnabled:ascendFeesEnabled()
};
console.log(JSON.stringify({checks,note:'Configuration presence only. This command does not contact providers, authenticate users, or verify chain connectivity.'},null,2));
