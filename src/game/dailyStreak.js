'use strict';

function makeDate(controlledDate){
  return controlledDate===undefined ? new Date() : new Date(controlledDate);
}

function normalizeStreakValue(value){
  const numeric=Number(value);
  return Number.isFinite(numeric)?Math.max(0,Math.floor(numeric)):0;
}

function calculateDailyStreak(dailyStreak, controlledDate){
  const today=makeDate(controlledDate).toLocaleDateString('es-MX');
  const streak={...(dailyStreak||{current:0,best:0,lastDate:''})};
  streak.current=normalizeStreakValue(streak.current);
  streak.best=normalizeStreakValue(streak.best);
  if(streak.lastDate===today) return {dailyStreak:streak,bonus:0};

  const yesterday=makeDate(controlledDate);
  yesterday.setDate(yesterday.getDate()-1);
  const yesterdayText=yesterday.toLocaleDateString('es-MX');
  streak.current=(streak.lastDate===yesterdayText)?streak.current+1:1;
  streak.best=Math.max(streak.best,streak.current);
  streak.lastDate=today;
  const current=streak.current;
  const bonus=current>=30?200:current>=7?50:current>=3?15:5;
  return {dailyStreak:streak,bonus};
}

module.exports = { calculateDailyStreak };
