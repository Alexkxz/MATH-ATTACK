'use strict';

const { aggregatePlayerAchievementStats } = require('./statistics');

const ACHIEVEMENTS_DEF = [
  { id:'perfect',    icon:'💯', name:'Perfección',    desc:'100% precisión en una partida', bonus:50  },
  { id:'streak20',   icon:'🔥', name:'Racha ×20',     desc:'20 respuestas seguidas correctas', bonus:30 },
  { id:'master_mult',icon:'✖️', name:'Maestro ×',     desc:'90%+ acumulado en Multiplicación (mín. 10 resp.)', bonus:100 },
  { id:'master_add', icon:'➕', name:'Maestro +',     desc:'90%+ acumulado en Suma (mín. 10 resp.)', bonus:100 },
  { id:'master_sub', icon:'➖', name:'Maestro −',     desc:'90%+ acumulado en Resta (mín. 10 resp.)', bonus:100 },
  { id:'master_div', icon:'➗', name:'Maestro ÷',     desc:'90%+ acumulado en División (mín. 10 resp.)', bonus:100 },
];

function checkNewAchievements(player, result, ranking){
  const earned=player.achievements||(player.achievements=[]);
  const newOnes=[];

  // Perfección
  if(!earned.includes('perfect')&&(result.pct||0)===100&&(result.total||0)>=5){
    earned.push('perfect'); newOnes.push('perfect');
  }
  // Racha ×20
  if(!earned.includes('streak20')&&(result.streak||0)>=20){
    earned.push('streak20'); newOnes.push('streak20');
  }
  // Maestro de operación (comprueba acumulado histórico por clave de operación: ×, +, −, ÷)
  // save_result persiste la partida actual antes de evaluar logros, por lo que ranking ya
  // contiene ese resultado. Usar únicamente ranking evita contabilizarlo una segunda vez.
  // Los checkpoints `complete:false` no contribuyen; los registros legados sin el campo
  // `complete` siguen considerándose resultados completos por la semántica de ranking.
  const tblStats=aggregatePlayerAchievementStats(ranking,result.name);
  const opChecks=[{id:'master_mult',op:'×'},{id:'master_add',op:'+'},{id:'master_sub',op:'−'},{id:'master_div',op:'÷'}];
  for(const {id,op} of opChecks){
    if(earned.includes(id)) continue;
    const st=tblStats[op];
    if(st&&(st.c+st.w)>=10&&st.c/(st.c+st.w)>=0.9){
      earned.push(id); newOnes.push(id);
    }
  }
  return newOnes;
}

module.exports = { ACHIEVEMENTS_DEF, checkNewAchievements };
