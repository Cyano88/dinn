import {createHmac,timingSafeEqual} from 'node:crypto';

const MAX_CLOCK_SKEW_SECONDS=300;
const DELIVERY_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function verifyNearMarketWebhook({headers,rawBody,secret,now=Date.now()}={}){
 if(typeof secret!=='string'||Buffer.byteLength(secret)<32)throw Object.assign(Error('Webhook verifier is not configured.'),{code:'WEBHOOK_NOT_CONFIGURED'});
 if(!Buffer.isBuffer(rawBody)||rawBody.length>32768)throw Object.assign(Error('Invalid webhook body.'),{code:'WEBHOOK_INVALID'});
 const event=headers?.['x-market-event'],delivery=headers?.['x-market-delivery'],timestamp=headers?.['x-market-timestamp'],signature=headers?.['x-market-signature'];
 if(typeof event!=='string'||event.length>80||typeof delivery!=='string'||!DELIVERY_ID.test(delivery)||typeof timestamp!=='string'||!/^\d{1,12}$/.test(timestamp)||typeof signature!=='string'||!/^sha256=[0-9a-f]{64}$/i.test(signature))throw Object.assign(Error('Invalid webhook headers.'),{code:'WEBHOOK_INVALID'});
 const seconds=Number(timestamp),nowSeconds=Math.floor(now/1000);
 if(!Number.isSafeInteger(seconds)||Math.abs(nowSeconds-seconds)>MAX_CLOCK_SKEW_SECONDS)throw Object.assign(Error('Expired webhook delivery.'),{code:'WEBHOOK_EXPIRED'});
 const expected=createHmac('sha256',secret).update(timestamp+'.','ascii').update(rawBody).digest();
 const provided=Buffer.from(signature.slice(7),'hex');
 if(provided.length!==expected.length||!timingSafeEqual(expected,provided))throw Object.assign(Error('Invalid webhook signature.'),{code:'WEBHOOK_UNAUTHORIZED'});
 let payload;try{payload=JSON.parse(rawBody.toString('utf8'));}catch{throw Object.assign(Error('Invalid webhook JSON.'),{code:'WEBHOOK_INVALID'});}
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||payload.event!==event)throw Object.assign(Error('Webhook event mismatch.'),{code:'WEBHOOK_INVALID'});
 return {event,deliveryId:delivery,payload};
}
