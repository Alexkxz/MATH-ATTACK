'use strict';

const assert = require('assert');
const { generateConfiguredQuestions } = require('../src/server/exams/studentTestFlowService');
const { validateOpsConfig } = require('../src/client/maestro/tableRanges');
const seededRandom = seed => {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
};
const hasBorrow = (a, b) => {
  let borrow = 0;
  let found = false;
  while (a || b) {
    if (a % 10 - borrow < b % 10) {
      borrow = 1;
      found = true;
    } else {
      borrow = 0;
    }
    a = Math.floor(a / 10);
    b = Math.floor(b / 10);
  }
  return found;
};

const multiplication = generateConfiguredQuestions({ opsConfig: { mult: { tables: [4], ranges: [{ table: 4, from: 2, to: 3 }], qty: 2, manner: 'ordered' } } });
assert.deepStrictEqual(multiplication.map(q => [q.a, q.b, q.answer]), [[4, 2, 8], [4, 3, 12]]);
const repeatedOrdered = generateConfiguredQuestions({ opsConfig: { mult: { tables: [2], qty: 5, ranges: [{ table: 2, from: 2, to: 4 }], repeat: true, manner: 'ordered' } } });
assert.deepStrictEqual(repeatedOrdered.map(q => q.b), [2, 3, 4, 2, 3]);
const repeatedRandom = generateConfiguredQuestions({ opsConfig: { mult: { tables: [2], qty: 5, ranges: [{ table: 2, from: 2, to: 4 }], repeat: true, manner: 'random' } } }, seededRandom(11));
assert.strictEqual(repeatedRandom.length, 5);
assert(repeatedRandom.every(q => q.b >= 2 && q.b <= 4), 'el modo aleatorio debe respetar el rango aun con repeticion');

// Current division contract selects concrete divisors and dividend digit count;
// it does not use multiplication-style quotient ranges. Feed three distinct
// exact quotients deterministically, then assert the configured divisor order.
const divisionRandomValues = [0, 0.01, 0, 0.04, 0, 0.08];
let divisionRandomIndex = 0;
const division = generateConfiguredQuestions({
  enabledOperations: ['div'],
  order: 'ordered',
  opsConfig: { div: { qty: 3, divisorMode: 'specific', divisors: [3], dividendDigits: 2, remainderMode: 'exact', manner: 'ordered' } },
}, () => divisionRandomValues[divisionRandomIndex++ % divisionRandomValues.length]);
assert.deepStrictEqual(division.map(q => [q.a, q.b, q.answer]), [[12, 3, 4], [15, 3, 5], [18, 3, 6]]);

const addition = generateConfiguredQuestions({ opsConfig: { add: { qty: 4, digits: 2, carryMode: 'direct' } } }, seededRandom(101));
assert(addition.every(q => q.a >= 10 && q.a <= 99 && q.b >= 10 && q.b <= 99));
assert(addition.every(q => String(q.a).split('').every((digit, index) => Number(digit) + Number(String(q.b)[index]) <= 9)));

const subtraction = generateConfiguredQuestions({ opsConfig: { sub: { qty: 4, digits: 2, carryMode: 'direct' } } }, seededRandom(202));
assert(subtraction.every(q => q.a >= q.b));
assert(subtraction.every(q => String(q.a).split('').every((digit, index) => Number(digit) >= Number(String(q.b).padStart(2, '0')[index]))));

const both = generateConfiguredQuestions({ opsConfig: { add: { qty: 8, digits: 2, carryMode: 'both' } } }, seededRandom(303));
assert.strictEqual(both.length, 8);
const carries = generateConfiguredQuestions({ opsConfig: { add: { qty: 4, digits: 2, carryMode: 'carry' } } }, seededRandom(404));
assert(carries.every(q => Number(String(q.a)[0]) + Number(String(q.b)[0]) >= 10 || Number(String(q.a)[1]) + Number(String(q.b)[1]) >= 10));
for (const seed of [505, 606, 707, 808]) {
  const borrows = generateConfiguredQuestions({ opsConfig: { sub: { qty: 4, digits: 2, borrowMode: 'borrow' } } }, seededRandom(seed));
  assert.strictEqual(borrows.length, 4, 'borrow mode must preserve the requested quantity');
  assert.strictEqual(new Set(borrows.map(q => `${q.a}:${q.b}`)).size, 4, 'borrow mode must provide distinct exercises when repeats are off');
  assert(borrows.every(q => q.a >= 10 && q.a <= 99 && q.b >= 10 && q.b <= 99), 'borrow mode must preserve operand digit counts');
  assert(borrows.every(q => q.a >= q.b), 'borrow-mode subtraction must remain non-negative');
  assert(borrows.every(q => hasBorrow(q.a, q.b)), 'borrow mode must contain at least one actual decimal borrow');
}
const independentBorrow = generateConfiguredQuestions({ opsConfig: { sub: { qty: 4, simpleDigits: false, digitsA: 3, digitsB: 2, borrowMode: 'borrow' } } }, seededRandom(818));
assert.strictEqual(independentBorrow.length, 4, 'independent operand digits must preserve requested quantity');
assert(independentBorrow.every(q => q.a >= 100 && q.a <= 999 && q.b >= 10 && q.b <= 99), 'independent borrow mode must preserve each operand digit count');
assert(independentBorrow.every(q => q.a >= q.b && hasBorrow(q.a, q.b)), 'independent borrow mode must remain non-negative and contain a real borrow');
const oneDigitMixed = generateConfiguredQuestions({ opsConfig: { sub: { qty: 4, digits: 1, borrowMode: 'both' } } }, seededRandom(909));
assert.strictEqual(oneDigitMixed.length, 4, 'one-digit mixed subtraction must still support valid non-borrow exercises');
assert(oneDigitMixed.every(q => q.a >= q.b && q.a >= 1 && q.a <= 9 && q.b >= 1 && q.b <= 9));
assert.throws(() => generateConfiguredQuestions({ opsConfig: { sub: { qty: 1, digits: 1, borrowMode: 'borrow' } } }, seededRandom(1001)), /pr[eé]stamo|no existen/i, 'one-digit borrowing is impossible');
assert.throws(() => generateConfiguredQuestions({ opsConfig: { sub: { qty: 46, digits: 1, borrowMode: 'direct' } } }, seededRandom(1002)), /solo existen 45/, 'one-digit direct subtraction has exactly 45 distinct ordered pairs');
assert.throws(() => validateOpsConfig({ add: { digits: 5 } }), /invalid add digits/);
assert.throws(() => validateOpsConfig({ sub: { carryMode: 'unknown' } }), /invalid sub carry mode/);
assert.doesNotThrow(() => validateOpsConfig({ div: { tables: [3], ranges: [{ table: 3, from: 2, to: 4 }], digits: 4 } }));

console.log('OK generacion por operacion: multiplicacion, division, suma y resta');
