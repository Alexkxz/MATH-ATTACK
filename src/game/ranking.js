'use strict';

const MAX_RANKING_RECORDS = 500;

function cleanText(value){
  return String(value??'').trim();
}

function numberOrZero(value){
  return Number.isFinite(Number(value))?Number(value):0;
}

function isCheckpoint(record){
  return !!record&&record.complete===false;
}

// Los registros legados no incluían `complete`; históricamente se interpretan como completos.
function isCompleteResult(record){
  return !!record&&!isCheckpoint(record);
}

function limitRanking(records, maxRecords=MAX_RANKING_RECORDS){
  return (Array.isArray(records)?records:[]).slice(0,maxRecords);
}

function prependRankingRecords(records, newRecords, maxRecords=MAX_RANKING_RECORDS){
  return limitRanking([...(Array.isArray(newRecords)?newRecords:[]),...(Array.isArray(records)?records:[])],maxRecords);
}

function upsertCompletedResult(records, record, sourceId, maxRecords=MAX_RANKING_RECORDS){
  const next=Array.isArray(records)?[...records]:[];
  const index=sourceId?next.findIndex(item=>item.id===sourceId):-1;
  if(index>=0) next[index]=record;
  else next.unshift(record);
  return limitRanking(next,maxRecords);
}

function filterRankingByPlayer(records, name, {trim=false}={}){
  const normalize=value=>{
    const text=String(value??'').toLowerCase();
    return trim?text.trim():text;
  };
  const expected=normalize(name);
  return (Array.isArray(records)?records:[]).filter(record=>normalize(record?.name)===expected);
}

function removePlayerResults(records, name){
  const lower=String(name??'').toLowerCase();
  const source=Array.isArray(records)?records:[];
  const ranking=source.filter(record=>String(record?.name??'').toLowerCase()!==lower);
  return {ranking,removed:source.length-ranking.length};
}

function removeRankingResult(records, id){
  const source=Array.isArray(records)?records:[];
  const ranking=source.filter(record=>record?.id!==id);
  return {ranking,removed:source.length-ranking.length};
}

function buildCompletedResultRecord(msg, options={}){
  const now=options.now instanceof Date?options.now:new Date(options.now??Date.now());
  return {
    id:msg.id||Date.now(),
    name:options.canonicalName||msg.name||'?',
    grade:options.grade||'',
    score:msg.score||0,
    correct:msg.correct||0,
    wrong:msg.wrong||0,
    timeout:msg.timeout||0,
    total:msg.total||0,
    pct:msg.pct||0,
    streak:msg.streak||0,
    gameMode:msg.gameMode||'solo',
    setupMode:msg.setupMode||msg.gameMode||'solo',
    mpGameMode:msg.mpGameMode||'',
    gameType:msg.gameType||'timed',
    difficulty:msg.difficulty||'',
    op:msg.op||'mult',
    vs:msg.vs||'',
    tables:msg.tables||[],
    tblResults:msg.tblResults||{},
    tableDetail:msg.tableDetail||{},
    stepDetail:msg.stepDetail||{},
    isExam:!!msg.isExam,
    date:now.toLocaleDateString('es-MX'),
    time:now.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}),
    complete:true,
  };
}

function normalizeImportedId(id){
  const text=cleanText(id);
  if(!text) return '';
  return /^\d+$/.test(text)?Number(text):text;
}

function rankingSignature(record){
  return [
    cleanText(record?.name).toLowerCase(),cleanText(record?.grade),numberOrZero(record?.score),
    numberOrZero(record?.correct),numberOrZero(record?.wrong),numberOrZero(record?.timeout),
    numberOrZero(record?.total),numberOrZero(record?.pct),numberOrZero(record?.streak),
    cleanText(record?.gameMode),cleanText(record?.mpGameMode),cleanText(record?.gameType),
    cleanText(record?.difficulty),cleanText(record?.date),cleanText(record?.time),
  ].join('|');
}

