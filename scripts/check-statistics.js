'use strict';

const assert=require('assert');
const {
  importRankingRows,
  removePlayerResults,
  removeRankingResult,
  upsertCompletedResult,
}=require('../src/game/ranking');
const {upsertCheckpoint}=require('../src/game/checkpoints');
const {
  calculateOperationStats,
  getReliableOperation,
  calculatePlayerAverages,
  calculateOverallStatistics,
  aggregateTableStatistics,
  aggregateTableDetailStatistics,
  buildStudentHistory,
  createOperationStatsCache,
}=require('../src/game/statistics');

const empty=calculateOperationStats([]);
assert.deepStrictEqual(empty,{
  mult:{pct:null,games:0},add:{pct:null,games:0},sub:{pct:null,games:0},div:{pct:null,games:0},
},'estadísticas vacías deben conservar las cuatro operaciones');

const records=[
  {id:1,name:'Ana',op:'mult',score:100,pct:80,correct:8,wrong:2,total:10,complete:true,tblResults:{'×':{correct:8,wrong:2,total:10}},tableDetail:{'×':{'2':{correct:4,wrong:1,total:5}}}},
  {id:2,name:'ANA',op:'add',score:200,pct:50,correct:5,wrong:5,total:10,complete:true,tblResults:{'+':{correct:5,wrong:4,timeout:1,total:10}},tableDetail:{'×':{'2':{correct:3,wrong:2,total:5}},'+':{'2 cifras':{correct:5,wrong:4,timeout:1,total:10}}}},
  {id:3,name:'Luis',score:50,pct:100,correct:1,wrong:0,total:1,complete:false,tblResults:{}},
  {id:4,name:'Mia',score:40,pct:80,correct:4,wrong:1,total:5,complete:false,tblResults:{'÷':{correct:4,wrong:1,total:5}}},
  {id:5,name:'Eva',score:20,pct:100,correct:2,wrong:0,total:2,complete:false,tblResults:{'×':{correct:1,total:1},'+':{correct:1,total:1}}},
];
const ops=calculateOperationStats(records);
assert.deepStrictEqual(ops.mult,{pct:80,games:1},'checkpoint sin operación confiable no debe contaminar mult');
assert.deepStrictEqual(ops.add,{pct:50,games:1},'debe agrupar correctas y total por operación');
assert.deepStrictEqual(ops.sub,{pct:null,games:0},'operación sin datos debe conservar pct:null');
assert.deepStrictEqual(ops.div,{pct:80,games:1},'checkpoint con una sola operación inequívoca debe clasificarse correctamente');
assert.strictEqual(getReliableOperation(records[2]),null,'checkpoint sin evidencia debe quedar sin operación');
assert.strictEqual(getReliableOperation(records[4]),null,'checkpoint con operaciones contradictorias debe quedar sin operación');
assert.strictEqual(getReliableOperation({complete:true}), 'mult','resultado completo legado conserva fallback mult');
assert.deepStrictEqual(
  calculateOverallStatistics(records),
  {games:5,correct:20,wrong:8,timeout:0,total:28,pct:71},
  'debe calcular partidas, contadores y precisión global incluyendo checkpoints',
);

assert.deepStrictEqual(
  calculatePlayerAverages(records,'ana'),
  {games:2,avgScore:150,avgPct:65},
  'promedios por alumno deben ser por partida e ignorar mayúsculas',
);

const tables=aggregateTableStatistics(records);
assert.deepStrictEqual(tables['×'],{correct:9,wrong:2,timeout:0,total:11,games:2,pct:82},'tblResults conserva sus agregaciones por clave real');
assert.deepStrictEqual(tables['+'],{correct:6,wrong:4,timeout:1,total:11,games:2,pct:55},'debe agregar correctas, incorrectas, timeout y precisión');
assert.deepStrictEqual(tables['÷'],{correct:4,wrong:1,timeout:0,total:5,games:1,pct:80},'debe conservar el checkpoint inferible en su operación real');
const tableDetail=aggregateTableDetailStatistics(records);
assert.deepStrictEqual(tableDetail['×']['2'],{correct:7,wrong:3,timeout:0,total:10,pct:70},'debe agregar rendimiento real por tabla');
assert.deepStrictEqual(tableDetail['+']['2 cifras'],{correct:5,wrong:4,timeout:1,total:10,pct:50},'debe conservar agrupaciones no numéricas existentes');

const many=Array.from({length:12},(_,index)=>({
  id:index+1,name:index===0?' Eva ':'Eva',score:index,pct:index,correct:index,gameMode:'',tblResults:null,tableDetail:null,
}));
const history=buildStudentHistory(many,' Eva ',10);
assert.strictEqual(history.length,10,'el historial debe limitarse a 10');
assert.strictEqual(history[0].score,11,'el historial debe ordenar por ID descendente');
assert.strictEqual(history[0].gameMode,'solo','debe conservar fallbacks de campos faltantes');
assert.deepStrictEqual(history[0].tblResults,{},'debe tolerar tblResults faltante');

let source=[records[0]];
const cache=createOperationStatsCache(()=>source);
const saveRanking=cache.wrapSave(next=>{source=next;});
const first=cache.get();
source=[...records];
assert.strictEqual(cache.get(),first,'la caché debe reutilizar el cálculo hasta invalidarse');
cache.invalidate();
assert.deepStrictEqual(cache.get(),ops,'invalidar debe recalcular con los datos actuales');

// STATISTICS-002: todas las mutaciones reales del ranking pasan por el guardado envuelto.
saveRanking(upsertCompletedResult(source,{id:6,name:'Sol',op:'sub',correct:3,total:3,complete:true},6));
assert.deepStrictEqual(cache.get().sub,{pct:100,games:1},'resultado final debe invalidar la caché');

let checkpointChange=upsertCheckpoint(source,{id:7,name:'Leo',correct:2,total:2,tblResults:{'+':{correct:2,total:2}}},'Leo');
saveRanking(checkpointChange.ranking);
assert.deepStrictEqual(cache.get().add,{pct:58,games:2},'checkpoint nuevo debe invalidar la caché');

checkpointChange=upsertCheckpoint(source,{id:7,name:'Leo',correct:1,wrong:1,total:2,tblResults:{'+':{correct:1,wrong:1,total:2}}},'Leo');
saveRanking(checkpointChange.ranking);
assert.deepStrictEqual(cache.get().add,{pct:50,games:2},'checkpoint actualizado debe invalidar la caché');

saveRanking(removeRankingResult(source,1).ranking);
assert.deepStrictEqual(cache.get().mult,{pct:null,games:0},'eliminar partida debe invalidar la caché');

const imported=importRankingRows(source,[{id:8,name:'Noa',op:'div',correct:5,total:5,complete:true,date:'1/1/2026',time:'10:00'}]);
saveRanking(imported.ranking);
// La importación histórica no conserva `op`, pero tblResults ausente mantiene fallback completo a mult.
assert.strictEqual(cache.get().mult.games,1,'importar debe invalidar la caché y reflejar el nuevo registro');

saveRanking(removePlayerResults(source,'Leo').ranking);
assert.strictEqual(cache.get().add.games,1,'limpiar historial de alumno debe invalidar la caché');

saveRanking([]);
assert.deepStrictEqual(cache.get(),empty,'limpiar ranking debe invalidar la caché');

console.log('OK: estadísticas conservan partidas, precisión, operaciones, tablas, alumnos, vacíos, límite 10, checkpoints y caché.');
