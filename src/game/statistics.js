'use strict';

const { filterRankingByPlayer, isCheckpoint, isCompleteResult } = require('./ranking');

const OPERATION_ALIASES={
  mult:'mult','×':'mult',
  add:'add','+':'add',
  sub:'sub','−':'sub','-':'sub',
  div:'div','÷':'div','/':'div',
};

function normalizeOperation(value){
  return OPERATION_ALIASES[String(value??'').trim()]||null;
}

function hasStatProgress(value){
  if(!value||typeof value!=='object') return false;
  const counterKeys=['correct','wrong','timeout','total','c','w','t'];
  if(counterKeys.some(key=>Number(value[key])>0)) return true;
  return Object.values(value).some(child=>child&&typeof child==='object'&&hasStatProgress(child));
}

function inferOperationFromDetails(record){
  const all=new Set();
  const active=new Set();
  for(const source of [record?.tblResults,record?.tableDetail,record?.stepDetail]){
    Object.entries(source||{}).forEach(([key,value])=>{
      const operation=normalizeOperation(key);
      if(!operation) return;
      all.add(operation);
      if(hasStatProgress(value)) active.add(operation);
    });
  }
  const evidence=active.size?active:all;
  return evidence.size===1?[...evidence][0]:null;
}

function getReliableOperation(record){
  const explicit=normalizeOperation(record?.op);
  if(explicit) return explicit;
  const inferred=inferOperationFromDetails(record);
  if(inferred) return inferred;
  // El fallback a multiplicación se conserva solo para resultados históricos completos.
  // Un checkpoint sin evidencia inequívoca queda fuera de estadísticas por operación.
  return isCheckpoint(record)?null:'mult';
}

function calculateOperationStats(records){
  const operations={
    mult:{c:0,total:0,games:0},
    add:{c:0,total:0,games:0},
    sub:{c:0,total:0,games:0},
    div:{c:0,total:0,games:0},
  };
  (Array.isArray(records)?records:[]).forEach(record=>{
    const key=getReliableOperation(record);
    if(!operations[key]) return;
    operations[key].c+=(record.correct||0);
    operations[key].total+=(record.total||0);
    operations[key].games++;
  });
  return Object.fromEntries(Object.entries(operations).map(([key,value])=>[key,{
    pct:value.total>0?Math.round(value.c/value.total*100):null,
    games:value.games,
  }]));
}

function calculatePlayerAverages(records, name){
  const history=filterRankingByPlayer(records,name);
  return {
    games:history.length,
    avgScore:history.length?Math.round(history.reduce((sum,record)=>sum+(record.score||0),0)/history.length):0,
    avgPct:history.length?Math.round(history.reduce((sum,record)=>sum+(record.pct||0),0)/history.length):0,
  };
}

function calculateOverallStatistics(records){
  const source=Array.isArray(records)?records:[];
  const totals=source.reduce((result,record)=>{
    result.correct+=(record.correct||0);
    result.wrong+=(record.wrong||0);
    result.timeout+=(record.timeout||0);
    result.total+=(record.total||0);
    return result;
  },{correct:0,wrong:0,timeout:0,total:0});
  return {
    games:source.length,
    ...totals,
    pct:totals.total>0?Math.round(totals.correct/totals.total*100):null,
  };
}

function aggregateTableStatistics(records){
  const result={};
  (Array.isArray(records)?records:[]).forEach(record=>{
    Object.entries(record.tblResults||{}).forEach(([operation,value])=>{
      if(!result[operation]) result[operation]={correct:0,wrong:0,timeout:0,total:0,games:0};
      const correct=value?.correct||value?.c||0;
      const wrong=value?.wrong||value?.w||0;
      const timeout=value?.timeout||0;
      result[operation].correct+=correct;
      result[operation].wrong+=wrong;
      result[operation].timeout+=timeout;
      result[operation].total+=value?.total||correct+wrong+timeout;
      result[operation].games++;
    });
  });
  return Object.fromEntries(Object.entries(result).map(([operation,value])=>[operation,{
    ...value,
    pct:value.total>0?Math.round(value.correct/value.total*100):null,
  }]));
}

function aggregatePlayerAchievementStats(records, name){
  const result={};
  filterRankingByPlayer(records,name).filter(isCompleteResult).forEach(record=>{
    Object.entries(record.tblResults||{}).forEach(([operation,value])=>{
      if(!result[operation]) result[operation]={c:0,w:0};
      result[operation].c+=(value.correct||value.c||0);
      result[operation].w+=(value.wrong||value.w||0);
    });
  });
  return result;
}

function aggregateTableDetailStatistics(records){
  const result={};
  (Array.isArray(records)?records:[]).forEach(record=>{
    Object.entries(record.tableDetail||{}).forEach(([operation,tables])=>{
      if(!result[operation]) result[operation]={};
      Object.entries(tables||{}).forEach(([table,value])=>{
        if(!result[operation][table]) result[operation][table]={correct:0,wrong:0,timeout:0,total:0};
        result[operation][table].correct+=(value?.correct||0);
        result[operation][table].wrong+=(value?.wrong||0);
        result[operation][table].timeout+=(value?.timeout||0);
        result[operation][table].total+=(value?.total||0);
      });
    });
  });
  Object.values(result).forEach(tables=>{
    Object.values(tables).forEach(value=>{
      value.pct=value.total>0?Math.round(value.correct/value.total*100):null;
    });
  });
  return result;
}

function buildStudentHistory(records, name, limit=10){
  return filterRankingByPlayer(records,name,{trim:true})
    .sort((a,b)=>(b.id||0)-(a.id||0))
    .slice(0,limit)
    .map(record=>({
      date:record.date||'',time:record.time||'',score:record.score||0,pct:record.pct||0,
      correct:record.correct||0,wrong:record.wrong||0,gameMode:record.gameMode||'solo',
      gameType:record.gameType||'',difficulty:record.difficulty||'',tblResults:record.tblResults||{},
      tableDetail:record.tableDetail||{},
    }));
}

function createOperationStatsCache(loadRanking){
  let cache=null;
  return {
    get(){
      if(cache) return cache;
      cache=calculateOperationStats(loadRanking());
      return cache;
    },
    invalidate(){ cache=null; },
    wrapSave(saveRanking){
      return (...args)=>{
        const result=saveRanking(...args);
        cache=null;
        return result;
      };
    },
  };
}

module.exports={
  calculateOperationStats,
  getReliableOperation,
  calculatePlayerAverages,
  calculateOverallStatistics,
  aggregateTableStatistics,
  aggregatePlayerAchievementStats,
  aggregateTableDetailStatistics,
  buildStudentHistory,
  createOperationStatsCache,
};
