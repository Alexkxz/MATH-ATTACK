'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {randomUUID}=require('crypto');
const {createTestStore}=require('../src/server/exams/testStore');
const {createTest,createAssignment}=require('../src/server/exams/testModel');
const {createTestService}=require('../src/server/exams/testService');
const {createOfficialAttemptService}=require('../src/server/exams/officialAttemptService');
const {createOfficialRewardService}=require('../src/server/exams/officialRewardService');
const {calculateGameRewards}=require('../src/game/gameRewards');
const {calculateDailyStreak}=require('../src/game/dailyStreak');
const {checkNewAchievements,ACHIEVEMENTS_DEF}=require('../src/game/achievements');
const {ensurePlayerExperience}=require('../src/game/playerLevels');

const ids={test:'11111111-1111-4111-8111-111111111111',student:'22222222-2222-4222-8222-222222222222',other:'33333333-3333-4333-8333-333333333333'};
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'math-attack-last-attempt-'));
try{
 const store=createTestStore({baseDir:dir}),root=store.load();
 const test=createTest({testId:ids.test,creator:ids.student,title:'Último intento',status:'active',configuration:{allowedAttempts:3,grade:'5A',multiplier:1,total:2,opsConfig:{mult:{qty:2,tables:[2]}},rewards:{aureos:10,experience:5}}});
 root.tests.push(test);root.assignments.push(createAssignment({testId:ids.test,targetType:'student',accountPlayerId:ids.student}),createAssignment({testId:ids.test,targetType:'student',accountPlayerId:ids.other}));store.save(root);
 const service=createTestService({store});
 const playersFile=path.join(dir,'players.json');fs.writeFileSync(playersFile,JSON.stringify([{id:ids.student,name:'Alumno',grade:'5A',aureos:0,experiencia:0,dailyStreak:{},achievements:[]},{id:ids.other,name:'Otra alumna',grade:'5A',aureos:0,experiencia:0}]),'utf8');
 const rankingFile=path.join(dir,'ranking.json');fs.writeFileSync(rankingFile,'[]','utf8');
 const loadPlayers=()=>JSON.parse(fs.readFileSync(playersFile,'utf8')),savePlayers=rows=>fs.writeFileSync(playersFile,JSON.stringify(rows),'utf8');
 const loadRanking=()=>JSON.parse(fs.readFileSync(rankingFile,'utf8')),saveRanking=rows=>fs.writeFileSync(rankingFile,JSON.stringify(rows),'utf8');
 const official=()=>createOfficialAttemptService({root:store.load(),loadRanking,saveRanking,persist:()=>store.save(store.load())});
 const reward=()=>createOfficialRewardService({root:store.load(),loadPlayers,savePlayers,loadRanking,persist:()=>store.save(store.load()),calculateGameRewards,calculateDailyStreak,checkNewAchievements,achievementsDef:ACHIEVEMENTS_DEF,ensurePlayerExperience,validateApproval:input=>service.canApproveRewards(input)});
 function finish(correctCount){const attempt=service.createStudentAttempt({testId:ids.test,accountPlayerId:ids.student,groupId:'5A',studentSnapshot:{name:'Alumno',grade:'5A'}});service.startStudentAttempt(attempt.attemptId,ids.student,'5A');for(let i=0;i<attempt.progress.questions.length;i++){const q=attempt.progress.questions[i];service.answerStudentQuestion({testId:ids.test,attemptId:attempt.attemptId,accountPlayerId:ids.student,questionId:q.questionId,answer:i<correctCount?q.answer:q.answer+1});}return service.finishStudentAttempt({testId:ids.test,attemptId:attempt.attemptId,accountPlayerId:ids.student}).attempt;}
 const first=finish(2);let officialFirst=official().officialize({testId:ids.test,attemptId:first.attemptId,actor:'admin',eventId:randomUUID(),reason:'revisado'}).officialAttempt;official().publish({testId:ids.test,attemptId:first.attemptId,actor:'admin',eventId:randomUUID(),reason:'publicado uno'});assert.equal(loadRanking().filter(x=>x.testId===ids.test).length,1);
 const second=finish(1);assert.equal(service.latestFinishedAttempt(ids.test,ids.student).attemptId,second.attemptId);let officialSecond=official().officialize({testId:ids.test,attemptId:second.attemptId,actor:'admin',eventId:randomUUID(),reason:'revisado'}).officialAttempt;official().publish({testId:ids.test,attemptId:second.attemptId,actor:'admin',eventId:randomUUID(),reason:'publicado dos'});assert.equal(loadRanking().filter(x=>x.testId===ids.test).length,1);assert.equal(loadRanking()[0].score,1);
 const third=service.createStudentAttempt({testId:ids.test,accountPlayerId:ids.student,groupId:'5A',studentSnapshot:{name:'Alumno',grade:'5A'}});service.startStudentAttempt(third.attemptId,ids.student,'5A');assert.equal(service.latestFinishedAttempt(ids.test,ids.student).attemptId,second.attemptId);assert.throws(()=>service.canApproveRewards({testId:ids.test,attemptId:second.attemptId,accountPlayerId:ids.student}),/intento abierto/);
 for(const q of third.progress.questions)service.answerStudentQuestion({testId:ids.test,attemptId:third.attemptId,accountPlayerId:ids.student,questionId:q.questionId,answer:q.answer});service.finishStudentAttempt({testId:ids.test,attemptId:third.attemptId,accountPlayerId:ids.student});assert.throws(()=>official().publish({testId:ids.test,attemptId:second.attemptId,actor:'admin',eventId:randomUUID(),reason:'llegada tardía'}),/ultimo intento terminado/);
 const officialThird=official().officialize({testId:ids.test,attemptId:third.attemptId,actor:'admin',eventId:randomUUID(),reason:'revisado'}).officialAttempt;
 const preview=reward().preview({testId:ids.test,attemptId:third.attemptId});assert.equal(preview.publicationRequired,false);
 const input={testId:ids.test,attemptId:third.attemptId,officialAttemptId:officialThird.officialAttemptId,accountPlayerId:ids.student,actor:'admin',eventId:randomUUID(),reason:'aprobar y cerrar'};
 const settled=reward().settle(input);assert.equal(settled.settlement.status,'completed');assert.equal(loadRanking()[0].attemptId,second.attemptId,'aprobar no publica un resultado privado');
 const after=loadPlayers()[0].aureos,repeat=reward().settle({...input,eventId:randomUUID()});assert.equal(repeat.duplicate,true);assert.equal(loadPlayers()[0].aureos,after);assert.throws(()=>service.createStudentAttempt({testId:ids.test,accountPlayerId:ids.student,groupId:'5A'}),/participacion cerrada/);
 official().publish({testId:ids.test,attemptId:third.attemptId,actor:'admin',eventId:randomUUID(),reason:'publicar resultado'});assert.equal(loadRanking().filter(x=>x.testId===ids.test&&x.accountPlayerId===ids.student).length,1);assert.equal(loadRanking()[0].attemptId,third.attemptId);
 const otherAttempt=service.createStudentAttempt({testId:ids.test,accountPlayerId:ids.other,groupId:'5A',studentSnapshot:{name:'Otra alumna',grade:'5A'}});assert(otherAttempt.attemptId,'el cierre individual no bloquea a otro alumno');
 assert.equal(store.load().attempts.filter(x=>x.accountPlayerId===ids.student&&x.status==='finished').length,3);
 console.log('OK: resultado más reciente por secuencia, sustitución del ranking, rechazo de intento abierto, liquidación privada idempotente y cierre solo individual.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
