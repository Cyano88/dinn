export const draftKinds=['pons-brief','pons-settings','setup','chat','opening-purchase','launch-conversation','logo-local-choice','logo-original'];
export const emptyDraft=()=>({version:1,values:{}});
export function validateDraft(data){
 if(!data||data.version!==1||Object.keys(data).some(k=>!['version','values'].includes(k))||!data.values||Array.isArray(data.values)||typeof data.values!=='object')throw Error('Invalid draft format.');
 if(Object.keys(data.values).some(k=>!draftKinds.includes(k)))throw Error('Unexpected draft field.');
 const encoded=JSON.stringify(data);if(encoded.length>300000)throw Error('Draft is too large to sync.');
 // Persist only JSON data. Wallet credentials, providers and prepared transactions have no fields here.
 const values={};for(const kind of draftKinds)if(Object.hasOwn(data.values,kind))values[kind]=data.values[kind];
 return {version:1,values};
}
