'use strict';

const assert = require('assert');
const { calculateDailyStreak } = require('../src/game/dailyStreak');

const localDate = (year, month, day) => new Date(year, month - 1, day, 12, 0, 0);
const dateText = date => date.toLocaleDateString('es-MX');

const firstDate = localDate(2026, 1, 10);
const first = calculateDailyStreak(undefined, firstDate);
assert.deepStrictEqual(first, {
  dailyStreak: { current: 1, best: 1, lastDate: dateText(firstDate) },
  bonus: 5,
}, 'la primera actividad debe iniciar la racha con bono 5');

const sameDayInput = { current: 4, best: 6, lastDate: dateText(firstDate) };
const sameDay = calculateDailyStreak(sameDayInput, firstDate);
assert.deepStrictEqual(sameDay, { dailyStreak: sameDayInput, bonus: 0 }, 'una segunda partida el mismo día no debe avanzar la racha');
assert.notStrictEqual(sameDay.dailyStreak, sameDayInput, 'el cálculo no debe mutar el objeto recibido');

const nextDate = localDate(2026, 1, 11);
assert.deepStrictEqual(
  calculateDailyStreak({ current: 1, best: 1, lastDate: dateText(firstDate) }, nextDate),
  { dailyStreak: { current: 2, best: 2, lastDate: dateText(nextDate) }, bonus: 5 },
  'el día consecutivo debe incrementar la racha',
);

let streak;
const bonuses = [];
for (let day = 1; day <= 30; day++) {
  const result = calculateDailyStreak(streak, localDate(2026, 3, day));
  streak = result.dailyStreak;
  bonuses.push(result.bonus);
}
assert.strictEqual(streak.current, 30, 'debe acumular varios días consecutivos');
assert.deepStrictEqual(
  [bonuses[0], bonuses[1], bonuses[2], bonuses[6], bonuses[29]],
  [5, 5, 15, 50, 200],
  'los límites de bonos de 1, 3, 7 y 30 días cambiaron',
);

const interruptedDate = localDate(2026, 4, 10);
assert.deepStrictEqual(
  calculateDailyStreak({ current: 8, best: 12, lastDate: dateText(localDate(2026, 4, 7)) }, interruptedDate),
  { dailyStreak: { current: 1, best: 12, lastDate: dateText(interruptedDate) }, bonus: 5 },
  'una interrupción de más de un día debe reiniciar current y conservar best',
);

const newYear = localDate(2027, 1, 1);
assert.deepStrictEqual(
  calculateDailyStreak({ current: 2, best: 2, lastDate: dateText(localDate(2026, 12, 31)) }, newYear),
  { dailyStreak: { current: 3, best: 3, lastDate: dateText(newYear) }, bonus: 15 },
  'el límite entre años debe tratarse como día consecutivo',
);

const legacyDate = localDate(2026, 5, 2);
assert.deepStrictEqual(
  calculateDailyStreak({ lastDate: dateText(localDate(2026, 5, 1)) }, legacyDate),
  { dailyStreak: { current: 1, best: 1, lastDate: dateText(legacyDate) }, bonus: 5 },
  'los valores antiguos sin current ni best deben conservar sus fallbacks',
);

const yesterdayText = dateText(localDate(2026, 5, 1));
const legacyTextCases = [
  { current:'0', expectedCurrent:1, expectedBonus:5 },
  { current:'1', expectedCurrent:2, expectedBonus:5 },
  { current:'2', expectedCurrent:3, expectedBonus:15 },
  { current:'6', expectedCurrent:7, expectedBonus:50 },
  { current:'29', expectedCurrent:30, expectedBonus:200 },
];
legacyTextCases.forEach(({current,expectedCurrent,expectedBonus})=>{
  assert.deepStrictEqual(
    calculateDailyStreak({ current, best: current, lastDate: yesterdayText }, legacyDate),
    {
      dailyStreak: { current: expectedCurrent, best: expectedCurrent, lastDate: dateText(legacyDate) },
      bonus: expectedBonus,
    },
    `current="${current}" debe normalizarse antes de incrementar y calcular el bono`,
  );
});

assert.deepStrictEqual(
  calculateDailyStreak({ current: 4, best: 8, lastDate: yesterdayText }, legacyDate),
  { dailyStreak: { current: 5, best: 8, lastDate: dateText(legacyDate) }, bonus: 15 },
  'un valor numérico normal debe conservar su comportamiento',
);

assert.deepStrictEqual(
  calculateDailyStreak({ current: 'no-numérico', best: 'inválido', lastDate: yesterdayText }, legacyDate),
  { dailyStreak: { current: 1, best: 1, lastDate: dateText(legacyDate) }, bonus: 5 },
  'los valores legados no numéricos deben usar un fallback seguro sin conceder bonos indebidos',
);

const sameDayLegacy = calculateDailyStreak({ current: '2', best: '6', lastDate: dateText(legacyDate) }, legacyDate);
assert.deepStrictEqual(
  sameDayLegacy,
  { dailyStreak: { current: 2, best: 6, lastDate: dateText(legacyDate) }, bonus: 0 },
  'la salida del mismo día también debe normalizar valores de texto sin conceder bono',
);

console.log('OK: racha diaria normaliza datos legados y conserva primera actividad, bonos, cortes y días consecutivos.');
