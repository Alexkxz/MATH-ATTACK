'use strict';

const assert = require('assert');
const { ACHIEVEMENTS_DEF, checkNewAchievements } = require('../src/game/achievements');

assert.deepStrictEqual(
  ACHIEVEMENTS_DEF,
  [
    { id:'perfect', icon:'💯', name:'Perfección', desc:'100% precisión en una partida', bonus:50 },
    { id:'streak20', icon:'🔥', name:'Racha ×20', desc:'20 respuestas seguidas correctas', bonus:30 },
    { id:'master_mult', icon:'✖️', name:'Maestro ×', desc:'90%+ acumulado en Multiplicación (mín. 10 resp.)', bonus:100 },
    { id:'master_add', icon:'➕', name:'Maestro +', desc:'90%+ acumulado en Suma (mín. 10 resp.)', bonus:100 },
    { id:'master_sub', icon:'➖', name:'Maestro −', desc:'90%+ acumulado en Resta (mín. 10 resp.)', bonus:100 },
    { id:'master_div', icon:'➗', name:'Maestro ÷', desc:'90%+ acumulado en División (mín. 10 resp.)', bonus:100 },
  ],
  'las definiciones de logros cambiaron',
);

const blockedPlayer = {};
assert.deepStrictEqual(
  checkNewAchievements(blockedPlayer, { name: 'Ana', pct: 99, total: 20, streak: 19 }, []),
  [],
  'un logro bloqueado no debe desbloquearse',
);
assert.deepStrictEqual(blockedPlayer.achievements, [], 'debe conservar la inicialización del arreglo de logros');

const perfectPlayer = { achievements: [] };
assert.deepStrictEqual(
  checkNewAchievements(perfectPlayer, { name: 'Ana', pct: 100, total: 5 }, []),
  ['perfect'],
  'Perfección debe desbloquearse en el límite actual',
);
assert.deepStrictEqual(perfectPlayer.achievements, ['perfect'], 'el logro nuevo debe registrarse en el jugador');
assert.deepStrictEqual(
  checkNewAchievements(perfectPlayer, { name: 'Ana', pct: 100, total: 10 }, []),
  [],
  'un logro existente no debe desbloquearse ni recompensarse otra vez',
);

const multiplePlayer = { achievements: [] };
const multipleResult = {
  name: 'Luis', pct: 100, total: 20, streak: 20,
  tblResults: { '×': { correct: 10, wrong: 0 } },
};
assert.deepStrictEqual(
  checkNewAchievements(multiplePlayer, multipleResult, [multipleResult]),
  ['perfect', 'streak20', 'master_mult'],
  'debe devolver varios logros aplicables en el orden existente',
);

const cumulativePlayer = { achievements: [] };
const currentCumulativeResult = {
  name: 'Marta', pct: 0, total: 0,
  tblResults: { '+': { correct: 1, wrong: 0 } },
};
const history = [
  { name: 'MARTA', tblResults: { '+': { c: 8, w: 1 } } },
  currentCumulativeResult,
];
assert.deepStrictEqual(
  checkNewAchievements(cumulativePlayer, currentCumulativeResult, history),
  ['master_add'],
  'el logro acumulado debe conservar comparación de nombre, aliases c/w y umbral de 90%',
);

const subtractionResult = {
  name: 'Sara', pct: 0, total: 0,
  tblResults: { '−': { correct: 9, wrong: 1 } },
};
assert.deepStrictEqual(
  checkNewAchievements({ achievements: [] }, subtractionResult, [subtractionResult]),
  ['master_sub'],
  'Resta debe conservar su símbolo y umbral de logro',
);

// Caso A: save_result ya agregó la partida actual al ranking. Sus 5 respuestas deben
// contabilizarse una sola vez, no como 10 por duplicación interna.
const duplicatedCurrentPlayer = { achievements: [] };
const currentResult = {
  name: 'Eva', pct: 0, total: 0,
  tblResults: { '÷': { correct: 5, wrong: 0 } },
};
assert.deepStrictEqual(
  checkNewAchievements(duplicatedCurrentPlayer, currentResult, [currentResult]),
  [],
  '5 respuestas de la partida ya incluida no deben interpretarse como 10',
);

// Caso B: con 10 respuestas válidas reales el logro sí puede desbloquearse.
const qualifyingResult = {
  name: 'Eva', pct: 0, total: 0,
  tblResults: { '÷': { correct: 9, wrong: 1 } },
};
assert.deepStrictEqual(
  checkNewAchievements(duplicatedCurrentPlayer, qualifyingResult, [qualifyingResult]),
  ['master_div'],
  '10 respuestas válidas al 90% deben desbloquear el logro',
);

// Caso C: un logro ya registrado no debe volver a devolverse ni recompensarse.
assert.deepStrictEqual(
  checkNewAchievements(duplicatedCurrentPlayer, qualifyingResult, [qualifyingResult]),
  [],
  'el logro de dominio no debe recompensarse dos veces',
);
assert.deepStrictEqual(
  duplicatedCurrentPlayer.achievements,
  ['master_div'],
  'el logro de dominio debe permanecer registrado una sola vez',
);

// CHECKPOINT-001, caso A: un checkpoint abandonado no completa el umbral.
const checkpointPlayer = { achievements: [] };
const abandonedCheckpoint = {
  id:'abandoned',name:'Nora',complete:false,
  tblResults:{'×':{correct:9,wrong:0,total:9}},
};
const laterCompletedResult = {
  id:'later',name:'Nora',complete:true,pct:100,total:1,
  tblResults:{'×':{correct:1,wrong:0,total:1}},
};
assert.deepStrictEqual(
  checkNewAchievements(checkpointPlayer,laterCompletedResult,[laterCompletedResult,abandonedCheckpoint]),
  [],
  'CHECKPOINT-001 A: complete:false no debe contribuir al logro acumulado',
);

// Caso B: dos resultados realmente completos sí pueden sumar las 10 respuestas.
const validCumulativePlayer = { achievements: [] };
const completedNine = {
  id:'complete-nine',name:'Olga',complete:true,
  tblResults:{'×':{correct:9,wrong:0,total:9}},
};
const completedOne = {
  id:'complete-one',name:'Olga',complete:true,pct:100,total:1,
  tblResults:{'×':{correct:1,wrong:0,total:1}},
};
assert.deepStrictEqual(
  checkNewAchievements(validCumulativePlayer,completedOne,[completedOne,completedNine]),
  ['master_mult'],
  'CHECKPOINT-001 B: resultados completos válidos deben seguir acumulándose',
);

// Caso C: la ausencia legada de `complete` conserva su semántica de resultado completo.
const legacyPlayer = { achievements: [] };
const legacyNine = {
  id:'legacy-nine',name:'Iris',
  tblResults:{'+':{correct:9,wrong:0,total:9}},
};
const currentOne = {
  id:'current-one',name:'Iris',complete:true,pct:100,total:1,
  tblResults:{'+':{correct:1,wrong:0,total:1}},
};
assert.deepStrictEqual(
  checkNewAchievements(legacyPlayer,currentOne,[currentOne,legacyNine]),
  ['master_add'],
  'CHECKPOINT-001 C: un registro legado sin complete debe seguir contando como completo',
);

// Caso D: ni los resultados completos ni los legados conceden el mismo logro dos veces.
assert.deepStrictEqual(
  checkNewAchievements(legacyPlayer,currentOne,[currentOne,legacyNine]),
  [],
  'CHECKPOINT-001 D: el logro acumulado no debe concederse dos veces',
);

console.log('OK: logros excluyen complete:false y conservan acumulación completa, compatibilidad legada y concesión única.');
