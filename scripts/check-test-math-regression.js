'use strict';

// Seeded, focused regression set for mathematical test configuration/generation.
// It complements check-math-test-configurations and does not start a server.
const assert = require('node:assert/strict');
const {
  answerQuestion,
  generateConfiguredQuestions,
  validateMathConfiguration,
} = require('../src/server/exams/studentTestFlowService');
const { validateMatrix, validateOpsConfig } = require('../src/client/maestro/tableRanges');

function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}
function digitBounds(digits) { return [digits === 1 ? 1 : 10 ** (digits - 1), 10 ** digits - 1]; }
function hasCarry(a, b) {
  while (a || b) {
    if (a % 10 + b % 10 >= 10) return true;
    a = Math.floor(a / 10); b = Math.floor(b / 10);
  }
  return false;
}
function hasBorrow(a, b) {
  let borrow = 0, found = false;
  while (a || b) {
    if (a % 10 - borrow < b % 10) { borrow = 1; found = true; }
    else borrow = 0;
    a = Math.floor(a / 10); b = Math.floor(b / 10);
  }
  return found;
}
function noCarry(a, b) {
  const left = String(a).padStart(Math.max(String(a).length, String(b).length), '0');
  const right = String(b).padStart(left.length, '0');
  return [...left].every((digit, index) => Number(digit) + Number(right[index]) <= 9);
}
function noBorrow(a, b) {
  const left = String(a).padStart(Math.max(String(a).length, String(b).length), '0');
  const right = String(b).padStart(left.length, '0');
  return [...left].every((digit, index) => Number(digit) >= Number(right[index]));
}
function assertCorrectable(rows, expected) {
  for (const question of rows) {
    assert.equal(question.answer, expected(question), 'generated answer must match independent arithmetic');
    const answer = question.remainder > 0
      ? `${question.answer} residuo ${question.remainder}`
      : String(question.answer);
    assert.equal(answerQuestion(question, answer), true, 'correct response must be accepted');
    assert.equal(answerQuestion(question, String(question.answer + 1)), false, 'incorrect response must be rejected');
  }
}

// Multiplication: quick mode counts tables × per-table quantity and accepts T0/F0.
const quickZero = generateConfiguredQuestions({
  enabledOperations: ['mult'], repeat: false,
  opsConfig: { mult: { mode: 'quick', tables: [0], perTableQty: 3, range: { from: 0, to: 2 }, expansionLimit: 1, manner: 'ordered' } },
}, seededRandom(1101));
assert.deepEqual(quickZero.map(q => [q.a, q.b, q.answer]), [[0, 0, 0], [0, 1, 0], [0, 2, 0]]);
assertCorrectable(quickZero, q => q.a * q.b);

// Exact mode means one generated question per selected matrix cell, including T0/F0.
validateMatrix(['0x0', '5x0', '0x5', '2x4']);
const exactZero = generateConfiguredQuestions({
  enabledOperations: ['mult'], repeat: false,
  opsConfig: { mult: { mode: 'exact', tables: [0, 4, 5], matrix: ['0x0', '5x0', '0x5', '2x4'], expansionLimit: 1, manner: 'ordered' } },
}, seededRandom(1102));
assert.equal(exactZero.length, 4);
assert.deepEqual(new Set(exactZero.map(q => `${q.a}x${q.b}`)), new Set(['0x0', '0x5', '5x0', '4x2']));
assertCorrectable(exactZero, q => q.a * q.b);
const expandedZeroCollision = generateConfiguredQuestions({
  enabledOperations: ['mult'], repeat: false,
  opsConfig: { mult: { mode: 'exact', tables: [0], matrix: ['0x0'], expansionLimit: 1000, manner: 'ordered' } },
}, seededRandom(1103));
assert.equal(expandedZeroCollision.length, 1, 'scale collisions for 0×0 must be deduplicated without changing exact cell count');
assert.equal(expandedZeroCollision[0].a, 0); assert.equal(expandedZeroCollision[0].b, 0);

