'use strict';

const assert=require('assert');
const {
  hasProgressInTableResults,
  shouldPersistCheckpoint,
  buildCheckpointRecord,
  upsertCheckpoint,
  isCheckpoint,
}=require('../src/game/checkpoints');
const { buildCompletedResultRecord, upsertCompletedResult }=require('../src/game/ranking');

const now=new Date(2026,8,7,9,30,0);
const message={
  id:'game-a',name:'ana',grade:'3B',score:25,correct:2,wrong:1,timeout:0,total:3,pct:67,
  streak:2,gameMode:'solo',setupMode:'operations',gameType:'timed',difficulty:'easy',tables:[2],
  tblResults:{'×':{correct:2,wrong:1,timeout:0,total:3}},
};

assert.strictEqual(shouldPersistCheckpoint({id:'x',name:'Ana'}),false,'checkpoint sin progreso no debe guardarse');
assert.strictEqual(shouldPersistCheckpoint({...message,total:0,score:0,correct:0,wrong:0,streak:0}),true,'tblResults con progreso debe bastar');
assert.strictEqual(hasProgressInTableResults({'×':{total:1}}),true,'debe detectar progreso por tabla');

const record=buildCheckpointRecord(message,'Ana',{now});
assert.strictEqual(record.name,'Ana','debe usar nombre canónico');
assert.strictEqual(record.complete,false,'un checkpoint siempre debe marcar complete:false');
assert.strictEqual(isCheckpoint(record),true,'debe identificar el registro incompleto');
assert.strictEqual(record.op,undefined,'no debe agregar campos que el checkpoint persistido no tenía');
assert.strictEqual(record.isExam,undefined,'no debe inventar clasificación de prueba en checkpoints');

const inserted=upsertCheckpoint([],message,'Ana',{now});
assert.strictEqual(inserted.saved,true,'debe insertar un checkpoint con progreso');
assert.strictEqual(inserted.reason,'inserted','debe identificar la inserción');

const changed={...message,score:50,correct:3,total:4,pct:75};
const updated=upsertCheckpoint(inserted.ranking,changed,'Ana',{now});
assert.strictEqual(updated.reason,'updated','debe actualizar el mismo ID');
assert.strictEqual(updated.ranking.length,1,'actualizar no debe duplicar la partida');
assert.strictEqual(updated.ranking[0].score,50,'debe conservar el progreso más reciente');

const second=upsertCheckpoint(updated.ranking,{...message,id:'game-b',name:'Luis'},'Luis',{now});
assert.deepStrictEqual(second.ranking.map(r=>r.id),['game-b','game-a'],'partidas y jugadores con IDs distintos deben aislarse');

const finalRecord=buildCompletedResultRecord({...changed,id:'game-a'},{canonicalName:'Ana',grade:'3B',now});
const completed=upsertCompletedResult(second.ranking,finalRecord,'game-a');
assert.strictEqual(completed.length,2,'el resultado final debe reemplazar el checkpoint');
assert.strictEqual(completed.find(r=>r.id==='game-a').complete,true,'la partida terminada debe quedar completa');

const blocked=upsertCheckpoint(completed,message,'Ana',{now});
assert.strictEqual(blocked.saved,false,'complete:true debe impedir que un checkpoint tardío degrade el resultado');
assert.strictEqual(blocked.reason,'completed','debe explicar la protección de resultado completo');

const legacy=upsertCheckpoint([{id:'legacy',name:'Ana'}],{...message,id:'legacy'},'Ana',{now});
assert.strictEqual(legacy.saved,true,'se conserva la regla actual: ausencia legada de complete no bloquea actualización');
assert.strictEqual(legacy.ranking[0].complete,false,'la actualización legada queda como checkpoint');

const empty=upsertCheckpoint(completed,{id:'empty',name:'Eva'},'Eva',{now});
assert.strictEqual(empty.saved,false,'datos faltantes sin progreso deben ignorarse');
assert.strictEqual(empty.ranking,completed,'un checkpoint ignorado no debe copiar ni mutar el ranking');

console.log('OK: checkpoints conservan creación, complete:false, progreso, actualización, reemplazo final, aislamiento y fallbacks legados.');
