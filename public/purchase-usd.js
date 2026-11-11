const SCALE=10n**18n;
export function decimalUnits(value){if(typeof value!=='string'||!/^\d{1,40}(\.\d{1,18})?$/.test(value))throw Error('Invalid decimal.');const [a,b='']=value.split('.');return BigInt(a)*SCALE+BigInt(b.padEnd(18,'0'));}
export function decimalString(value){return (value/SCALE).toString()+'.'+(value%SCALE).toString().padStart(18,'0');}
export function usdTotal(amount,unitPrice){const raw=decimalUnits(amount)*decimalUnits(unitPrice)/SCALE;const cents=(raw+5n*10n**15n)/(10n**16n);const whole=(cents/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',');return '$'+whole+'.'+(cents%100n).toString().padStart(2,'0')+' USD';}