// Expansion scales ×1/×10/×100/×1000 and ordered versus shuffled base factors.
const expansions = generateConfiguredQuestions({
  enabledOperations: ['mult'], repeat: false,
  opsConfig: { mult: { qty: 16, tables: [5], matrix: ['2x5'], expansionLimit: 1000, manner: 'ordered' } },
}, seededRandom(1104));
assert.equal(expansions.length, 16);
assert.deepEqual(new Set(expansions.map(q => q.scaleLeft)), new Set([1, 10, 100, 1000]));
assert.deepEqual(new Set(expansions.map(q => q.scaleRight)), new Set([1, 10, 100, 1000]));
assert.equal(new Set(expansions.map(q => `${q.a}:${q.b}`)).size, 16);
assertCorrectable(expansions, q => q.a * q.b);
const orderedFactors = generateConfiguredQuestions({
  enabledOperations: ['mult'],
  opsConfig: { mult: { qty: 3, tables: [2], ranges: [{ table: 2, from: 1, to: 3 }], expansionLimit: 1, manner: 'ordered' } },
});
assert.deepEqual(orderedFactors.map(q => q.b), [1, 2, 3]);
const shuffledFactors = generateConfiguredQuestions({
  enabledOperations: ['mult'],
  opsConfig: { mult: { qty: 3, tables: [2], ranges: [{ table: 2, from: 1, to: 3 }], expansionLimit: 1, manner: 'random' } },
}, () => 0);
assert.deepEqual(shuffledFactors.map(q => q.b), [2, 3, 1], 'fixed RNG sequence should shuffle within multiplication reproducibly');
assert.throws(() => generateConfiguredQuestions({ enabledOperations: ['mult'], opsConfig: { mult: { mode: 'quick', tables: [], perTableQty: 1, range: { from: 1, to: 1 } } } }), /selecciona.*tabla|cantidad activa/i);
assert.throws(() => generateConfiguredQuestions({ enabledOperations: ['mult'], opsConfig: { mult: { mode: 'exact', tables: [], matrix: [], expansionLimit: 1 } } }), /matriz|casilla|cantidad activa/i);
assert.throws(() => generateConfiguredQuestions({ enabledOperations: ['mult'], opsConfig: { mult: { qty: 2, tables: [5], matrix: ['2x5'], expansionLimit: 1 } } }), /solo existen 1 ejercicios distintos/i);
const repeatedExpansion = generateConfiguredQuestions({ enabledOperations: ['mult'], repeat: true, opsConfig: { mult: { qty: 2, tables: [5], matrix: ['2x5'], expansionLimit: 1 } } }, seededRandom(1105));
assert.equal(repeatedExpansion.length, 2, 'explicit repetition may satisfy quantity beyond the distinct pool');

// Addition across digit widths and carry modes. Properties below independently
// inspect decimal columns instead of duplicating the generator's construction.
for (const digits of [1, 2, 3, 4]) {
  const [min, max] = digitBounds(digits);
  const direct = generateConfiguredQuestions({ enabledOperations: ['add'], opsConfig: { add: { qty: 8, digits, carryMode: 'direct' } } }, seededRandom(1200 + digits));
  assert(direct.every(q => q.a >= min && q.a <= max && q.b >= min && q.b <= max && noCarry(q.a, q.b)), `direct addition must use ${digits}-digit operands and avoid carries`);
  const carrying = generateConfiguredQuestions({ enabledOperations: ['add'], opsConfig: { add: { qty: 8, digits, carryMode: 'carry' } } }, seededRandom(1300 + digits));
  assert(carrying.every(q => q.a >= min && q.a <= max && q.b >= min && q.b <= max && hasCarry(q.a, q.b)), `carry mode must produce a carry with ${digits}-digit operands`);
  assertCorrectable([...direct, ...carrying], q => q.a + q.b);
}
const independentAddition = generateConfiguredQuestions({ enabledOperations: ['add'], opsConfig: { add: { qty: 12, simpleDigits: false, digitsA: 2, digitsB: 4, carryMode: 'both' } } }, seededRandom(1402));
assert(independentAddition.every(q => q.a >= 10 && q.a <= 99 && q.b >= 1000 && q.b <= 9999));
assert(independentAddition.some(q => hasCarry(q.a, q.b)) && independentAddition.some(q => noCarry(q.a, q.b)), 'mixed addition should include carry and no-carry examples for this fixed seed');

