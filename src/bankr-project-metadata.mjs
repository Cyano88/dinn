import {createHash} from 'node:crypto';
import {logoOrigin} from './logo-service.mjs';

export function projectMetadata({name,symbol,description='',image='',website=''}){
 if(typeof name!=='string'||!name.trim()||name.length>40||!/^[A-Z0-9]{1,12}$/.test(symbol)||typeof description!=='string'||description.length>500)throw Error('Invalid project details.');
 const values={name,symbol};
 if(description)values.description=description;
 for(const [field,value] of [['image',image],['external_url',website]]){
  if(value==='')continue;
  const u=new URL(value);
  if(typeof value!=='string'||value.length>2048||!['https:','ipfs:'].includes(u.protocol)||!u.hostname||u.username||u.password)throw Error('Use a public HTTPS or IPFS link.');
  values[field]=value;
 }
 return values;
}

export async function publishProjectMetadata(store,env,fields){
 const doc=projectMetadata(fields),origin=logoOrigin(env);
 if(!origin)throw Error('Public metadata hosting is unavailable.');
 const id=createHash('sha256').update(JSON.stringify(doc)).digest('hex');
 await store.putMetadata(id,doc);
 return {metadataUri:origin+'/media/token-metadata/'+id+'.json',doc};
}
