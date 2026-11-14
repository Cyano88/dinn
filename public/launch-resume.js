export function hasLaunchProgress(brief={},settings={}){
 return ['name','symbol','description'].some(key=>typeof brief[key]==='string'&&brief[key].trim())||Object.entries(settings).some(([key,value])=>key==='socials'?Object.values(value||{}).some(Boolean):value!==undefined&&value!==null&&value!=='');
}
export function launchReturnChoice(text){
 const value=String(text).trim().replace(/[.!?]+$/,'');
 if(/^(?:continue|resume|keep)(?: (?:with )?(?:this|that|the|my|saved|current))?(?: (?:token|launch|setup))?$/i.test(value))return 'continue';
 if(/^(?:(?:start|create|launch|make) )?(?:a )?new(?: token| coin| launch| setup)?$/i.test(value)||/^start (?:fresh|afresh|over)$/i.test(value))return 'new';
 if(/^(?:cancel|stop|not now|never mind|nevermind)$/i.test(value))return 'cancel';
 return null;
}
