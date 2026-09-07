'use strict';

const { MAX_RANKING_RECORDS, isCheckpoint, limitRanking } = require('./ranking');

function hasProgressInTableResults(tableResults){
  return Object.values(tableResults||{}).some(value=>(value?.total||0)>0);
}

function shouldPersistCheckpoint(message){
  if(!message||!message.id||!message.name) return false;
  if((message.total||0)>0) return true;
  if((message.score||0)>0||(message.correct||0)>0||(message.wrong||0)>0||(message.timeout||0)>0||(message.streak||0)>0) return true;
  return hasProgressInTableResults(message.tblResults);
}

function buildCheckpointRecord(message, canonicalName, options={}){
  const now=options.now instanceof Date?options.now:new Date(options.now??Date.now());
  return {
    id:message.id,
    name:canonicalName||message.name||'?',
    grade:message.grade||'',
    score:message.score||0,
    correct:message.correct||0,
    wrong:message.wrong||0,
    timeout:message.timeout||0,
    total:message.total||0,
    pct:message.pct||0,
    streak:message.streak||0,
    gameMode:message.gameMode||'solo',
    setupMode:message.setupMode||message.gameMode||'solo',
    mpGameMode:message.mpGameMode||'',
    gameType:message.gameType||'timed',
    difficulty:message.difficulty||'',
    tables:message.tables||[],
    tblResults:message.tblResults||{},
    tableDetail:message.tableDetail||{},
    stepDetail:message.stepDetail||{},
    date:now.toLocaleDateString('es-MX'),
    time:now.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}),
    complete:false,
  };
}

function upsertCheckpoint(records, message, canonicalName, options={}){
  const source=Array.isArray(records)?records:[];
  if(!shouldPersistCheckpoint(message)) return {ranking:source,saved:false,reason:'empty'};
  const index=source.findIndex(record=>record.id===message.id);
  // Conserva la protección histórica exacta: solo `complete:true` bloquea el checkpoint.
  if(index>=0&&source[index]?.complete) return {ranking:source,saved:false,reason:'completed'};
  const ranking=[...source];
  const record=buildCheckpointRecord(message,canonicalName,options);
  if(index>=0) ranking[index]=record;
  else ranking.unshift(record);
  return {
    ranking:limitRanking(ranking,options.maxRecords??MAX_RANKING_RECORDS),
    record,
    saved:true,
    reason:index>=0?'updated':'inserted',
  };
}

module.exports={
  hasProgressInTableResults,
  shouldPersistCheckpoint,
  buildCheckpointRecord,
  upsertCheckpoint,
  isCheckpoint,
};
