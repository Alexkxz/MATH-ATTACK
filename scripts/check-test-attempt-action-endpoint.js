'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),net=require('net');
const {spawn}=require('child_process');
const {createRoot,createTest,createAttempt,createCheckpoint}=require('../src/server/exams/testModel');
const uuid={creator:'11111111-1111-4111-8111-111111111111',student:'22222222-2222-4222-8222-222222222222'};
const event=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const free=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function start(port,file){return spawn(process.execPath,['server.js'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),MATH_ATTACK_TESTS_PATH:file},stdio:'ignore',windowsHide:true});}
async function ready(base){for(let i=0;i<40;i++){try{if((await fetch(base+'/api/exam/status')).ok)return;}catch(_){}await wait(100);}throw Error('servidor no inició');}
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'math-attack-attempt-actions-http-')),file=path.join(dir,'pruebas.json');
 const root=createRoot(),test=createTest({title:'Acciones HTTP',creator:uuid.creator,status:'active'}),other=createTest({title:'Otra',creator:uuid.creator,status:'active'});
 const first=createAttempt({testId:test.testId,accountPlayerId:uuid.student,status:'in_progress'}),second=createAttempt({testId:test.testId,accountPlayerId:uuid.student,status:'disconnected'});
 root.tests.push(test,other);root.attempts.push(first,second);root.checkpoints.push(createCheckpoint({attemptId:first.attemptId,index:7}));fs.writeFileSync(file,JSON.stringify(root));
 let child,port;
 try{
  port=await free();child=start(port,file);const base=`http://127.0.0.1:${port}`;await ready(base);
  const call=(url,data)=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
  assert.equal((await call(`/api/maestro/tests/${test.testId}/attempts/${first.attemptId}/actions`,undefined)).status,401);
  assert.equal((await call(`/api/maestro/tests/${test.testId}/attempts/${first.attemptId}/actions`,{password:'alumno',action:'pause',revision:2,eventId:event(1),reason:'x'})).status,401);
  const cfg=JSON.parse(fs.readFileSync('config.json','utf8')),baseData={password:cfg.adminPassword,pwd:'secreto',token:'secreto',cookies:'secreto'};
  const act=async(attemptId,action,revision,n,reason='motivo')=>{const r=await call(`/api/maestro/tests/${test.testId}/attempts/${attemptId}/actions`,{...baseData,action,revision,eventId:event(n),reason});assert.equal(r.status,200);const j=await r.json();assert.equal(JSON.stringify(j).includes('secreto'),false);return j;};
  assert.equal((await act(first.attemptId,'pause',2,2)).attempt.status,'paused');
  assert.equal((await act(first.attemptId,'resume',3,3)).attempt.status,'in_progress');
  assert.equal((await act(first.attemptId,'close',4,4)).attempt.status,'finished');
  assert.equal((await act(first.attemptId,'reopen',5,5)).attempt.status,'reopened');
  assert.equal((await act(first.attemptId,'close',6,6)).attempt.status,'finished');
  const restarted=await act(first.attemptId,'restart',7,7);assert(restarted.newAttempt);assert.equal(restarted.newAttempt.parentAttemptId,first.attemptId);
  const duplicate=await act(first.attemptId,'restart',8,7);assert.equal(duplicate.duplicate,true);assert.equal(duplicate.newAttempt,null);
  assert.equal((await act(second.attemptId,'allowReentry',2,8)).attempt.status,'reconnected');
  assert.equal((await act(second.attemptId,'markIncomplete',3,9)).attempt.status,'incomplete');
  assert.equal((await act(second.attemptId,'reopen',4,10)).attempt.status,'reopened');
  assert.equal((await call(`/api/maestro/tests/${test.testId}/attempts/${first.attemptId}/actions`,{...baseData,action:'unknown',revision:8,eventId:event(11),reason:'x'})).status,400);
  assert.equal((await call(`/api/maestro/tests/${test.testId}/attempts/${'99999999-9999-4999-8999-999999999999'}/actions`,{...baseData,action:'pause',revision:2,eventId:event(12),reason:'x'})).status,404);
  assert.equal((await call(`/api/maestro/tests/${'99999999-9999-4999-8999-999999999999'}/attempts/${first.attemptId}/actions`,{...baseData,action:'pause',revision:8,eventId:event(13),reason:'x'})).status,404);
  assert.equal((await call(`/api/maestro/tests/${test.testId}/attempts/${first.attemptId}/actions`,{...baseData,action:'pause',revision:8,eventId:event(14)})).status,400);
  const concurrent=await Promise.all([call(`/api/maestro/tests/${test.testId}/attempts/${second.attemptId}/actions`,{...baseData,action:'close',revision:5,eventId:event(15),reason:'motivo'}),call(`/api/maestro/tests/${test.testId}/attempts/${second.attemptId}/actions`,{...baseData,action:'close',revision:5,eventId:event(15),reason:'motivo'})]);
  const concurrentJson=await Promise.all(concurrent.map(async response=>({status:response.status,json:await response.json()})));assert(concurrentJson.every(x=>x.status===200));assert.equal(concurrentJson.filter(x=>x.json.duplicate).length,1);
  assert.equal((await act(second.attemptId,'delete',6,16)).attempt.status,'deleted');
  const persisted=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(persisted.checkpoints[0].index,7);assert(persisted.events.every(e=>!JSON.stringify(e).includes('secreto')));
  child.kill('SIGINT');await wait(150);const port2=await free();child=start(port2,file);await ready(`http://127.0.0.1:${port2}`);
  const recovered=await fetch(`http://127.0.0.1:${port2}/api/maestro/tests/${test.testId}/attempts/${first.attemptId}?pwd=${encodeURIComponent(cfg.adminPassword)}`);assert.equal(recovered.status,200);assert.equal((await recovered.json()).attempt.status,'restarted');
  console.log('OK: ruta administrativa de acciones, autenticación, validación, idempotencia, concurrencia, aislamiento, checkpoints y persistencia.');
 }finally{if(child&&!child.killed)child.kill('SIGINT');fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1)});
