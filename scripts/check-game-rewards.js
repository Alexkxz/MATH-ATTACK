'use strict';

const assert = require('assert');
const {
  GAME_AUREOS_MULT,
  TABLE_VARIETY_COOLDOWN_MS,
  TIMED_MULT,
  LIVES_MULT,
  BASE_MULT,
  calculateDirectGameReward,
  calculateGameRewards,
} = require('../src/game/gameRewards');

assert.strictEqual(GAME_AUREOS_MULT, 2, 'el multiplicador de Áureos cambió');
assert.strictEqual(TABLE_VARIETY_COOLDOWN_MS, 30*60*1000, 'el cooldown de variedad cambió');
assert.deepStrictEqual(TIMED_MULT, {easy:0.8,medium:1,hard:1.3,expert:1.6}, 'cambiaron los multiplicadores timed');
assert.deepStrictEqual(LIVES_MULT, {lives_8:0.8,lives_5:1,lives_3:1.3}, 'cambiaron los multiplicadores lives');
assert.deepStrictEqual(BASE_MULT, {free:0.5,countdown:1,streak:2,survival:1.5}, 'cambiaron los multiplicadores base');

function reward(result, options){
  const value=calculateGameRewards(result, options);
  return {
    mult:value.mult,
    varietyMult:value.varietyMult,
    magnetMult:value.magnetMult,
    baseReward:value.baseReward,
    earnedAureos:value.earnedAureos,
    earnedExperience:value.earnedExperience,
  };
}

assert.deepStrictEqual(
  reward({score:0}),
  {mult:0.5,varietyMult:1,magnetMult:1,baseReward:0,earnedAureos:0,earnedExperience:0},
  'los valores cero deben conservar el modo free predeterminado',
);
assert.deepStrictEqual(
  reward({score:99,gameType:'free'}),
  {mult:0.5,varietyMult:1,magnetMult:1,baseReward:0,earnedAureos:0,earnedExperience:0},
  'un resultado bajo debe redondearse hacia abajo',
);
assert.deepStrictEqual(
  reward({score:1000,gameType:'timed',difficulty:'medium'}),
  {mult:1,varietyMult:1,magnetMult:1,baseReward:10,earnedAureos:20,earnedExperience:30},
  'el resultado medio timed/medium cambió',
);

const perfect = reward({score:5000,pct:100,gameType:'timed',difficulty:'expert'});
assert.deepStrictEqual(
  perfect,
  {mult:1.6,varietyMult:1,magnetMult:1,baseReward:80,earnedAureos:160,earnedExperience:240},
  'el resultado alto timed/expert cambió',
);
assert.deepStrictEqual(
  reward({score:5000,pct:0,gameType:'timed',difficulty:'expert'}),
  perfect,
  'la precisión no debe introducir una recompensa directa inexistente',
);

assert.strictEqual(reward({score:124,gameType:'timed',difficulty:'easy'}).baseReward, 0, 'cambió el límite inferior easy');
assert.strictEqual(reward({score:125,gameType:'timed',difficulty:'easy'}).baseReward, 1, 'cambió el límite exacto easy');
assert.strictEqual(reward({score:1000,gameType:'lives',difficulty:'lives_8'}).baseReward, 8, 'cambió lives_8');
assert.strictEqual(reward({score:1000,gameType:'lives',difficulty:'lives_5'}).baseReward, 10, 'cambió lives_5');
assert.strictEqual(reward({score:1000,gameType:'lives',difficulty:'lives_3'}).baseReward, 13, 'cambió lives_3');
assert.strictEqual(reward({score:1000,gameType:'countdown'}).baseReward, 10, 'cambió countdown');
assert.strictEqual(reward({score:1000,gameType:'streak'}).baseReward, 20, 'cambió streak');
assert.strictEqual(reward({score:1000,gameType:'survival'}).baseReward, 15, 'cambió survival');
assert.strictEqual(reward({score:1000,gameType:'desconocido'}).baseReward, 10, 'el modo desconocido debe conservar multiplicador 1');

