'use strict';

const assert = require('assert');
const { generateConfiguredQuestions, totalQuestionCount, validateMathConfiguration, answerQuestion } = require('../src/server/exams/studentTestFlowService');
const { validateOpsConfig } = require('../src/client/maestro/tableRanges');

const config = (mult, extra = {}) => ({
  enabledOperations: ['mult'],
  operationOrder: ['mult'],
  order: 'ordered',
  repeat: false,
  opsConfig: { mult },
  ...extra,
});

const quick = config({ mode: 'quick', tables: [3, 5], quickTables: [3, 5], range: { from: 4, to: 7 }, perTableQty: 4, expansionLimit: 1, manner: 'ordered' });
validateMathConfiguration(quick);
assert.strictEqual(totalQuestionCount(quick), 8, 'dos tablas por cuatro ejercicios deben sumar ocho');
const quickQuestions = generateConfiguredQuestions(quick, () => 0.27);
assert.strictEqual(quickQuestions.length, 8);
assert.deepStrictEqual(quickQuestions.reduce((counts, question) => ({ ...counts, [question.baseTable]: (counts[question.baseTable] || 0) + 1 }), {}), { 3: 4, 5: 4 });
assert(quickQuestions.every(question => question.baseFactor >= 4 && question.baseFactor <= 7));
assert.strictEqual(new Set(quickQuestions.map(question => `${question.a}:${question.b}`)).size, 8, 'sin repetición, todas las preguntas deben ser distintas');

const exact = config({ mode: 'exact', tables: [5, 7], quickTables: [3, 5], range: { from: 4, to: 7 }, perTableQty: 4, matrix: ['2x5', '8x5', '3x7'], expansionLimit: 1000, manner: 'ordered' });
validateMathConfiguration(exact);
assert.strictEqual(totalQuestionCount(exact), 3, 'el modo exacto cuenta casillas, no escalas');
const exactQuestions = generateConfiguredQuestions(exact, () => 0.31);
assert.strictEqual(exactQuestions.length, 3);
assert.deepStrictEqual(exactQuestions.map(question => `${question.baseFactor}x${question.baseTable}`), ['2x5', '8x5', '3x7']);
assert(exactQuestions.every(question => question.scaleLeft <= 1000 && question.scaleRight <= 1000));
assert(exactQuestions.some(question => question.scaleLeft > 1 || question.scaleRight > 1), 'la ampliación debe poder cambiar operandos sin aumentar la cantidad');
assert.strictEqual(new Set(exactQuestions.map(question => `${question.a}:${question.b}`)).size, 3);

const zeroQuick = config({ mode: 'quick', tables: [0], quickTables: [0], range: { from: 0, to: 2 }, perTableQty: 3, expansionLimit: 1, manner: 'ordered' });
validateMathConfiguration(zeroQuick);
assert.strictEqual(totalQuestionCount(zeroQuick), 3);
const zeroQuickQuestions = generateConfiguredQuestions(zeroQuick, () => 0.25);
assert.deepStrictEqual(zeroQuickQuestions.map(question => `${question.a}:${question.b}:${question.answer}`).sort(), ['0:0:0', '0:1:0', '0:2:0']);
assert(zeroQuickQuestions.every(question => answerQuestion(question, '0')));

const zeroExact = config({ mode: 'exact', tables: [0, 5], matrix: ['5x0', '0x5', '0x0'], expansionLimit: 1000, manner: 'ordered' });
validateMathConfiguration(zeroExact);
assert.strictEqual(totalQuestionCount(zeroExact), 3, 'cada casilla exacta sigue contando una pregunta, sin multiplicar por las escalas');
const zeroExactQuestions = generateConfiguredQuestions(zeroExact, () => 0.1);
assert.deepStrictEqual(zeroExactQuestions.map(question => `${question.baseFactor}x${question.baseTable}`).sort(), ['0x0', '0x5', '5x0']);
assert(zeroExactQuestions.every(question => question.answer === 0 && answerQuestion(question, 0)), 'la respuesta cero debe corregirse como correcta aun con ampliaciones aleatorias');

const zeroExpandedQuick = config({ mode: 'quick', tables: [0], range: { from: 0, to: 2 }, perTableQty: 9, expansionLimit: 1000, manner: 'ordered' });
const zeroExpandedQuestions = generateConfiguredQuestions(zeroExpandedQuick, () => 0.2);
assert.strictEqual(zeroExpandedQuestions.length, 9, 'las ampliaciones de cero no deben duplicar operandos');
assert.strictEqual(new Set(zeroExpandedQuestions.map(question => `${question.a}:${question.b}`)).size, 9);
assert.throws(() => validateMathConfiguration(config({ mode: 'quick', tables: [0], range: { from: 0, to: 0 }, perTableQty: 2, expansionLimit: 1000 })), /solo tiene 1 ejercicios distintos/, 'no se debe inflar silenciosamente la capacidad de 0 por 0');

const zeroLegacy = config({ tables: [0], ranges: [{ table: 0, from: 0, to: 2 }], qty: 3, expansionLimit: 1, manner: 'ordered' });
validateMathConfiguration(zeroLegacy);
assert.deepStrictEqual(generateConfiguredQuestions(zeroLegacy, () => 0.2).map(question => [question.a, question.b]), [[0, 0], [0, 1], [0, 2]], 'el contrato anterior con rangos conserva su significado');
assert.throws(() => validateMathConfiguration({ enabledOperations: ['div'], opsConfig: { div: { qty: 1, divisorMode: 'specific', divisors: [0], dividendDigits: 2, remainderMode: 'exact' } } }), /divisores concretos deben ser de 1 a 9999/);
assert.throws(() => validateOpsConfig({ div: { ranges: [{ table: 0, from: 1, to: 2 }] } }), /table out of bounds/);

assert.throws(() => validateMathConfiguration(config({ mode: 'quick', tables: [2], range: { from: 4, to: 4 }, perTableQty: 2, expansionLimit: 1 })), /solo tiene 1 ejercicios distintos/, 'sin repetición se comprueba la capacidad de cada tabla');
const repeat = config({ mode: 'quick', tables: [2], range: { from: 4, to: 4 }, perTableQty: 2, expansionLimit: 1 }, { repeat: true });
validateMathConfiguration(repeat);
assert.strictEqual(generateConfiguredQuestions(repeat, () => 0).length, 2, 'las repeticiones solo se permiten cuando están activadas');
assert.throws(() => validateMathConfiguration(config({ mode: 'quick', tables: Array.from({ length: 12 }, (_, index) => index + 1), range: { from: 1, to: 12 }, perTableQty: 9 })), /entre 1 y 100/, 'no se debe truncar silenciosamente el total global');

const oldReact = config({ quantityMode: 'total', qty: 10, tables: [2, 3], ranges: [{ table: 2, from: 1, to: 12 }, { table: 3, from: 1, to: 12 }], expansionLimit: 1 });
assert.strictEqual(totalQuestionCount(oldReact), 10, 'la configuración React anterior conserva su total agregado');
assert.strictEqual(generateConfiguredQuestions(oldReact, () => 0.42).length, 10);

console.log('OK: multiplicación rápida/exacta, rango compartido, cantidad por tabla/casilla, ampliaciones, repeticiones, capacidad y contrato React anterior.');
