'use strict';
const fs=require('fs'),path=require('path');
const { createRoot }=require('./testModel');
const { migrate }=require('./testMigration');
const { validateTest,validateAttempt,validateCheckpoint }=require('./testValidation');
function validateRoot(root){
  if(!root||root.schemaVersion!==1||!Array.isArray(root.tests)||!Array.isArray(root.assignments)||!Array.isArray(root.attempts)||!Array.isArray(root.checkpoints)||!Array.isArray(root.results)||!Array.isArray(root.events))throw new Error('almacén de pruebas inválido');
  root.tests.forEach(validateTest);root.attempts.forEach(validateAttempt);root.checkpoints.forEach(validateCheckpoint);return true;
}
function createTestStore({baseDir,fileName='pruebas.json',logger=console,forceCopyFallback=false}={}){
  if(!baseDir)throw new Error('baseDir obligatorio');const file=path.join(baseDir,fileName);let queued=null,writing=false;
  const report=e=>logger?.error?.('testStore:',e.message||e);
  function tmp(){return `${file}.${process.pid}.${Date.now()}.tmp`;}
  function recover(){const candidates=fs.readdirSync(baseDir,{withFileTypes:true}).filter(x=>x.name.startsWith(path.basename(file)+'.')&&x.name.endsWith('.tmp')).map(x=>path.join(baseDir,x.name));if(!fs.existsSync(file)&&candidates.length){fs.renameSync(candidates.sort().pop(),file);}}
  function initialize(){
    const existed=fs.existsSync(file);
    try{
      recover();
      if(!fs.existsSync(file)) return {status:'new',data:createRoot(),persisted:false};
      const raw=JSON.parse(fs.readFileSync(file,'utf8'));
      const data=migrate(raw); validateRoot(data);
      return {status:raw.schemaVersion===data.schemaVersion?'loaded':'migrated',data,persisted:true,recovered:!existed};
    }catch(e){report(e);return {status:'invalid',data:createRoot(),persisted:false,error:e.message};}
  }
  function load(){return initialize().data;}
  function writeSync(data){validateRoot(data);const temp=tmp();fs.writeFileSync(temp,JSON.stringify(data,null,2),'utf8');try{if(forceCopyFallback)throw new Error('fallback forzado');fs.renameSync(temp,file);}catch(e){fs.copyFileSync(temp,file);fs.unlinkSync(temp);}}
  function flush(){if(writing||queued===null)return;const data=queued;queued=null;writing=true;try{writeSync(data);}catch(e){report(e);}finally{writing=false;if(queued!==null)flush();}}
  function save(data){validateRoot(data);queued=data;flush();}
  function flushSync(){flush();}
  return {file,initialize,load,save,flushSync,validateRoot};
}
module.exports={createTestStore,validateRoot};