assert.deepStrictEqual(
  reward({score:1000,gameType:'timed',difficulty:'medium',aureosBonus:true}),
  {mult:1,varietyMult:1,magnetMult:1.3,baseReward:13,earnedAureos:26,earnedExperience:39},
  'el multiplicador del imán cambió',
);
assert.strictEqual(
  reward({score:150,gameType:'timed',difficulty:'medium',gameMode:'duel',isWinner:true}).baseReward,
  2,
  'el duelo ganador debe duplicar después de aplicar Math.floor',
);

const now = 2_000_000_000_000;
const originalHistory = {'×':now-1000};
const repeated = calculateGameRewards({
  score:1000,gameType:'timed',difficulty:'medium',
  tblResults:{'×':{total:10},'+':{total:5}},
}, {hasPlayer:true,tableHistory:originalHistory,now});
assert.strictEqual(repeated.varietyMult, 0.5, 'tablas repetidas deben aplicar el mínimo de variedad');
assert.deepStrictEqual(repeated.tableHistory, {'×':now,'+':now}, 'debe devolver el historial actualizado');
assert.deepStrictEqual(originalHistory, {'×':now-1000}, 'el cálculo no debe mutar el historial recibido');

const exactCooldown = calculateGameRewards({score:1000,tblResults:{'×':{total:1}}}, {
  hasPlayer:true,tableHistory:{'×':now-TABLE_VARIETY_COOLDOWN_MS},now,
});
assert.strictEqual(exactCooldown.varietyMult, 0.5, 'exactamente 30 minutos todavía cuenta como repetición');
const afterCooldown = calculateGameRewards({score:1000,tblResults:{'×':{total:1}}}, {
  hasPlayer:true,tableHistory:{'×':now-TABLE_VARIETY_COOLDOWN_MS-1},now,
});
assert.strictEqual(afterCooldown.varietyMult, 1, 'más de 30 minutos debe contar como tabla fresca');

const unregistered = calculateGameRewards({score:1000,tblResults:{'×':{total:1}}}, {
  hasPlayer:false,tableHistory:{'×':now},now,
});
assert.strictEqual(unregistered.varietyMult, 1, 'un jugador no registrado no recibe penalización de variedad');
assert.strictEqual(unregistered.tableHistoryChanged, false, 'un jugador no registrado no actualiza historial');

assert.deepStrictEqual(
  calculateDirectGameReward(5.9),
  {baseReward:5,earnedAureos:10,earnedExperience:15},
  'la recompensa directa bomb/survival cambió',
);
assert.deepStrictEqual(
  calculateDirectGameReward(0),
  {baseReward:0,earnedAureos:0,earnedExperience:0},
  'la recompensa directa cero cambió',
);

function assertScoreDoesNotReward(result, message){
  const value=reward(result);
  assert.strictEqual(value.baseReward, 0, `${message}: la recompensa base debe ser 0`);
  assert.strictEqual(value.earnedAureos, 0, `${message}: los Áureos deben ser 0`);
  assert.strictEqual(value.earnedExperience, 0, `${message}: la XP debe ser 0`);
  assert.ok(value.earnedAureos>=0, `${message}: los Áureos no deben ser negativos`);
  assert.ok(value.earnedExperience>=0, `${message}: la XP no debe ser negativa`);
}

assertScoreDoesNotReward(
  {score:-1,gameType:'free'},
  'un score negativo pequeño',
);
assertScoreDoesNotReward(
  {score:-1_000_000,gameType:'free'},
  'un score negativo grande',
);
assertScoreDoesNotReward(
  {score:-1000,gameType:'timed',difficulty:'expert'},
  'un score negativo con multiplicador de dificultad',
);
assertScoreDoesNotReward(
  {score:-1000,gameType:'timed',difficulty:'expert',aureosBonus:true},
  'un score negativo con imán',
);
assertScoreDoesNotReward(
  {score:-1000,gameType:'timed',difficulty:'medium',gameMode:'duel',isWinner:true},
  'un score negativo en duelo ganador',
);

assert.deepStrictEqual(
  reward({score:1000,gameType:'timed',difficulty:'medium'}),
  {mult:1,varietyMult:1,magnetMult:1,baseReward:10,earnedAureos:20,earnedExperience:30},
  'un score positivo normal debe conservar su recompensa',
);

console.log('OK: recompensas acotan scores negativos a cero y conservan modos, multiplicadores, imán, duelo y factores.');