function normalizeImportedRecord(record, index, options={}){
  const now=options.now instanceof Date?options.now:new Date(options.now??Date.now());
  const id=normalizeImportedId(record?.id)||(`imp-${now.getTime()}-${index}`);
  return {
    id,name:cleanText(record?.name)||'?',grade:cleanText(record?.grade),
    score:numberOrZero(record?.score),correct:numberOrZero(record?.correct),wrong:numberOrZero(record?.wrong),
    timeout:numberOrZero(record?.timeout),
    total:numberOrZero(record?.total)||numberOrZero(record?.correct)+numberOrZero(record?.wrong)+numberOrZero(record?.timeout),
    pct:numberOrZero(record?.pct),streak:numberOrZero(record?.streak),gameMode:cleanText(record?.gameMode)||'solo',
    mpGameMode:cleanText(record?.mpGameMode),gameType:cleanText(record?.gameType)||'timed',
    difficulty:cleanText(record?.difficulty),tables:Array.isArray(record?.tables)?record.tables:[],
    tblResults:(record?.tblResults&&typeof record.tblResults==='object')?record.tblResults:{},
    tableDetail:(record?.tableDetail&&typeof record.tableDetail==='object')?record.tableDetail:{},
    stepDetail:(record?.stepDetail&&typeof record.stepDetail==='object')?record.stepDetail:{},
    date:cleanText(record?.date)||now.toLocaleDateString('es-MX'),
    time:cleanText(record?.time)||now.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}),
    isExam:!!record?.isExam,complete:record?.complete!==false,
  };
}

function importRankingRows(records, rows, options={}){
  const source=Array.isArray(records)?records:[];
  const ids=new Set(source.map(record=>cleanText(record?.id)).filter(Boolean));
  const signatures=new Set(source.map(rankingSignature));
  const imported=[];
  let skipped=0;
  let invalid=0;
  (Array.isArray(rows)?rows:[]).forEach((raw,index)=>{
    const record=normalizeImportedRecord(raw,index,options);
    if(!record.name){ invalid++; return; }
    const idKey=cleanText(record.id);
    const signature=rankingSignature(record);
    if((idKey&&ids.has(idKey))||signatures.has(signature)){ skipped++; return; }
    ids.add(idKey);
    signatures.add(signature);
    imported.push(record);
  });
  return {
    ranking:prependRankingRecords(source,imported),
    imported,
    added:imported.length,
    skipped,
    invalid,
  };
}

function buildRankingCsv(records){
  const allOps=['×','+','−','÷'];
  const opNames={'×':'Multiplicacion','+':'Suma','−':'Resta','÷':'Division'};
  const opHeaders=allOps.map(op=>`${opNames[op]} % Aciertos,${opNames[op]} Correctas,${opNames[op]} Total`).join(',');
  const header=`Nombre,Grado,Puntaje,% Aciertos,Correctas,Incorrectas,Sin Tiempo,Racha Max,Modo,Tipo,Dificultad,${opHeaders},Fecha,Hora\n`;
  const rows=(Array.isArray(records)?records:[]).map(record=>{
    const opCols=allOps.map(op=>{
      const result=record.tblResults&&record.tblResults[op];
      if(!result||result.total===0) return ',,';
      return `${Math.round((result.correct/result.total)*100)}%,${result.correct},${result.total}`;
    }).join(',');
    return [
      `"${(record.name||'').replace(/"/g,'""')}"`,
      `"${(record.grade||'').replace(/"/g,'""')}"`,
      record.score||0,record.pct||0,record.correct||0,record.wrong||0,record.timeout||0,record.streak||0,
      record.gameMode||'',record.gameType||'',record.difficulty||'',opCols,record.date||'',record.time||'',
    ].join(',');
  }).join('\n');
  return '\uFEFF'+header+rows;
}

module.exports={
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
  rankingSignature,
  importRankingRows,
  buildRankingCsv,
};