// Subtraction: direct, borrow, mixed, non-negative answer, equal and independent digits.
for (const [digitsA, digitsB] of [[1, 1], [2, 1], [3, 2], [4, 3]]) {
  const [minA, maxA] = digitBounds(digitsA), [minB, maxB] = digitBounds(digitsB);
  const common = { simpleDigits: false, digitsA, digitsB };
  const direct = generateConfiguredQuestions({ enabledOperations: ['sub'], opsConfig: { sub: { ...common, qty: 8, borrowMode: 'direct' } } }, seededRandom(1500 + digitsA * 10 + digitsB));
  assert(direct.every(q => q.a >= minA && q.a <= maxA && q.b >= minB && q.b <= maxB && q.a >= q.b && noBorrow(q.a, q.b)), `direct subtraction must be non-negative and borrow-free (${digitsA}/${digitsB})`);
  assertCorrectable(direct, q => q.a - q.b);
  if (digitsA > 1) {
    const borrowed = generateConfiguredQuestions({ enabledOperations: ['sub'], opsConfig: { sub: { ...common, qty: 8, borrowMode: 'borrow' } } }, seededRandom(1600 + digitsA * 10 + digitsB));
    assert(borrowed.every(q => q.a >= minA && q.a <= maxA && q.b >= minB && q.b <= maxB && q.a >= q.b && hasBorrow(q.a, q.b)), `borrow mode must preserve widths, non-negative results, and a real borrow (${digitsA}/${digitsB})`);
    assert.equal(new Set(borrowed.map(q => `${q.a}:${q.b}`)).size, borrowed.length, 'repeats off must yield distinct subtraction pairs');
    assertCorrectable(borrowed, q => q.a - q.b);
  }
}
assert.throws(() => generateConfiguredQuestions({ enabledOperations: ['sub'], opsConfig: { sub: { qty: 1, digitsA: 1, digitsB: 1, simpleDigits: false, borrowMode: 'borrow' } } }), /pr[eé]stamo|no existen/i);
assert.throws(() => generateConfiguredQuestions({ enabledOperations: ['sub'], opsConfig: { sub: { qty: 46, digits: 1, borrowMode: 'direct' } } }), /solo existen 45/i);
const mixedSubtraction = generateConfiguredQuestions({ enabledOperations: ['sub'], opsConfig: { sub: { qty: 50, digits: 2, borrowMode: 'both' } } }, seededRandom(1702));
assert(mixedSubtraction.every(q => q.a >= q.b));
assert(mixedSubtraction.some(q => hasBorrow(q.a, q.b)) && mixedSubtraction.some(q => noBorrow(q.a, q.b)), 'mixed subtraction should include borrowed and borrow-free examples for this fixed seed');

// Division: concrete/additional and digit-based divisors, exact/remainder/mixed,
// independent arithmetic checks, response formatting and answer-mode limits.
const specificDiv = generateConfiguredQuestions({ enabledOperations: ['div'], repeat: true, answerMode: 'write', opsConfig: { div: { qty: 30, divisorMode: 'specific', divisors: [3, 7, 13], dividendDigits: 3, remainderMode: 'mixed' } } }, seededRandom(1801));
assert(specificDiv.every(q => [3, 7, 13].includes(q.b) && q.b > 0 && q.a >= 100 && q.a <= 999 && q.answer === Math.floor(q.a / q.b) && q.remainder === q.a % q.b));
assert(specificDiv.some(q => q.remainder === 0) && specificDiv.some(q => q.remainder > 0));
assertCorrectable(specificDiv, q => Math.floor(q.a / q.b));
const digitDiv = generateConfiguredQuestions({ enabledOperations: ['div'], repeat: true, answerMode: 'write', opsConfig: { div: { qty: 30, divisorMode: 'digits', divisorDigits: 2, dividendDigits: 4, remainderMode: 'remainder' } } }, seededRandom(1802));
assert(digitDiv.every(q => q.b >= 10 && q.b <= 99 && q.a >= 1000 && q.a <= 9999 && q.b !== 0 && q.remainder > 0 && q.remainder === q.a % q.b && q.answer === Math.floor(q.a / q.b)));
const remainderQuestion = digitDiv[0];
assert.equal(answerQuestion(remainderQuestion, `${remainderQuestion.answer} r ${remainderQuestion.remainder}`), true);
assert.equal(answerQuestion(remainderQuestion, `${remainderQuestion.answer}, ${remainderQuestion.remainder}`), true);
assert.equal(answerQuestion(remainderQuestion, `${remainderQuestion.answer} r ${remainderQuestion.remainder + 1}`), false);
assert.throws(() => generateConfiguredQuestions({ enabledOperations: ['div'], answerMode: 'voice', opsConfig: { div: { qty: 1, divisorMode: 'specific', divisors: [3], dividendDigits: 2, remainderMode: 'remainder' } } }), /voz/i);
assert.throws(() => generateConfiguredQuestions({ enabledOperations: ['div'], answerMode: 'options', opsConfig: { div: { qty: 1, divisorMode: 'specific', divisors: [3], dividendDigits: 2, remainderMode: 'mixed' } } }), /opciones/i);
assert.throws(() => generateConfiguredQuestions({ enabledOperations: ['div'], opsConfig: { div: { qty: 1, divisorMode: 'specific', divisors: [0], dividendDigits: 2, remainderMode: 'exact' } } }), /divisor|no hay divisiones/i);
assert.throws(() => validateOpsConfig({ div: { matrix: ['0x3'] } }), /division matrix cannot contain zero/i);

