import {createWriteStream} from 'node:fs';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {ElevenLabsClient} from '@elevenlabs/elevenlabs-js';
import fs from 'node:fs/promises';

const manuscriptPath='docs/DINN-DEMO-VOICEOVER.md';
const outputPath='output/dinn-prize-demo/narration.mp3';
const voiceId=process.env.ELEVENLABS_VOICE_ID||'JBFqnCBsd6RMkjVDRZzb';

if(!process.env.ELEVENLABS_API_KEY){
  console.error('ELEVENLABS_API_KEY is unavailable. Run through npm run demo:voice to load the project .env file.');
  process.exit(1);
}

const manuscript=await fs.readFile(manuscriptPath,'utf8');
const text=manuscript.split('## Editorial accuracy')[0]
  .split('\n')
  .filter(line=>line.trim()&&!line.startsWith('#'))
  .join(' ')
  .replace(/\s+/g,' ')
  .trim();

const client=new ElevenLabsClient();
try{
  const audio=await client.textToSpeech.convert(voiceId,{
    text,
    modelId:'eleven_v4',
    voiceSettings:{stability:0.7,similarityBoost:0.5},
  });
  await pipeline(Readable.fromWeb(audio),createWriteStream(outputPath));
  console.log(`ELEVENLABS_NARRATION_READY ${outputPath}`);
}catch(error){
  const status=Number(error?.status||error?.statusCode);
  console.error(Number.isFinite(status)&&status>0?`ELEVENLABS_TTS_FAILED_${status}`:'ELEVENLABS_TTS_FAILED');
  process.exit(1);
}
