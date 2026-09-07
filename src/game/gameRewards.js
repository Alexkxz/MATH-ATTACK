'use strict';

const { GAME_EXPERIENCE_MULT } = require('./playerLevels');

const GAME_AUREOS_MULT = 2;
const TABLE_VARIETY_COOLDOWN_MS = 30*60*1000;
const TIMED_MULT = {easy:0.8,medium:1.0,hard:1.3,expert:1.6};
const LIVES_MULT = {'lives_8':0.8,'lives_5':1.0,'lives_3':1.3};
const BASE_MULT = {free:0.5,countdown:1.0,streak:2.0,survival:1.5};

function calculateDirectGameReward(amount){
  const baseReward=Math.floor(amount);
  return {
    baseReward,
    earnedAureos:baseReward*GAME_AUREOS_MULT,
    earnedExperience:baseReward*GAME_EXPERIENCE_MULT,
  };
}

function calculateGameRewards(result, options={}){
  const gameType=result.gameType||'free';
  const difficulty=result.difficulty||'';
  let mult=1.0;
  if(gameType==='timed') mult=TIMED_MULT[difficulty]??1.0;
  else if(gameType==='lives') mult=LIVES_MULT[difficulty]??1.0;
  else mult=BASE_MULT[gameType]??1.0;

  let varietyMult=1.0;
  const playedTables=Object.keys(result.tblResults||{}).filter(key=>(result.tblResults[key]?.total||0)>0);
  let tableHistory=options.tableHistory;
  let tableHistoryChanged=false;
  if(options.hasPlayer&&playedTables.length>0){
    const now=options.now??Date.now();
    tableHistory={...(tableHistory||{})};
    const fresh=playedTables.filter(table=>!tableHistory[table]||(now-tableHistory[table])>TABLE_VARIETY_COOLDOWN_MS).length;
    varietyMult=Math.max(0.5,fresh/playedTables.length);
    playedTables.forEach(table=>{tableHistory[table]=now;});
    tableHistoryChanged=true;
  }

  const magnetMult=result.aureosBonus?1.3:1.0;
  const rewardScore=Math.max(0,Number(result.score)||0);
  let baseReward=Math.floor(rewardScore/100*mult*varietyMult*magnetMult);
  if(result.gameMode==='duel'&&result.isWinner) baseReward*=2;

  return {
    gameType,
    difficulty,
    mult,
    varietyMult,
    magnetMult,
    baseReward,
    earnedAureos:baseReward*GAME_AUREOS_MULT,
    earnedExperience:baseReward*GAME_EXPERIENCE_MULT,
    playedTables,
    tableHistory,
    tableHistoryChanged,
  };
}

module.exports = {
  GAME_AUREOS_MULT,
  TABLE_VARIETY_COOLDOWN_MS,
  TIMED_MULT,
  LIVES_MULT,
  BASE_MULT,
  calculateDirectGameReward,
  calculateGameRewards,
};
