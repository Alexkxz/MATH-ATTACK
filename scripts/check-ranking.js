'use strict';

const assert=require('assert');
const {
  MAX_RANKING_RECORDS,
  isCheckpoint,
  isCompleteResult,
  limitRanking,
  prependRankingRecords,
  upsertCompletedResult,
  filterRankingByPlayer,
  removePlayerResults,
  removeRankingResult,
  buildCompletedResultRecord,
  normalizeImportedRecord,
  importRankingRows,
  buildRankingCsv,
}=require('../src/game/ranking');

assert.strictEqual(MAX_RANKING_RECORDS,500,'el límite histórico del ranking cambió');
assert.deepStrictEqual(limitRanking([]),[],'ranking vacío debe permanecer vacío');

const fixedDate=new Date(2026,8,7,14,5,0);
const completed=buildCompletedResultRecord({
  id:10,name:'ana',score:120,correct:9,wrong:1,total:10,pct:90,streak:4,
  setupMode:'operations',op:'add',tables:[1],tblResults:{'+':{correct:9,wrong:1,total:10}},isExam:true,
},{canonicalName:'Ana',grade:'4A',now:fixedDate});
assert.strictEqual(completed.name,'Ana','debe usar el nombre canónico resuelto por el servidor');
assert.strictEqual(completed.complete,true,'un resultado final debe marcar complete:true');
assert.strictEqual(completed.isExam,true,'debe conservar la clasificación de prueba');
assert.strictEqual(completed.gameMode,'solo','debe conservar el modo predeterminado');
assert.strictEqual(completed.gameType,'timed','debe conservar el tipo predeterminado');
assert.ok(completed.date&&completed.time,'debe producir fecha y hora actuales del registro');

assert.strictEqual(isCompleteResult(completed),true,'complete:true debe ser resultado completo');
assert.strictEqual(isCheckpoint({complete:false}),true,'complete:false debe ser checkpoint');
assert.strictEqual(isCompleteResult({id:'legacy'}),true,'la ausencia legada de complete se interpreta como resultado completo');

const ordered=prependRankingRecords([{id:1},{id:0}],[{id:3},{id:2}]);
assert.deepStrictEqual(ordered.map(r=>r.id),[3,2,1,0],'el ranking conserva orden de inserción: nuevos primero');
const updated=upsertCompletedResult(ordered,{id:2,score:99},2);
assert.deepStrictEqual(updated.map(r=>r.id),[3,2,1,0],'reemplazar por ID no debe cambiar la posición existente');
assert.strictEqual(updated[1].score,99,'debe reemplazar el registro de la misma partida');
const inserted=upsertCompletedResult(updated,{id:4},null);
assert.deepStrictEqual(inserted.map(r=>r.id),[4,3,2,1,0],'un resultado sin ID de origen se agrega al inicio');

const oversized=Array.from({length:501},(_,index)=>({id:index}));
assert.strictEqual(limitRanking(oversized).length,500,'debe recortar a 500 registros');
assert.strictEqual(limitRanking(oversized)[499].id,499,'el recorte debe conservar los primeros 500');

const players=[{id:1,name:'Ana'},{id:2,name:'ANA'},{id:3,name:'Luis'}];
assert.deepStrictEqual(filterRankingByPlayer(players,'ana').map(r=>r.id),[1,2],'la búsqueda debe ignorar mayúsculas');
assert.strictEqual(removePlayerResults(players,'ana').removed,2,'debe eliminar todo el historial del alumno');
assert.deepStrictEqual(removeRankingResult(players,2).ranking.map(r=>r.id),[1,3],'debe eliminar una partida por ID estricto');

const normalized=normalizeImportedRecord({name:'  Eva ',correct:'2',wrong:'1',timeout:'1',complete:false},0,{now:fixedDate});
assert.strictEqual(normalized.name,'Eva','debe limpiar texto importado');
assert.strictEqual(normalized.total,4,'debe reconstruir total faltante con los contadores actuales');
assert.strictEqual(normalized.complete,false,'debe conservar checkpoints importados');
assert.deepStrictEqual(normalized.tables,[],'debe tolerar tablas faltantes');
assert.deepStrictEqual(normalized.tblResults,{},'debe tolerar resultados por tabla faltantes');

const imported=importRankingRows(
  [{id:1,name:'Ana',score:10,date:'1/1/2026',time:'10:00'}],
  [
    {id:1,name:'Duplicada por ID',score:20},
    {id:2,name:'Luis',score:30,date:'2/1/2026',time:'11:00'},
    {id:3,name:'Luis',score:30,date:'2/1/2026',time:'11:00'},
    {},
  ],
  {now:fixedDate},
);
assert.strictEqual(imported.added,2,'debe conservar deduplicación por ID y firma');
assert.strictEqual(imported.skipped,2,'debe reportar duplicados por ID y por firma');
assert.strictEqual(imported.invalid,0,'la importación histórica normaliza un nombre faltante como "?"');
assert.deepStrictEqual(imported.ranking.map(r=>r.id),[2,'imp-1788811500000-3',1],'los importados se anteponen en el orden recibido');

const csv=buildRankingCsv([completed]);
assert.ok(csv.startsWith('\uFEFFNombre,Grado'),'CSV debe conservar BOM y encabezado');
assert.ok(csv.includes('"Ana","4A",120,90,9,1'),'CSV debe conservar sus campos actuales');

console.log('OK: ranking conserva normalización, semántica complete, orden, reemplazo, filtros, importación, CSV y límite de 500.');