// Combination/order and total boundaries. This samples one four-operation
// configuration rather than enumerating a Cartesian product of all settings.
const fourOps = {
  enabledOperations: ['mult', 'add', 'sub', 'div'], operationOrder: ['div', 'sub', 'add', 'mult'], order: 'ordered', repeat: true,
  opsConfig: {
    mult: { mode: 'quick', tables: [2], perTableQty: 1, range: { from: 1, to: 1 }, expansionLimit: 1 },
    add: { qty: 1, digits: 2, carryMode: 'direct' },
    sub: { qty: 1, digits: 2, borrowMode: 'direct' },
    div: { qty: 1, divisorMode: 'specific', divisors: [2], dividendDigits: 2, remainderMode: 'exact' },
  },
};
const orderedFour = generateConfiguredQuestions(fourOps, seededRandom(1901));
assert.equal(orderedFour.length, 4);
const operationName = q => q.remainder !== undefined ? 'div' : q.scaleLeft !== undefined ? 'mult' : q.answer === q.a + q.b ? 'add' : 'sub';
assert.deepEqual(orderedFour.map(operationName), ['div', 'sub', 'add', 'mult']);
assertCorrectable(orderedFour, q => q.op === '×' ? q.a * q.b : q.op === '+' ? q.a + q.b : q.op === '−' ? q.a - q.b : Math.floor(q.a / q.b));
function boundaryConfig(total) {
  if (total === 1) return { enabledOperations: ['add'], opsConfig: { add: { qty: 1, digits: 1, carryMode: 'both' } } };
  const each = [Math.floor(total / 4), Math.floor(total / 4), Math.floor(total / 4), total - 3 * Math.floor(total / 4)];
  return {
    enabledOperations: ['mult', 'add', 'sub', 'div'], repeat: true,
    opsConfig: {
      mult: { mode: 'quick', tables: [0], perTableQty: each[0], range: { from: 0, to: 0 }, expansionLimit: 1 },
      add: { qty: each[1], digits: 2, carryMode: 'direct' },
      sub: { qty: each[2], digits: 2, borrowMode: 'direct' },
      div: { qty: each[3], divisorMode: 'specific', divisors: [2], dividendDigits: 2, remainderMode: 'exact' },
    },
  };
}
for (const total of [1, 99, 100]) {
  const config = boundaryConfig(total);
  assert.equal(validateMathConfiguration(config), true);
  assert.equal(generateConfiguredQuestions(config, seededRandom(2000 + total)).length, total);
}
assert.throws(() => validateMathConfiguration(boundaryConfig(101)), /entre 1 y 100/i);
assert.throws(() => validateMathConfiguration({ enabledOperations: ['add'], opsConfig: { add: { qty: 101, digits: 2 } } }), /entre 1 y 100/i);

console.log('OK regresión matemática dirigida: cuatro operaciones, límites, ceros, residuos, corrección y propiedades por columna.');
